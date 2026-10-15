import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ENGINE_INPUTS, type EngineOp } from "./port";

/**
 * The engine over MCP, so any harness (Claude Code, Cursor, Codex, Gemini) can use it. A thin table:
 * each tool is one engine operation (port.ts), run in-process locally or inside the caller's tenant
 * Durable Object on the Worker. The harness model phrases the answer; the card is self-explaining.
 */

export const ENGINE_INSTRUCTIONS =
  "Crowbo engine on demo data built on a case a future customer raised. It reads the company's tools on their " +
  "own schedules, joins facts across them, and precomputes the next move by risk removed with deterministic " +
  "arithmetic over visible weights. Use engine_decide for a question and present its answer: cite its numbered " +
  "sources exactly, explain the ranking from its basis, never settle stale or conflicting evidence yourself, and " +
  "never invent numbers. Use engine_what_if to explore weights without changing anything. Record a person's " +
  "call with engine_record_call; facts in it are kept and used next time.";

/** The crow, so clients that show server icons show Crowbo's: the hosted mark and an inline copy for offline use. */
export const CROW_ICON_URL = { src: "https://crowbo.ai/assets/apple-touch-icon.png", mimeType: "image/png", sizes: ["180x180"] };
export const CROW_ICON_INLINE = { src: "data:image/png;base64,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", mimeType: "image/png", sizes: ["32x32"] };
export const CROW_ICON = CROW_ICON_URL;


export type EngineInvoke = (op: EngineOp, args: unknown) => Promise<unknown>;

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });
const fail = (error: unknown) => ({ isError: true, content: [{ type: "text" as const, text: `Rejected: ${(error as Error).message}` }] });
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

const TOOLS: { name: string; op: EngineOp; writes: boolean; description: string }[] = [
  { name: "engine_decide", op: "decide", writes: false, description: "Answer a question (e.g. 'Who should still have billing admin?') from the precomputed decision: numbered sources with weight, freshness and coverage; the finding (deciding facts marked); the move with risk removed and hours; who decides and delivers by when; conditions; unresolved evidence; the basis (scenario estimates, confidence, score, rank, alternatives, weights) and the outcomes recorded so far. lookup_ms is the decision lookup." },
  { name: "engine_what_if", op: "what_if", writes: false, description: "Recompute the decision with different source weights (0 to 5) on a copy, and show what would change. Nothing is written or kept." },
  { name: "engine_draft_followups", op: "draft_followups", writes: false, description: "Draft the follow-up messages for a topic's move: the decider, the person delivering, and the affected people. Drafts only; sent is always false and nothing can send." },
  { name: "engine_run_schedule", op: "run_schedule", writes: false, description: "Replay the first hour after the sources were connected: each tool read on its own cadence, with records changed, facts added, the links formed, and how the decision changed after each read." },
  { name: "engine_record_call", op: "record_call", writes: true, description: "Record a call on an action (accept, override, defer, exception) with a reason; say in the reason who made it. Facts stated go in assertions (only break_glass_exempt today, e.g. {subject: 'group:billing-admins', predicate: 'break_glass_exempt', value: 4}); they are kept, attributed, and used by the next answer." },
  { name: "engine_record_outcome", op: "record_outcome", writes: true, description: "Say what was actually done about a proposed move (done, partly_done, not_done_by_due, diverged) and how, for what the connected tools cannot show. Outcomes the tools can show are recorded automatically." },
  { name: "engine_advance_time", op: "advance_time", writes: true, description: "Demo only: move the demo clock forward by hours. The reads that fall due run, and what was done since the decision is recorded as an outcome." },
  { name: "engine_weekly_brief", op: "weekly_brief", writes: false, description: "The weekly brief for the CISO, in Markdown: next moves by risk removed with their sources, hours back, what was deferred and why, calls recorded, and evidence not used." },
  { name: "engine_next_moves", op: "next_moves", writes: false, description: "The full precomputed decision across every topic: moves, deferred actions with reasons, unresolved evidence, hours back, capacity used." },
  { name: "engine_status", op: "status", writes: false, description: "What each layer holds: connectors and their schedules, facts (derived, stale, rejected), weights, graph size, memory, the demo clock, and the topics you can ask about." },
  { name: "engine_graph", op: "graph", writes: false, description: "The context graph around a node (e.g. control:billing-admin-access, person:alex, app:billing), with the source revisions behind each edge." },
  { name: "engine_memory", op: "memory", writes: false, description: "Decision memory: reads, decisions, calls, outcomes, weight changes, tuning proposals and clock moves, hash chained." },
  { name: "engine_reset_demo", op: "reset", writes: true, description: "Start your copy of the demo over from its first morning: clears your calls, outcomes, weight changes and clock. Pass confirm: true." },
  { name: "engine_import_knowledge_base", op: "import_knowledge_base", writes: true, description: "Import a synthetic knowledge-base export (policies, registers, the last audit report) as text files and get a first company profile: systems and owners, controls, people, stale entries, conflicts, and the first next moves on default weights. Markdown and text are read as prose. A CSV is typed only when you map it (shape triples for subject,field,value columns, or shape columns), and only for importable predicates; an unmapped CSV is prose. PDF and DOCX are listed as not read. Pass synthetic: true." },
  { name: "engine_set_weight", op: "set_weight", writes: true, description: "Change how much the company trusts a source (0 to 5). Kept with the reason, then the decision is recomputed. To explore without changing anything, use engine_what_if." },
];

export function registerEngineTools(server: McpServer, invoke: EngineInvoke): void {
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: ENGINE_INPUTS[t.op], annotations: t.writes ? write : read },
      async (args: unknown) => {
        try {
          return ok(await invoke(t.op, args));
        } catch (error) {
          return fail(error);
        }
      },
    );
  }
}
