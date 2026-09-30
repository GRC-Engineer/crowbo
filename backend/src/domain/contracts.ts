import { z } from "zod";
import { digest } from "./canonical";
import { type Instant, instant, micros } from "./time";

/**
 * Domain values are their JSON form, exactly as Pydantic's `model_dump(mode="json")` wrote
 * them: defaults filled in, datetimes and URLs normalised. Schemas are strict (unknown fields
 * are rejected), matching `extra="forbid"`.
 */

export const REASONING_MODELS = ["openai/gpt-6-luna", "@cf/zai-org/glm-5.3-flash"] as const;
export const reasoningModel = z.enum(REASONING_MODELS);
export type ReasoningModel = z.infer<typeof reasoningModel>;

export const PROCESSORS = ["turbopuffer", "voyage", "jev", ...REASONING_MODELS] as const;
export const processor = z.enum(PROCESSORS);
export type Processor = z.infer<typeof processor>;

const text = (min: number, max: number) => z.string().min(min).max(max);

const httpUrl = z.string().transform((value, ctx) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    if (!url.hostname) throw new Error();
    return url.href;
  } catch {
    ctx.addIssue({ code: "custom", message: "Expected an http(s) URL" });
    return z.NEVER;
  }
});

export const CONNECTORS = ["linear", "notion", "slack", "hibob", "github", "granola", "drive", "manual", "fixture"] as const;
export const SOURCE_KINDS = [
  "issue",
  "comment",
  "page",
  "owner_statement",
  "thread",
  "calendar_snapshot",
  "pull_request",
  "team_membership",
  "meeting_summary",
] as const;

export const sourceRevision = z
  .strictObject({
    fingerprint_version: z.union([z.literal(1), z.literal(2)]).default(1),
    tenant: text(1, 100),
    connector: z.enum(CONNECTORS),
    workspace: text(1, 100),
    native_id: text(1, 200),
    source_url: httpUrl,
    title: text(1, 1000),
    text: text(1, 40000),
    updated_at: instant,
    observed_at: instant,
    timestamp_basis: z.enum(["source_update", "observation"]).default("source_update"),
    basis: z.enum(["real", "synthetic", "public"]),
    kind: z.enum(SOURCE_KINDS),
    owner: z.string().max(300).nullable().default(null),
    status: z.string().max(100).nullable().default(null),
    due_date: z.string().max(30).nullable().default(null),
    limitations: z.array(z.string()).default([]),
  })
  .superRefine((s, ctx) => {
    if (micros(s.updated_at) > micros(s.observed_at)) {
      ctx.addIssue({ code: "custom", message: "source update is later than observation" });
    }
    if (s.timestamp_basis === "observation" && s.updated_at !== s.observed_at && micros(s.updated_at) !== micros(s.observed_at)) {
      ctx.addIssue({ code: "custom", message: "observation-based revisions must use their capture timestamp" });
    }
  });
export type SourceRevision = z.infer<typeof sourceRevision>;

/** Serialisation order matches the Pydantic field order (it does not affect hashes). */
export function logicalId(s: Pick<SourceRevision, "tenant" | "connector" | "workspace" | "native_id">): string {
  return digest([s.tenant, s.connector, s.workspace, s.native_id]);
}

export function revisionId(s: SourceRevision): string {
  const { observed_at: _observed, fingerprint_version, ...body } = s;
  if (fingerprint_version === 2) {
    const { updated_at: _u, timestamp_basis: _t, ...rest } = body;
    return digest(["source-v2", rest]);
  }
  if (body.timestamp_basis === "source_update") {
    // Preserve revision IDs written before timestamp provenance was explicit.
    const { timestamp_basis: _t, ...rest } = body;
    return digest(rest);
  }
  return digest(body);
}

export const grant = z
  .strictObject({
    readers: z.array(z.string()),
    reader_groups: z.array(text(1, 200)).max(100).default([]),
    processors: z.array(processor),
    checked_at: instant,
    expires_at: instant,
    revoked: z.boolean().default(false),
  })
  .refine((g) => micros(g.expires_at) > micros(g.checked_at), "permission expiry must follow its check");
export type Grant = z.infer<typeof grant>;

export function permits(
  g: Grant,
  reader: string,
  at: Instant,
  processorName: string | null = null,
  groups: readonly string[] = [],
): boolean {
  const t = micros(at);
  return (
    !g.revoked &&
    (g.readers.includes(reader) || groups.some((group) => g.reader_groups.includes(group))) &&
    micros(g.checked_at) <= t &&
    t < micros(g.expires_at) &&
    (processorName === null || (g.processors as string[]).includes(processorName))
  );
}

export const sourceInput = z.strictObject({ source: sourceRevision, grant });
export type SourceInput = z.infer<typeof sourceInput>;

export const sourceBatch = z
  .strictObject({
    schema_version: z.literal(1).default(1),
    scope: text(1, 2000),
    coverage: z.enum(["partial", "complete"]),
    limitations: z.array(z.string()),
    records: z.array(sourceInput).min(1).max(40),
  })
  .superRefine((b, ctx) => {
    const bytes = b.records.reduce((sum, r) => sum + new TextEncoder().encode(r.source.text).length, 0);
    if (bytes > 200_000) ctx.addIssue({ code: "custom", message: "pilot exceeds its 200 KB text limit" });
    if (new Set(b.records.map((r) => logicalId(r.source))).size !== b.records.length) {
      ctx.addIssue({ code: "custom", message: "a batch must contain one revision per source identity" });
    }
  });
export type SourceBatch = z.infer<typeof sourceBatch>;

const probability = z.number().min(0).max(1);
const sumsToOne = (values: Record<string, number>) =>
  Math.abs(Object.values(values).reduce((a, b) => a + b, 0) - 1) <= 0.02;

export const noul = z.strictObject({ type: z.literal("noul"), noul: probability });
export const choice = z
  .strictObject({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: probability,
    probabilities: z.record(z.string(), z.number()),
  })
  .superRefine((c, ctx) => {
    if (!(c.choice in c.probabilities)) ctx.addIssue({ code: "custom", message: "choice absent from distribution" });
    if (Object.values(c.probabilities).some((v) => v < 0 || v > 1)) ctx.addIssue({ code: "custom", message: "invalid probability" });
    if (!sumsToOne(c.probabilities)) ctx.addIssue({ code: "custom", message: "invalid probability total" });
  });
export const score = z
  .strictObject({
    type: z.literal("score"),
    score: z.number().min(0),
    confidence: probability,
    legend: z.record(z.string(), z.json()),
    probabilities: z.record(z.string(), z.number()),
  })
  .superRefine((s, ctx) => {
    const n = Object.keys(s.legend).length;
    const expected = new Set(Array.from({ length: n }, (_, i) => String(i)));
    const same = (keys: string[]) => keys.length === expected.size && keys.every((k) => expected.has(k));
    if (n < 2 || !same(Object.keys(s.legend)) || !same(Object.keys(s.probabilities))) {
      ctx.addIssue({ code: "custom", message: "invalid score levels" });
    }
    if (s.score > n - 1 || Object.values(s.probabilities).some((v) => v < 0 || v > 1)) {
      ctx.addIssue({ code: "custom", message: "score outside its scale" });
    }
    if (!sumsToOne(s.probabilities)) ctx.addIssue({ code: "custom", message: "invalid probability total" });
  });
export const answer = z.discriminatedUnion("type", [noul, choice, score]);
export type Answer = z.infer<typeof answer>;

export const assessment = z.strictObject({
  source_revision: z.string(),
  criteria_version: z.string(),
  criteria_hash: z.string(),
  requested_model: z.literal("typesafe/jev").default("typesafe/jev"),
  returned_model: z.string().regex(/^(?:typesafe\/)?jev[-\w.]+$/),
  answers: z.record(z.string(), answer),
  questions: z.record(z.string(), z.record(z.string(), z.json())).default({}),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  elapsed_seconds: z.number().min(0),
  assessed_at: instant,
  interpretation_only: z.literal(true).default(true),
});
export type Assessment = z.infer<typeof assessment>;

export const head = z.strictObject({
  logical_id: z.string(),
  revision_id: z.string(),
  updated_at: instant,
  grant,
  scope: z.string(),
  coverage: z.enum(["partial", "complete"]),
  limitations: z.array(z.string()),
  assessment_id: z.string().nullable().default(null),
  indexed_revision: z.string().nullable().default(null),
  conflicted: z.boolean().default(false),
  generation: z.number().int().min(0).default(0),
  last_checked_at: instant.nullable().default(null),
  index_grant_hash: z.string().nullable().default(null),
  sync_id: z.string().nullable().default(null),
  withdrawn: z.boolean().default(false),
});
export type Head = z.infer<typeof head>;

export const evidenceView = z
  .strictObject({
    source: sourceRevision,
    assessment: assessment.nullable(),
    coverage: z.enum(["partial", "complete"]),
    limitations: z.array(z.string()),
    index_ready: z.boolean(),
    assessment_current: z.boolean().default(false),
    last_checked_at: instant.nullable().default(null),
    sync_id: z.string().nullable().default(null),
  })
  .transform((view) => ({ ...view, source_id: logicalId(view.source) }));
export type EvidenceView = z.infer<typeof evidenceView>;

/** Structural equality over JSON-form values (Pydantic `==` compares field values). */
export function sameValue(a: unknown, b: unknown): boolean {
  return digest(a ?? null) === digest(b ?? null);
}
