import { z } from "zod";
import { digest } from "../domain/canonical";
import { logicalId, revisionId, sourceBatch } from "../domain/contracts";
import { CrowboError } from "../domain/errors";
import { decisionRequest } from "../domain/decision-request";
import { DEFAULT_QUESTIONS, type QuestionSet } from "../domain/questions";
import { reviewRequest } from "../domain/review";
import { type Settings } from "../domain/settings";
import { type CloudflareAi, Jev } from "../providers/cloudflare-ai";
import { CaptureReader, mcpCapture, SlackReader, slackSpec } from "../providers/slack";
import { Decision } from "../services/decision";
import { Evidence } from "../services/evidence";
import { Feedback, feedbackRequest } from "../services/feedback";
import type { Ledger, Store } from "../services/ports";
import { Reasoner, Review } from "../services/review";
import { SlackSync } from "../services/sync";
import { evalGate, factAssertion, question, WORKFLOWS } from "../standing/model";
import { type Caller, Standing } from "../standing/service";
import { exportableVersions, renderDecisionPage } from "./decision-page";

/** Everything one operation needs, bound to the calling operator and their tenant's store. */
export type Context = {
  caller: Caller;
  store: Store;
  ledger: Ledger & {
    createExperiment?(maxRequests: number, maxModels: number): unknown;
    experimentStatus?(): unknown;
  };
  ai: Omit<CloudflareAi, "token"> & { token: string | null };
  slackToken: string | null;
  questions?: QuestionSet;
  allowSyntheticGates: boolean;
};

const ids = z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(40);
const id = z.string().regex(/^[a-f0-9]{64}$/);

/** A source view as operators see it: bounded text, provenance, limits and readiness. */
export function summary(view: any, textLimit: number) {
  const source = view.source;
  return {
    source_id: logicalId(source),
    revision_id: revisionId(source),
    title: source.title,
    url: source.source_url,
    connector: source.connector,
    updated_at: source.updated_at,
    checked_at: view.last_checked_at ?? source.observed_at,
    limitations: [...source.limitations, ...view.limitations],
    coverage: view.coverage,
    assessment_current: view.assessment_current,
    text: [...source.text].slice(0, textLimit).join(""),
    text_truncated: [...source.text].length > textLimit,
  };
}

export function resultSummary(result: Record<string, any>) {
  const keys = ["model", "reasoning_effort", "max_completion_tokens", "answer_format", "include_jev", "access_guidance"];
  const kept = [
    "id",
    "created_at",
    "answer",
    "decision",
    "evidence_unchanged",
    "decision_ready",
    "readiness_issue",
    "simulated",
    "population_complete",
    "feasibility_checked",
    "provider",
  ];
  return {
    reasoning_configuration: Object.fromEntries(keys.filter((k) => k in result.request).map((k) => [k, result.request[k]])),
    prompt_hash: result.prompt_hash,
    answer_schema_hash: result.answer_schema_hash ?? null,
    source_input_hash: result.source_input_hash ?? null,
    ...Object.fromEntries(kept.filter((k) => k in result).map((k) => [k, result[k]])),
  };
}

function engine(ctx: Context, withJev: boolean) {
  const questions = ctx.questions ?? DEFAULT_QUESTIONS;
  const token = ctx.ai.token;
  const jev = withJev && token ? new Jev({ ...ctx.ai, token }, ctx.ledger, questions) : null;
  return new Evidence(ctx.caller.settings, ctx.store, jev, questions);
}

function reasoner(ctx: Context) {
  if (!ctx.ai.token) throw new CrowboError("Required provider credential is unavailable");
  return new Reasoner({ ...ctx.ai, token: ctx.ai.token }, ctx.ledger, ctx.caller.settings.query_processors);
}

function decision(ctx: Context, evidence: Evidence, withReasoner: boolean) {
  const token = ctx.ai.token;
  const makeAssessor = token ? (q: QuestionSet) => new Jev({ ...ctx.ai, token }, ctx.ledger, q) : null;
  return new Decision(evidence, withReasoner ? reasoner(ctx) : null, makeAssessor);
}

/** The operation table: one entry per CLI command, API route and MCP tool. */
export const OPERATIONS = {
  create_experiment: async (ctx: Context, a: unknown) => {
    const { max_requests, max_models } = z.strictObject({ max_requests: z.number().int(), max_models: z.number().int() }).parse(a);
    if (!ctx.ledger.createExperiment) throw new CrowboError("Experiments are unavailable in this runtime");
    return ctx.ledger.createExperiment(max_requests, max_models);
  },
  experiment_status: async (ctx: Context) => {
    if (!ctx.ledger.experimentStatus) throw new CrowboError("Experiments are unavailable in this runtime");
    return ctx.ledger.experimentStatus();
  },
  ingest: async (ctx: Context, a: unknown) => ({ records: await engine(ctx, true).ingest(sourceBatch.parse(a)) }),
  resume: async (ctx: Context) => ({ records: await engine(ctx, true).resume() }),
  list: async (ctx: Context) => ({ records: await engine(ctx, false).listCurrent() }),
  inspect: async (ctx: Context, a: unknown) => {
    const { source_ids } = z.strictObject({ source_ids: ids }).parse(a);
    return { population_complete: false, records: (await engine(ctx, false).inspectMany(source_ids)).map((v) => ({ ...summary(v, 4000), assessment: v.assessment })) };
  },
  search: async (ctx: Context, a: unknown) => {
    const { query, mode, limit } = z
      .strictObject({ query: z.string().min(1).max(4000), mode: z.enum(["semantic", "keyword"]).default("semantic"), limit: z.number().int().min(1).max(30).default(10) })
      .parse(a);
    const views = await engine(ctx, false).search(query, mode, limit);
    return { population_complete: false, retrieval_mode: mode, records: views.map((v) => summary(v, 1200)) };
  },
  review: async (ctx: Context, a: unknown) => new Review(engine(ctx, false), reasoner(ctx)).run(reviewRequest.parse(a)),
  inspect_review: async (ctx: Context, a: unknown) => new Review(engine(ctx, false), null).inspect(z.strictObject({ id }).parse(a).id),
  decide: async (ctx: Context, a: unknown) => resultSummary(await decision(ctx, engine(ctx, false), true).run(decisionRequest.parse(a))),
  inspect_decision: async (ctx: Context, a: unknown) => resultSummary(await decision(ctx, engine(ctx, false), false).inspect(z.strictObject({ id }).parse(a).id)),
  record_feedback: async (ctx: Context, a: unknown) => new Feedback(engine(ctx, false)).record(feedbackRequest.parse(a)),
  inspect_feedback: async (ctx: Context, a: unknown) => new Feedback(engine(ctx, false)).inspect(z.strictObject({ id }).parse(a).id),
  export_decision: async (ctx: Context, a: unknown) => {
    const { ids: keys } = z.strictObject({ ids: z.array(id).min(1).max(5) }).parse(a);
    const evidence = engine(ctx, false);
    const results = [];
    for (const key of keys) results.push(await decision(ctx, evidence, false).inspect(key));
    const notes = [];
    for (const key of [...new Set(results.map((r) => r.decision.request.prior_feedback_id).filter(Boolean))]) {
      notes.push(await new Feedback(evidence).inspect(key));
    }
    return { html: renderDecisionPage(exportableVersions(results), notes), versions: results.length };
  },
  sync_slack: async (ctx: Context, a: unknown) => {
    const { spec, captures, force } = z
      .strictObject({ spec: slackSpec, captures: z.array(mcpCapture).nullable().default(null), force: z.boolean().default(false) })
      .parse(a);
    if (!captures && !ctx.slackToken) throw new CrowboError("Required provider credential is unavailable");
    const reader = captures ? new CaptureReader(captures) : new SlackReader(ctx.ledger, ctx.slackToken!);
    return new SlackSync(engine(ctx, true), spec, reader).run({ force });
  },
  /** Register a Slack spec for scheduled polling; the Cron trigger runs due syncs as this reader. */
  sync_register: async (ctx: Context, a: unknown) => {
    const { spec } = z.strictObject({ spec: slackSpec }).parse(a);
    if (!ctx.caller.roles.includes("operator")) throw new CrowboError("This operation requires the operator role");
    const key = digest(["sync_registration", ctx.caller.settings.tenant, ctx.caller.settings.reader, spec.name]);
    const previous = await ctx.store.get(key);
    const body = { kind: "sync_registration", tenant: ctx.caller.settings.tenant, reader: ctx.caller.settings.reader, spec };
    await ctx.store.put(key, "sync_registration", body, { logicalId: ctx.caller.settings.reader, expectedHash: previous ? digest(previous) : null, insertOnly: !previous });
    return body;
  },
  /** Run every registered sync for this reader that is due. Not-due specs return immediately. */
  sync_due: async (ctx: Context) => {
    if (!ctx.slackToken) return { runs: [], skipped: "Slack credential is not configured" };
    const runs = [];
    for (const registration of await ctx.store.scan("sync_registration", ctx.caller.settings.reader)) {
      const spec = slackSpec.parse(registration.spec);
      try {
        runs.push(await new SlackSync(engine(ctx, true), spec, new SlackReader(ctx.ledger, ctx.slackToken)).run());
      } catch (error) {
        runs.push({ sync: spec.name, status: "failed", errors: [error instanceof CrowboError ? error.message : "Sync could not start"] });
      }
    }
    return { runs };
  },
  sync_status: async (ctx: Context, a: unknown) => {
    const { spec } = z.strictObject({ spec: slackSpec }).parse(a);
    return new SlackSync(engine(ctx, false), spec, new CaptureReader([])).status();
  },
  standing_register_subject: async (ctx: Context, a: unknown) => {
    const { question: q, team } = z.strictObject({ question, team: z.string().min(1).max(200) }).parse(a);
    return new Standing(ctx.store, ctx).registerSubject(ctx.caller, q, team);
  },
  standing_assert_fact: async (ctx: Context, a: unknown) => new Standing(ctx.store, ctx).assertFact(ctx.caller, factAssertion.parse(a)),
  standing_record_gate: async (ctx: Context, a: unknown) => new Standing(ctx.store, ctx).recordGate(ctx.caller, evalGate.parse(a)),
  standing_activate: async (ctx: Context, a: unknown) => {
    const { kind, gate_id } = z.strictObject({ kind: z.enum(["access_retain", "finding_close", "exception_valid"]), gate_id: id }).parse(a);
    return new Standing(ctx.store, ctx).activateCriteria(ctx.caller, kind, gate_id);
  },
  standing_ask: async (ctx: Context, a: unknown) => new Standing(ctx.store, ctx).ask(ctx.caller, question.parse(a)),
  standing_survey: async (ctx: Context, a: unknown) => {
    const { workflow, limit } = z.strictObject({ workflow: z.enum(WORKFLOWS), limit: z.number().int().min(1).max(500).default(500) }).parse(a);
    return new Standing(ctx.store, ctx).survey(ctx.caller, workflow, limit);
  },
  standing_history: async (ctx: Context, a: unknown) => new Standing(ctx.store, ctx).history(ctx.caller, question.parse(a)),
} as const;

export type OperationName = keyof typeof OPERATIONS;
export const isOperation = (name: string): name is OperationName => Object.hasOwn(OPERATIONS, name);

/** Run one operation with the protocol boundary's error policy: bounded messages only. */
export async function run(ctx: Context, name: string, args: unknown): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  if (!isOperation(name)) return { ok: false, error: "Unknown operation" };
  try {
    return { ok: true, result: await OPERATIONS[name](ctx, args ?? {}) };
  } catch (error) {
    if (error instanceof CrowboError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: "Input or stored record failed schema validation; no input values printed" };
    return { ok: false, error: "Crowbo could not complete this operation; inspect the private runtime receipt" };
  }
}

export type { Settings };
