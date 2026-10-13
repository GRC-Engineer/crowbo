import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { answerTopic, pickTopic, weeklyBrief } from "./answer";
import { draftFollowups, routeQuestion, summarise } from "./explain";
import { type Engine, type EngineOptions, replaySchedule } from "./engine";

/**
 * The engine over MCP, so any harness (Claude Code, Cursor, Codex, Gemini) can use it. Local and
 * stateful: one engine per server process. Calls and weight changes are simulations of a fictional
 * company, kept in its decision memory; nothing reaches a real system and nothing is sent.
 */

export const ENGINE_INSTRUCTIONS =
  "Crowbo engine on demo data built on a case a future customer raised (a fictional company). It reads the " +
  "company's tools on their own schedules, joins facts across them, and precomputes the next move by risk " +
  "removed with deterministic arithmetic over visible weights. Use engine_decide for a question; cite its " +
  "numbered sources exactly; never resolve stale or conflicting evidence yourself, and never invent numbers. " +
  "Record a person's call with engine_record_call; facts in it are kept in decision memory and used next time.";

/** The crow, so clients that show server icons show Crowbo's: the hosted mark and an inline copy for offline use. */
export const CROW_ICON_URL = { src: "https://crowbo.ai/assets/apple-touch-icon.png", mimeType: "image/png", sizes: ["180x180"] };
export const CROW_ICON_INLINE = { src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAIKADAAQAAAABAAAAIAAAAACshmLzAAAGUElEQVRIDYVWW2gcVRie287OzuzOdrNpN9km2Wy2udiLhSJSEJO2tPQlD/FFH0TQB18F8aEPgi+C+FDEgrWgoNAWRQsiIoUqalGobmpjtH0waaW1SUybZmfvu7Nz9TtnZje7uXXazOWc/3z//3//f76zrBJVXcZlGJZl8HBZhvxzXdzWX8QIY54dmfQHmmNkCFdroYcmuK7LEnBvjr5shr62ErA+im/sQbZwyTS9SKQMI/hfbQ+4bAsOqW1c22a97eTmDmRZZjl/ndEwTMNEKI9x0+Zx3SsyaIvBZTieG0j3B4NBnuc5nl9e+m/lwSOsMU3TK8+69Y/95APBYIsDkIOrXqsX8gX44DheiYR7kglJkiqVCrBs29kulbWqr/ntcCCKQSEQsGzLcdxarQY3oVBIEIRQSEr07gK0rjew1NnCDcFvo8NzAgciViJwAI3tG0v29YqiWMwXgcKxbKVSLWgFKSRhMKxGEj27LNtGVRyE0NZ+BAu9147ezMbLgMzAjRKWQb0aVWU5VCqVbNvmOA5ApWIJ84gA91hXrKu7CzTaltWRSjs6gSNOccGB5HkGnLaqmaYFWtRoBLw/XH4oBASO5WAHxvI5DU2F2gs8n+hNCEKgUq5g1XZVoQ6CSA8MxHfGAV2tVGnDMLVqTa/rgsB7BDrIhueNRqOgFS3LBgHxeJcYFCvlqmVZ2/ggFIEEJaxkRjLRmGoYJmqLnmkAPRBAazqOHVLk1HA6v6oBiONIqcvlMsqwIxZFTKUSeceUaYMzl2/uIcoQoUgECci9oTciagR2Wk4TAU2YcZGNIAbGJ4/3pvpuTc/yAk9qxbKIGsWvVmuRaAQbv1Iu64Y19WT/wd3xm8t53wetsy8VEIdiodjQdawPySHq3G00jOE9mdHREZWXjGLj6MT4tWwW3WKYZiY9ODo66tiWJAXR1JcvX9nT13fk6bH5uTkHuN5F6+x3EYKinccIvOA6rq7rtbp+YP/ejz44Y9kOYzmRcOTVV15SVfWHq1fTqYFzZ95DIaJqJBxWjk5MnDh+IpPq/zZ769IvM5LYoW+sTGnxfboMSBgcTJ16/TXDMPYd2P/dle9Pn/1w6uXn/8r+4ZTqX1749Odrvw4NZaZ/y378xWdHJk98ff7SyfGJQ4eeOnvu3P37C9gxzfj9J4hudixGWAa46P1ksjd7Y+b67zPzt/8JSsG9B/c6prW4uDR/5875i5//+NPV+wuLYVVNJBO2YWF/XL+evXv37kZ0QJJKtvuEwt279+/UCy9+cv7i7J9/HjvyLGO731z4Ci17bGK8rjemb9yYmZ19bmqyW1Hnp28+MTb6zOHDqDPHdzDTwuykqDmMbUHFVHjz1BupVKqQ07CPY1H1rbffebCykuxPTp48OTw8rFer3Tu7a9Xqu6ffn5ubR3AtnW8iMXCgdmgItMxxsI0VRa7rOjq4pydBDdgi1KNUGhgcQPujfdHyOFtDkrRjRzQei839fXt29pZlmWC4hY4Xsg/QQq0hoMuKPDiU6k50W6aFTi2Vy5AE7CzLJIuxAwIB0bFsKRgU8QJ5r9crtdpgagBS+GhlFR3Y7sNvU88BNmIsHkvvSUOCoDyxrq5AIFCv1pE4lJWoJd1i0NpSsQgVqtd1SAuM0dnFUhk6ODKSya1q5XIVG97D5EXJbywYRWPRoeG0bdkPl1e0XF5WQjEqONAlZEb2cLPnkAdJC9mBtUI5r+Uh44ViEeq0e3fv4sJSSwS9DKgzl0FHQushFVBjnJ2IHXRBWVFzHAwuFRyYogDoZrgkh4Lj4tRu6EYBl1bI5wsoSV4rgCiP+TUH+IYcQTCgS2AGrAAADIRkGVKIc6JaqVF1wV4x6fHiZ4SHd8E3ctXyeaDDt1fZNQeYhh2pj0saCVsavEOlEbuiKEgOAWLTQKuJnnuraebtN9QK8RF0AkdmOlrKN2XJqYsDi9igqqa5tLAI9cYCZAByfbMtHqQfWrXyDpxNomHJDwicE0gIxUDZc49ynj8E2C4uW3ih+kAz2Hx/e8twfKKwOMjgCW0DcsAb/dW3JezGCTjwKrdxCvwwRKvxn3AFOxdbb5Pw1wF4nwifvsABzQQfBIbe227r2dtgsMmqThuBhAYx9AzJk/r1QqY/dejkhkFq2FxLIPHnoZB3goknGfwfCOY4jll13wkAAAAASUVORK5CYII=", mimeType: "image/png", sizes: ["32x32"] };
export const CROW_ICON = CROW_ICON_URL;

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });
const fail = (error: unknown) => ({ isError: true, content: [{ type: "text" as const, text: `Rejected: ${(error as Error).message}` }] });
const guard = <A>(fn: (args: A) => unknown) => async (args: A) => {
  try {
    return ok(await fn(args));
  } catch (error) {
    return fail(error);
  }
};
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const ACTOR = "grc-lead (via MCP)";
const value = z.union([z.string().min(1).max(200), z.number(), z.boolean()]);

export function registerEngineTools(server: McpServer, engine: Engine, options: EngineOptions): void {
  server.registerTool(
    "engine_decide",
    {
      description:
        "Answer a question (e.g. 'Who should still have billing admin?') from the precomputed decision: numbered sources with " +
        "freshness and coverage, the finding (deciding facts marked), the move with risk removed and hours, who decides, who " +
        "delivers, the due date with its citation, conditions, unresolved evidence, and a short summary written by the answering model and checked against the answer. lookup_ms is the decision lookup; elapsed_ms includes model calls.",
      inputSchema: { question: z.string().min(3).max(500), topic: z.string().max(60).optional() },
      annotations: read,
    },
    guard(async ({ question, topic }: { question: string; topic?: string }) => {
      const started = performance.now();
      const answerer = options.answerer;
      const routed = topic ? { topic: pickTopic(engine.fixture.topics, question, topic), generated_by: "caller" } : await routeQuestion(answerer, engine.fixture.topics, question);
      const lookupStart = performance.now();
      const answer = answerTopic(engine, question, routed.topic.id, lookupStart);
      const lookup_ms = answer.elapsed_ms;
      const summary = await summarise(answerer, answer);
      return { ...answer, elapsed_ms: Math.round(performance.now() - started), lookup_ms, summary, models: { routing: routed.generated_by, summary: summary.generated_by, ingestion: engine.status().layers["02_classify_and_weight"].extractors } };
    }),
  );
  server.registerTool(
    "engine_draft_followups",
    { description: "Draft the follow-up messages for a topic's move: the decider, the person delivering, and the affected people. Drafts only; sent is always false and nothing can send.", inputSchema: { topic: z.string().min(1).max(60) }, annotations: read },
    guard(({ topic }: { topic: string }) => draftFollowups(options.answerer, pickTopic(engine.fixture.topics, topic, topic), answerTopic(engine, topic, topic))),
  );
  server.registerTool(
    "engine_run_schedule",
    { description: "Replay the first hour after the sources were connected: each tool read on its own cadence, with records changed, facts added, the links formed (edges), and how the decision changed after each read.", inputSchema: { minutes: z.number().int().min(5).max(240).default(60) }, annotations: read },
    guard(async ({ minutes }: { minutes: number }) => replaySchedule(engine.fixture, options, minutes)),
  );
  server.registerTool(
    "engine_record_call",
    {
      description:
        "Record a call on an action (accept, override, defer, exception) with a reason; say in the reason who made it. Facts stated go in " +
        "assertions (e.g. {subject: 'group:billing-admins', predicate: 'break_glass_exempt', value: 4}); they are kept in decision " +
        "memory, attributed, and the next engine_decide uses and cites them. Returns how the decision changed.",
      inputSchema: {
        action: z.string().min(1).max(100), call: z.enum(["accept", "override", "defer", "exception"]),
        reason: z.string().min(1).max(500), assertions: z.array(z.strictObject({ subject: z.string().max(200), predicate: z.string().max(80), value })).max(10).default([]),
        disputes_source: z.string().min(1).max(50).optional(),
      },
      annotations: write,
    },
    // The author is the authenticated session, never an argument the caller chooses.
    guard((a: { action: string; call: "accept" | "override" | "defer" | "exception"; reason: string; assertions: { subject: string; predicate: string; value: string | number | boolean }[]; disputes_source?: string }) =>
      engine.recordCall(a.action, a.call, ACTOR, a.reason, a.assertions, a.disputes_source)),
  );
  server.registerTool(
    "engine_weekly_brief",
    { description: "The weekly brief for the CISO, in Markdown: next moves by risk removed, hours back, what was deferred and why, calls recorded, and evidence not used.", inputSchema: {}, annotations: read },
    guard(() => weeklyBrief(engine)),
  );
  server.registerTool(
    "engine_next_moves",
    { description: "The full precomputed decision across every topic: moves, deferred actions with reasons, unresolved evidence, hours back, capacity used.", inputSchema: {}, annotations: read },
    guard(() => engine.nextMoves()),
  );
  server.registerTool(
    "engine_status",
    { description: "What each layer holds: connectors and their schedules, facts (derived, stale, rejected), weights, graph size, memory, and the topics you can ask about.", inputSchema: {}, annotations: read },
    guard(() => engine.status()),
  );
  server.registerTool(
    "engine_graph",
    { description: "The context graph around a node (e.g. control:billing-admin-access, person:alex, app:billing), with the source revisions behind each edge.", inputSchema: { node: z.string().min(1).max(200), depth: z.number().int().min(1).max(3).default(2) }, annotations: read },
    guard(({ node, depth }: { node: string; depth: number }) => ({ node, edges: engine.graph.around(node, depth) })),
  );
  server.registerTool(
    "engine_memory",
    { description: "Decision memory: reads, decisions, calls, weight changes and tuning proposals, hash chained.", inputSchema: { kind: z.enum(["read", "decision", "call", "weight_change", "proposal"]).optional() }, annotations: read },
    guard(({ kind }: { kind?: "read" | "decision" | "call" | "weight_change" | "proposal" }) => ({ chain_intact: engine.memory.verify(), entries: engine.memory.list(kind) })),
  );
  server.registerTool(
    "engine_set_weight",
    { description: "Change how much the company trusts a source (0 to 5). Logged with the reason, then the decision is recomputed.", inputSchema: { connector: z.string().min(1).max(50), weight: z.number().int().min(0).max(5), reason: z.string().min(1).max(500) }, annotations: write },
    guard(({ connector, weight, reason }: { connector: string; weight: number; reason: string }) => engine.setWeight(connector, weight, ACTOR, reason)),
  );
}
