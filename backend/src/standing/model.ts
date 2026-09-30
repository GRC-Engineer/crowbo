import { z } from "zod";
import { accessSubject } from "../domain/access";
import { instant, isoDate } from "../domain/time";

/**
 * Standing questions: recurring, well-shaped questions about one subject, answered from
 * source-bound facts by eval-gated criteria and served by lookup. Anything else is a novel
 * question and goes through the full reasoning path (Decision.run).
 */

export const WORKFLOWS = ["access_review", "remediation", "exceptions"] as const;
export type Workflow = (typeof WORKFLOWS)[number];

export const question = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("access_retain"), subject: accessSubject }),
  z.strictObject({ kind: z.literal("finding_close"), finding_id: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("exception_valid"), exception_id: z.string().min(1).max(200) }),
]);
export type Question = z.infer<typeof question>;

export const WORKFLOW_OF: Record<Question["kind"], Workflow> = {
  access_retain: "access_review",
  finding_close: "remediation",
  exception_valid: "exceptions",
};

/** A durable subject identity. Explicit fields only: display names never join subjects. */
export function subjectKey(q: Question): string {
  switch (q.kind) {
    case "access_retain":
      return `account:${q.subject.system}:${q.subject.scope}:${q.subject.account_id}`;
    case "finding_close":
      return `finding:${q.finding_id}`;
    case "exception_valid":
      return `exception:${q.exception_id}`;
  }
}

/** Predicates each workflow's criteria may read. Anything else is rejected at assertion time. */
export const PREDICATES: Record<Workflow, readonly string[]> = {
  access_review: ["identity", "required_work", "alternative_test", "current_access", "approval_authority", "review_deadline"],
  remediation: ["merged", "deployed", "verified", "regression_observed"],
  exceptions: ["approval", "expires_on", "safeguard_verified", "conditions_met"],
};

const boundQuote = z.strictObject({
  source_id: z.string().regex(/^[a-f0-9]{64}$/),
  revision_id: z.string().regex(/^[a-f0-9]{64}$/),
  quote: z.string().min(12).max(600),
});

/**
 * One assertion about a subject. `stated` facts carry a value and either source quotes (bound to
 * exact revisions) or explicit operator attribution. A fact records what was asserted, not truth.
 */
export const factAssertion = z
  .strictObject({
    subject_key: z.string().min(3).max(400),
    workflow: z.enum(WORKFLOWS),
    predicate: z.string().min(1).max(100),
    state: z.enum(["stated", "unknown", "conflicting"]),
    value: z.string().min(1).max(600).nullable().default(null),
    citations: z.array(boundQuote).max(3).default([]),
    provenance: z.enum(["source_extraction", "operator_assertion"]),
    extractor: z.string().min(1).max(200).nullable().default(null),
    attributed_to: z.string().min(1).max(300),
    effective_until: instant.nullable().default(null),
  })
  .superRefine((f, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!PREDICATES[f.workflow].includes(f.predicate)) fail(`predicate is not defined for ${f.workflow}`);
    if (f.state === "unknown" && (f.value !== null || f.citations.length)) fail("unknown facts have no asserted value or citations");
    if (f.state !== "unknown" && f.value === null) fail("stated or conflicting facts require a value");
    if (f.provenance === "source_extraction" && f.state !== "unknown" && !f.citations.length) fail("source facts require citations");
    if (f.provenance === "source_extraction" && f.extractor === null) fail("source facts name their extractor");
    if (f.provenance === "operator_assertion" && f.citations.length) fail("operator assertions carry no source quotes");
    if (f.predicate === "expires_on" && f.value !== null && !isoDate.safeParse(f.value).success) fail("expires_on must be a date");
  });
export type FactAssertion = z.infer<typeof factAssertion>;

export type StoredFact = FactAssertion & { id: string; asserted_at: string; asserted_by: string };

/** What a subject's current facts look like to criteria: one resolved state per predicate. */
export type ResolvedFact = {
  state: "stated" | "unknown" | "conflicting";
  value: string | null;
  fact_ids: string[];
  provenance: ("source_extraction" | "operator_assertion")[];
};
export type FactSet = Record<string, ResolvedFact>;

export type Verdict = {
  outcome: string;
  next_check: string | null;
  deciding: string[];
  unresolved: string[];
  trace: string[];
};

export const evalGate = z.strictObject({
  question_kind: z.enum(["access_retain", "finding_close", "exception_valid"]),
  criteria_version: z.string().min(1).max(100),
  qualification: z.enum(["qualified", "synthetic_fixture"]),
  cases: z.number().int().min(1),
  passed: z.boolean(),
  evidence: z.string().min(1).max(2000),
  approved_by: z.string().min(1).max(300),
});
export type EvalGate = z.infer<typeof evalGate>;

export type Freshness = { status: "current" } | { status: "stale"; reasons: string[] };

export type Served =
  | { status: "answered"; version: Record<string, any>; freshness: Freshness }
  | { status: "blocked"; reason: "conflicting_revisions" | "conflicting_facts"; predicates: string[] }
  | { status: "unavailable" };
