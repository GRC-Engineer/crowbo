import { z } from "zod";
import { digest } from "../domain/canonical";
import type { FactSet, Question } from "../standing/model";
import { question as questionSchema } from "../standing/model";
import { CRITERIA_VERSION, evaluate } from "../standing/rules";

/**
 * Evaluation of fact extraction and criteria for one standing question kind. Two independent
 * reviewers label the deciding facts of each case; only facts they agree on become gold. The
 * extractor under test is scored against gold per fact, including misbinding (a quote attached
 * to the wrong fact), and the criteria are run on gold and on extracted facts. The verdict applies
 * the kill rule the decision-science review set before any criteria may be qualified.
 */

const label = z.strictObject({
  state: z.enum(["stated", "unknown", "conflicting"]),
  value: z.string().min(1).max(600).nullable().default(null),
  /** Spans a reviewer accepts as support for this fact (any one suffices). */
  support: z.array(z.string().min(3).max(600)).max(5).default([]),
});
const extracted = z.strictObject({
  state: z.enum(["stated", "unknown", "conflicting"]),
  value: z.string().min(1).max(600).nullable().default(null),
  quotes: z.array(z.string().min(3).max(600)).max(3).default([]),
});

export const evalCase = z.strictObject({
  case_id: z.string().min(1).max(100),
  family: z.string().min(1).max(100).default("default"),
  question: questionSchema,
  reviewers: z.strictObject({ a: z.record(z.string(), label), b: z.record(z.string(), label) }),
  extracted: z.record(z.string(), extracted),
  /** Optional: what a qualified human reviewer decided for the whole case. */
  human_outcome: z.string().min(1).max(100).nullable().default(null),
});
export const evalSet = z.strictObject({
  question_kind: z.enum(["access_retain", "finding_close", "exception_valid"]),
  deciding_predicates: z.array(z.string()).min(1),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cases: z.array(evalCase).min(1).max(1000),
});
export type EvalSet = z.infer<typeof evalSet>;

/** Outcomes that settle the question without further judgement. */
const SETTLED = new Set(["retain", "reduce", "remove_candidate", "closable", "not_closable", "reopen_treatment", "expired", "not_approved", "unbounded", "safeguard_failed", "valid"]);

const key = (l: { state: string; value: string | null }) => `${l.state}:${l.state === "stated" ? l.value : ""}`;
const toFactSet = (facts: Record<string, { state: "stated" | "unknown" | "conflicting"; value: string | null }>): FactSet =>
  Object.fromEntries(
    Object.entries(facts).map(([p, f]) => [p, { state: f.state, value: f.state === "stated" ? f.value : null, fact_ids: [], provenance: ["source_extraction"] }]),
  );

/** Cohen's kappa for two raters over categorical labels. 1 = perfect, 0 = chance. */
export function cohensKappa(pairs: [string, string][]): number | null {
  if (!pairs.length) return null;
  const n = pairs.length;
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  const categories = new Set(pairs.flat());
  let expected = 0;
  for (const c of categories) expected += (pairs.filter(([a]) => a === c).length / n) * (pairs.filter(([, b]) => b === c).length / n);
  return expected === 1 ? 1 : (observed - expected) / (1 - expected);
}

export function score(input: EvalSet) {
  const set = evalSet.parse(input);
  const predicates = [...new Set(set.cases.flatMap((c) => [...Object.keys(c.reviewers.a), ...Object.keys(c.reviewers.b)]))].sort();
  const perPredicate: Record<string, Record<string, number | null>> = {};
  let decidingGold = 0;
  let decidingDisagree = 0;
  let decidingMisbound = 0;
  let decidingExtractedStated = 0;

  for (const p of predicates) {
    const pairs: [string, string][] = [];
    let gold = 0, correct = 0, misbound = 0, statedExtractions = 0, disagreements = 0;
    for (const c of set.cases) {
      const a = c.reviewers.a[p] ?? { state: "unknown", value: null, support: [] };
      const b = c.reviewers.b[p] ?? { state: "unknown", value: null, support: [] };
      pairs.push([key(a), key(b)]);
      if (key(a) !== key(b)) {
        disagreements++;
        continue;
      }
      gold++;
      const e = c.extracted[p] ?? { state: "unknown", value: null, quotes: [] };
      if (key(e) === key(a)) correct++;
      if (e.state === "stated") {
        statedExtractions++;
        const support = [...a.support, ...b.support];
        // Misbinding: the extractor stated this fact from a quote no reviewer accepts as its support.
        if (support.length && !e.quotes.some((q) => support.some((s) => q.includes(s) || s.includes(q)))) misbound++;
      }
    }
    const deciding = set.deciding_predicates.includes(p);
    if (deciding) {
      decidingGold += gold;
      decidingDisagree += disagreements;
      decidingMisbound += misbound;
      decidingExtractedStated += statedExtractions;
    }
    perPredicate[p] = {
      deciding: deciding ? 1 : 0,
      kappa: cohensKappa(pairs),
      reviewer_disagreement_rate: disagreements / set.cases.length,
      gold_cases: gold,
      extraction_accuracy: gold ? correct / gold : null,
      misbinding_rate: statedExtractions ? misbound / statedExtractions : null,
    };
  }

  const outcomes = { gold: {} as Record<string, number>, extracted: {} as Record<string, number> };
  let agreeRulesGoldVsExtracted = 0, settled = 0, humanCompared = 0, humanAgree = 0, fullyAgreedCases = 0;
  for (const c of set.cases) {
    const agreed = Object.fromEntries(predicates.flatMap((p) => {
      const a = c.reviewers.a[p];
      const b = c.reviewers.b[p];
      return a && b && key(a) === key(b) ? [[p, a]] : [];
    }));
    if (set.deciding_predicates.every((p) => p in agreed || (!c.reviewers.a[p] && !c.reviewers.b[p]))) fullyAgreedCases++;
    const gold = evaluate(c.question as Question, toFactSet(agreed), set.as_of).outcome;
    const ext = evaluate(c.question as Question, toFactSet(c.extracted), set.as_of).outcome;
    outcomes.gold[gold] = (outcomes.gold[gold] ?? 0) + 1;
    outcomes.extracted[ext] = (outcomes.extracted[ext] ?? 0) + 1;
    if (gold === ext) agreeRulesGoldVsExtracted++;
    if (SETTLED.has(gold)) settled++;
    if (c.human_outcome) {
      humanCompared++;
      if (c.human_outcome === gold) humanAgree++;
    }
  }

  const n = set.cases.length;
  const misbindingRate = decidingExtractedStated ? decidingMisbound / decidingExtractedStated : 0;
  const disagreementRate = (decidingDisagree + decidingGold) ? decidingDisagree / (decidingDisagree + decidingGold) : 0;
  const reasons: string[] = [];
  if (fullyAgreedCases < 30) reasons.push(`only ${fullyAgreedCases} cases have reviewer agreement on every deciding fact; at least 30 are required`);
  if (misbindingRate > disagreementRate) {
    reasons.push(`misbinding on deciding facts (${(misbindingRate * 100).toFixed(1)}%) exceeds reviewer disagreement (${(disagreementRate * 100).toFixed(1)}%)`);
  }
  const report = {
    question_kind: set.question_kind,
    criteria_version: CRITERIA_VERSION[set.question_kind],
    cases: n,
    fully_agreed_cases: fullyAgreedCases,
    families: [...new Set(set.cases.map((c) => c.family))].sort(),
    per_predicate: perPredicate,
    deciding: { misbinding_rate: misbindingRate, reviewer_disagreement_rate: disagreementRate },
    tiers: { settled_by_rules_on_gold: settled / n, needs_judgement_on_gold: 1 - settled / n },
    rules: {
      outcomes,
      gold_vs_extracted_agreement: agreeRulesGoldVsExtracted / n,
      human_agreement: humanCompared ? humanAgree / humanCompared : null,
      human_compared: humanCompared,
    },
    verdict: reasons.length ? "fail" : "pass",
    reasons,
    note: "Development evidence. Qualification also requires a held-out case family and an independent reviewer (docs/EVALUATION.md).",
  };
  return { ...report, report_hash: digest(report) };
}
