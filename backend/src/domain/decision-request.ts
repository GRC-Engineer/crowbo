import { z } from "zod";
import { accessSubject } from "./access";
import { cmpDec, decShape, formatDec, mulDec, parseDec } from "./decimal";
import { DAY, isoDate } from "./time";

/** One evidence-bound decision and its optional, attributed expected-loss calculation. */

export const sourceId = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(1000);

/** Non-negative decimal kept in Python `str(Decimal)` form, e.g. "2.5". */
export const amount = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    const d = parseDec(value);
    const { digits, places } = decShape(d);
    if (d.coefficient < 0n) throw new Error("must be non-negative");
    if (digits > 24 || places > 8) throw new Error("too many digits");
    return formatDec(d);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: `Invalid amount: ${(error as Error).message}` });
    return z.NEVER;
  }
});

export const provenance = z
  .strictObject({
    kind: z.enum(["source_assertion", "operator_assertion", "counterfactual"]),
    attributed_to: z.string().min(1).max(300),
    basis: z.string().min(1).max(2000),
    source_ids: z.array(sourceId).max(15).default([]),
  })
  .superRefine((p, ctx) => {
    if (p.kind === "source_assertion" && !p.source_ids.length) {
      ctx.addIssue({ code: "custom", message: "source assertions require selected evidence" });
    }
    if (new Set(p.source_ids).size !== p.source_ids.length) ctx.addIssue({ code: "custom", message: "duplicate provenance source" });
  });

export const riskEstimate = z
  .strictObject({ value: amount, provenance, low: amount.nullable().default(null), high: amount.nullable().default(null) })
  .superRefine((e, ctx) => {
    if ((e.low === null) !== (e.high === null)) {
      ctx.addIssue({ code: "custom", message: "sensitivity bounds require both low and high" });
    } else if (e.low !== null && e.high !== null) {
      const [low, value, high] = [parseDec(e.low), parseDec(e.value), parseDec(e.high)];
      if (cmpDec(low, value) > 0 || cmpDec(value, high) > 0) {
        ctx.addIssue({ code: "custom", message: "sensitivity bounds must contain the stated value" });
      }
    }
  });
export type RiskEstimate = z.infer<typeof riskEstimate>;

export const riskInputs = z.strictObject({
  scenario: text,
  currency: z.string().regex(/^[A-Z]{3}$/),
  annual_frequency: riskEstimate.nullable().default(null),
  mean_loss_per_event: riskEstimate.nullable().default(null),
});
export type RiskInputs = z.infer<typeof riskInputs>;

export const counterfactual = z.strictObject({
  label: text,
  attributed_to: z.string().min(1).max(300),
  changes: z.string().min(1).max(4000),
});

export const decisionRequest = z
  .strictObject({
    case_id: z.string().min(1).max(100).default("ad-hoc"),
    case_version: z.string().min(1).max(100).default("1"),
    question: z.string().min(1).max(4000),
    source_ids: z.array(sourceId).min(1).max(15),
    expected_revisions: z.record(sourceId, sourceId).default({}),
    subject: text,
    scope: text,
    window_start: isoDate,
    window_end: isoDate,
    objectives: z.array(text).min(1).max(10),
    accountable_owner: z.string().min(1).max(300).nullable().default(null),
    context: z.string().max(10000).default(""),
    counterfactual: counterfactual.nullable().default(null),
    risk: riskInputs.nullable().default(null),
    prior_feedback_id: sourceId.nullable().default(null),
    method: z.enum(["crowbo", "plain", "crowbo_without_jev"]).default("crowbo"),
    access: accessSubject.nullable().default(null),
  })
  .superRefine((r, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (Object.keys(r.expected_revisions).length > 15) fail("too many expected revisions");
    if (r.method === "crowbo_without_jev" && r.access === null) fail("the matched no-Jev method requires an access decision");
    if (new Set(r.source_ids).size !== r.source_ids.length) fail("duplicate source reference");
    const span = BigInt(Date.parse(`${r.window_end}T00:00:00Z`) - Date.parse(`${r.window_start}T00:00:00Z`)) * 1000n;
    if (span < 0n || span > 31n * DAY) fail("decision window must be ordered and at most 31 days");
    const expected = Object.keys(r.expected_revisions);
    if (expected.length && (expected.length !== r.source_ids.length || !expected.every((k) => r.source_ids.includes(k)))) {
      fail("expected revisions must bind every selected source");
    }
    if (r.risk) {
      for (const estimate of [r.risk.annual_frequency, r.risk.mean_loss_per_event]) {
        if (!estimate) continue;
        if (!estimate.provenance.source_ids.every((id) => r.source_ids.includes(id))) fail("risk provenance must use selected evidence");
        if (estimate.provenance.kind === "counterfactual" && r.counterfactual === null) fail("counterfactual risk requires an explicit overlay");
      }
    }
  });
export type DecisionRequest = z.infer<typeof decisionRequest>;

/** Conditional expected annual loss; bounds show sensitivity, never percentiles. */
export function calculateLoss(inputs: RiskInputs | null) {
  const result: Record<string, unknown> = {
    formula_version: "annual-expected-loss-v1",
    formula: "annual_frequency * mean_loss_per_event",
    input_units: { annual_frequency: "events/year", mean_loss_per_event: "currency/event" },
    unit: inputs ? `${inputs.currency}/year` : null,
    interpretation: "Conditional arithmetic from attributed inputs; not a calibrated forecast.",
  };
  const missing = (["annual_frequency", "mean_loss_per_event"] as const).filter((name) => !inputs || inputs[name] === null);
  if (missing.length) return { ...result, status: "missing_input", missing };
  const frequency = inputs!.annual_frequency!;
  const loss = inputs!.mean_loss_per_event!;
  const value = (x: string) => parseDec(x);
  result.status = "calculated";
  result.expected_annual_loss = formatDec(mulDec(value(frequency.value), value(loss.value)));
  if (frequency.low !== null || loss.low !== null) {
    result.sensitivity_envelope = {
      low: formatDec(mulDec(value(frequency.low ?? frequency.value), value(loss.low ?? loss.value))),
      high: formatDec(mulDec(value(frequency.high ?? frequency.value), value(loss.high ?? loss.value))),
      meaning: "Input bounds only; not a probability or confidence interval.",
    };
  }
  return result;
}
