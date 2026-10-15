import { z } from "zod";
import { answerTopic, pickTopic, weeklyBrief } from "./answer";
import { type Engine, MEMORY_CAP, OUTCOME_STATUSES, PERMALINK, replaySchedule } from "./engine";
import { EngineError } from "./errors";
import { draftFollowups, routeQuestion, summarise } from "./explain";
import { DATE, KB_LIMITS } from "./kb";

/**
 * The engine's operations, one table for every surface: the local MCP server runs them in-process,
 * the Worker runs them inside the caller's tenant Durable Object. Each validates its input here,
 * performs any reads that are due, then answers. The caller's identity comes from the transport,
 * never from the arguments.
 */

const value = z.union([z.string().min(1).max(200), z.number(), z.boolean()]);
const call = z.enum(["accept", "override", "defer", "exception"]);

export const ENGINE_INPUTS = {
  decide: z.strictObject({ question: z.string().min(3).max(500), topic: z.string().max(60).optional() }),
  draft_followups: z.strictObject({ topic: z.string().min(1).max(60) }),
  run_schedule: z.strictObject({ minutes: z.number().int().min(5).max(240).default(60) }),
  record_call: z.strictObject({
    action: z.string().min(1).max(100), call, reason: z.string().min(1).max(500),
    assertions: z.array(z.strictObject({ subject: z.string().max(200), predicate: z.string().max(80), value })).max(10).default([]),
    disputes_source: z.string().min(1).max(50).optional(),
  }),
  /**
   * Internal: a call recorded in a Slack thread, with the permalink the Slack surface got from
   * Slack's API. Run only from the Slack surface (see SURFACE_OPS); never published as an MCP tool.
   */
  slack_record_call: z.strictObject({
    action: z.string().min(1).max(100), call, reason: z.string().min(1).max(500),
    assertions: z.array(z.strictObject({ subject: z.string().max(200), predicate: z.string().max(80), value })).max(10).default([]),
    provenance: z.strictObject({ permalink: z.string().max(300).regex(PERMALINK) }),
  }),
  record_outcome: z.strictObject({ action: z.string().min(1).max(100), status: z.enum(OUTCOME_STATUSES as [string, ...string[]]), what_was_done: z.string().min(1).max(1000) }),
  what_if: z.strictObject({ weights: z.record(z.string().max(50), z.number().int().min(0).max(5)) }),
  advance_time: z.strictObject({ hours: z.number().int().min(1).max(720) }),
  weekly_brief: z.strictObject({}),
  next_moves: z.strictObject({}),
  status: z.strictObject({}),
  graph: z.strictObject({ node: z.string().min(1).max(200), depth: z.number().int().min(1).max(3).default(2) }),
  memory: z.strictObject({ kind: z.enum(["read", "decision", "call", "weight_change", "proposal", "outcome", "clock", "import"]).optional() }),
  set_weight: z.strictObject({ connector: z.string().min(1).max(50), weight: z.number().int().min(0).max(5), reason: z.string().min(1).max(500) }),
  /**
   * A knowledge-base export, as text files. `synthetic: true` is required until the founders clear
   * real exports; the engine checks it again and keeps the declaration with the import.
   */
  import_knowledge_base: z.strictObject({
    synthetic: z.literal(true),
    files: z.array(z.strictObject({
      path: z.string().min(1).max(300),
      content: z.string().max(KB_LIMITS.base64_chars),
      encoding: z.literal("base64").optional(),
      modified_at: z.string().regex(DATE).optional(),
      mapping: z.discriminatedUnion("shape", [
        z.strictObject({ shape: z.literal("triples") }),
        z.strictObject({
          shape: z.literal("columns"),
          subject_column: z.string().min(1).max(100),
          subject_prefix: z.string().min(1).max(30),
          columns: z.record(z.string().max(100), z.strictObject({ predicate: z.string().min(1).max(80), node_prefix: z.string().min(1).max(30).optional() })),
        }),
      ]).optional(),
    })).min(1).max(KB_LIMITS.files),
  }),
  /** Start this copy over from the demo's first morning. Handled by the host, which owns the store. */
  reset: z.strictObject({ confirm: z.literal(true) }),
} as const;

/** Where an operation may come from. Most come from any surface; some only from one. */
export type Surface = "mcp" | "slack";
const SURFACE_OPS: Partial<Record<EngineOp, Surface>> = { slack_record_call: "slack" };

const WRITES = new Set<EngineOp>(["slack_record_call", "record_call", "record_outcome", "advance_time", "set_weight", "import_knowledge_base"]);

export type EngineOp = keyof typeof ENGINE_INPUTS;
export const isEngineOp = (name: string): name is EngineOp => Object.hasOwn(ENGINE_INPUTS, name);

/** Run one operation on an open engine, as `actor`. */
export async function runEngine(engine: Engine, actor: string, op: EngineOp, raw: unknown, surface: Surface = "mcp"): Promise<unknown> {
  const only = SURFACE_OPS[op];
  if (only && only !== surface) throw new EngineError(`${op} runs only from the ${only} surface`);
  const args: any = ENGINE_INPUTS[op].parse(raw ?? {});
  if (op === "reset") throw new EngineError("Reset is handled by the host that owns this copy's storage");
  if (WRITES.has(op) && engine.memory.list().length >= MEMORY_CAP) throw new EngineError(`This demo copy has reached ${MEMORY_CAP} kept entries; reset it to start over`);
  await engine.catchUp();
  const answerer = engine.options.answerer;
  switch (op) {
    case "decide": {
      const started = performance.now();
      const routed = args.topic ? { topic: pickTopic(engine.fixture.topics, args.question, args.topic), generated_by: "caller" } : await routeQuestion(answerer, engine.fixture.topics, args.question);
      const answer = answerTopic(engine, args.question, routed.topic.id, performance.now());
      const summary = await summarise(answerer, answer);
      return { ...answer, elapsed_ms: Math.round(performance.now() - started), lookup_ms: answer.elapsed_ms, summary, models: { routing: routed.generated_by, summary: summary.generated_by, ingestion: engine.status().layers["02_classify_and_weight"].extractors } };
    }
    case "draft_followups":
      return draftFollowups(answerer, pickTopic(engine.fixture.topics, args.topic, args.topic), answerTopic(engine, args.topic, args.topic));
    case "run_schedule":
      return replaySchedule(engine.fixture, engine.options, args.minutes);
    case "record_call":
      return engine.recordCall(args.action, args.call, actor, args.reason, args.assertions, args.disputes_source);
    case "slack_record_call":
      return engine.recordCall(args.action, args.call, actor, args.reason, args.assertions, undefined, args.provenance);
    case "record_outcome":
      return engine.recordOutcome(args.action, args.status, args.what_was_done, actor);
    case "what_if":
      return engine.whatIf(args.weights);
    case "advance_time":
      return engine.advance(args.hours, actor);
    case "weekly_brief":
      return weeklyBrief(engine);
    case "next_moves":
      return engine.nextMoves();
    case "status":
      return engine.status();
    case "graph":
      return { node: args.node, edges: engine.graph.around(args.node, args.depth) };
    case "memory":
      return { chain_intact: engine.memory.verify(), entries: engine.memory.list(args.kind) };
    case "set_weight":
      return engine.setWeight(args.connector, args.weight, actor, args.reason);
    case "import_knowledge_base":
      return engine.importKnowledgeBase(args.files, actor, { synthetic: args.synthetic });
  }
}
