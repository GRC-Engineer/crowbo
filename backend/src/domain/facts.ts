import { z } from "zod";
import { logicalId, revisionId, sourceRevision } from "./contracts";
import { CrowboError } from "./errors";

/** Model interpretations with exact source spans; a binding establishes origin, not truth. */

export const excerpt = z.strictObject({
  evidence_id: z.string().regex(/^E[1-9][0-9]*$/),
  quote: z.string().min(12).max(600),
});
export type Excerpt = z.infer<typeof excerpt>;

export const fact = z
  .strictObject({
    state: z.enum(["stated", "unknown", "conflicting"]),
    value: z.string().min(1).max(600).nullable().default(null),
    citations: z.array(excerpt).max(3).default([]),
  })
  .superRefine((f, ctx) => {
    if (f.state === "unknown" && (f.value !== null || f.citations.length)) {
      ctx.addIssue({ code: "custom", message: "unknown facts have no asserted value or citations" });
    }
    if (f.state !== "unknown" && (f.value === null || !f.citations.length)) {
      ctx.addIssue({ code: "custom", message: "stated or conflicting facts require a value and citations" });
    }
    const distinct = new Set(f.citations.map((c) => `${c.evidence_id}\u0000${c.quote}`));
    if (f.state === "conflicting" && distinct.size < 2) {
      ctx.addIssue({ code: "custom", message: "conflicting facts require distinct cited spans" });
    }
  });
export type Fact = z.infer<typeof fact>;
export const UNKNOWN: Fact = { state: "unknown", value: null, citations: [] };
const unknownFact = fact.default(UNKNOWN);

export const deliverable = z.strictObject({
  title: z.string().min(1).max(200),
  anchor: excerpt,
  obligation: unknownFact,
  deadline: unknownFact,
  owner: unknownFact,
  completion: unknownFact,
  consequence: unknownFact,
  nondeferral: unknownFact,
  capacity: unknownFact,
});

export const jevReference = z.strictObject({
  evidence_id: z.string().regex(/^E[1-9][0-9]*$/),
  question_id: z.string().min(1).max(100),
});

/** One entry of the evidence bundle a model saw: `{id: "E1", source, assessment, ...}`. */
export type EvidenceEntry = { id: string; source: unknown; assessment?: unknown; [key: string]: unknown };

export type BoundExcerpt = Excerpt & { source_id: string; revision_id: string; start: number; end: number };

export function bindExcerpt(e: Excerpt, evidence: readonly EvidenceEntry[], cited: readonly string[]): BoundExcerpt {
  const entry = evidence.find((candidate) => candidate.id === e.evidence_id);
  if (!entry || !cited.includes(e.evidence_id)) {
    throw new CrowboError("Fact cites evidence outside the answer's selected references");
  }
  const revision = sourceRevision.parse(entry.source);
  const first = revision.text.indexOf(e.quote);
  // Python's str.count counts non-overlapping occurrences; keep the same rule.
  if (first < 0 || revision.text.indexOf(e.quote, first + e.quote.length) >= 0) {
    throw new CrowboError("Deciding fact quote must match one exact span in its cited source");
  }
  // Offsets count Unicode code points, as Python's str.index does.
  const start = [...revision.text.slice(0, first)].length;
  return {
    evidence_id: e.evidence_id,
    quote: e.quote,
    source_id: logicalId(revision),
    revision_id: revisionId(revision),
    start,
    end: start + [...e.quote].length,
  };
}

export const COMMITMENT_FIELDS = ["obligation", "deadline", "owner", "completion", "consequence", "nondeferral", "capacity"] as const;
const REQUIRED = ["obligation", "deadline", "owner", "consequence", "nondeferral"] as const;

export const decidingFacts = z.strictObject({
  deliverables: z.array(deliverable).min(1).max(3),
  jev_references: z.array(jevReference).max(6).default([]),
});
export type DecidingFacts = z.infer<typeof decidingFacts>;

export function bindDecidingFacts(facts: DecidingFacts, evidence: readonly EvidenceEntry[], cited: readonly string[]) {
  const bindQuote = (e: Excerpt) => bindExcerpt(e, evidence, cited);
  const deliverables = facts.deliverables.map((card) => {
    const bound = Object.fromEntries(
      COMMITMENT_FIELDS.map((name) => [name, { ...card[name], citations: card[name].citations.map(bindQuote) }]),
    ) as Record<(typeof COMMITMENT_FIELDS)[number], Fact & { citations: BoundExcerpt[] }>;
    return {
      title: card.title,
      anchor: bindQuote(card.anchor),
      facts: bound,
      unresolved_commitment_fields: REQUIRED.filter((name) => bound[name].state !== "stated"),
      authority_verified: false,
      capacity_verified: false,
    };
  });
  const jev = facts.jev_references.map((ref) => {
    const entry = evidence.find((candidate) => candidate.id === ref.evidence_id);
    if (!entry || !cited.includes(ref.evidence_id)) {
      throw new CrowboError("Deciding fact cites evidence outside the answer's selected references");
    }
    const assessment = entry.assessment as
      | { answers: Record<string, unknown>; criteria_hash: string; criteria_version: string; questions: Record<string, unknown> }
      | null
      | undefined;
    if (!assessment || !(ref.question_id in assessment.answers)) {
      throw new CrowboError("Deciding fact references an unavailable Jev question");
    }
    const revision = sourceRevision.parse(entry.source);
    return {
      ...ref,
      source_id: logicalId(revision),
      revision_id: revisionId(revision),
      criteria_hash: assessment.criteria_hash,
      criteria_version: assessment.criteria_version,
      question: assessment.questions?.[ref.question_id] ?? null,
      answer: assessment.answers[ref.question_id],
    };
  });
  return {
    version: "deciding-facts-v1",
    deliverables,
    jev,
    interpretation: "Exact quotations checked; fact meanings and deliverable associations are model interpretations.",
  };
}
