// Port of tests/test_mcp.py. Python drove build_server through session factories and a stdio
// subprocess; the TypeScript server is built with buildServer(invoke), where invoke runs the
// shared operation table over an in-memory tenant, and a real SDK Client connects over
// InMemoryTransport. The HTTP endpoint itself is covered by test/scenarios/http.test.ts.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { logicalId } from "../../src/domain/contracts";
import { buildServer, type Invoke } from "../../src/app/mcp";
import { type Context, run } from "../../src/app/operations";
import type { FetchLike } from "../../src/providers/http";
import { feedbackRequest } from "../../src/services/feedback";
import { type Evidence, headId } from "../../src/services/evidence";
import { configured, reply } from "../services/decision-fixtures";
import { makeEngine, makeItem, MemoryLedger, type MemoryStore, now } from "../helpers";

const ORIGINAL_TOOLS = ["search_evidence", "inspect_evidence", "run_decision", "inspect_result", "record_feedback", "inspect_feedback"];

export function contextFor(engine: Evidence, store: MemoryStore, fetch: FetchLike | undefined, token: string | null = "test-token"): Context {
  return {
    caller: { settings: engine.settings, roles: ["operator"] },
    store,
    ledger: new MemoryLedger(),
    ai: { account: engine.settings.cloudflare_account, gateway: engine.settings.gateway, token, fetch },
    slackToken: null,
    questions: engine.questions,
    allowSyntheticGates: false,
  };
}

const invoker =
  (ctx: Context): Invoke =>
  (operation, args) =>
    run(ctx, operation, args);

/** A real SDK client connected in-process. `requestVersion` pins the version the client asks for. */
async function connect(invoke: Invoke, requestVersion?: string) {
  const server = buildServer(invoke);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  let negotiated: string | undefined;
  const transport = Object.assign(clientSide, {
    setProtocolVersion: (version: string) => {
      negotiated = version;
    },
  });
  if (requestVersion) {
    const send = transport.send.bind(transport);
    transport.send = (message: JSONRPCMessage, options) => {
      if ("method" in message && message.method === "initialize") {
        message = { ...message, params: { ...message.params, protocolVersion: requestVersion } };
      }
      return send(message, options);
    };
  }
  const client = new Client({ name: "crowbo-test", version: "0" });
  await client.connect(transport);
  return { client, negotiated: () => negotiated, close: () => client.close() };
}

const text = (result: any) => result.content[0].text as string;

function makeFeedbackInput(result: Record<string, any>) {
  return JSON.parse(
    JSON.stringify(
      feedbackRequest.parse({
        result_id: result.id,
        reviewed_at: now(),
        choice: { kind: "alternative", alternative_index: 0 },
        rationale: "Synthetic reviewer chooses the independently confirmed urgent work.",
        corrections: [{ statement: "Capacity remains unknown.", basis: "Operator assertion" }],
        revisit_when: ["A confirmed delivery owner supplies an estimate."],
      }),
    ),
  );
}

describe("MCP server", () => {
  it("py: tests/test_mcp.py::test_wire_decision_and_history_reject_revoked_contributor", async () => {
    const { engine, store } = makeEngine();
    const [item, request] = await configured(engine, makeItem());
    const ctx = contextFor(engine, store, async () => reply());
    const { client, close } = await connect(invoker(ctx));
    try {
      const inspected: any = await client.callTool({ name: "inspect_evidence", arguments: { source_ids: [...request.source_ids] } });
      expect(inspected.isError ?? false).toBe(false);
      expect(inspected.structuredContent.records[0].title).toBe(item.source.title);
      const result: any = await client.callTool({ name: "run_decision", arguments: { request: JSON.parse(JSON.stringify(request)) } });
      expect(result.isError ?? false).toBe(false);
      const body = result.structuredContent;
      expect(body.decision.calculation.status).toBe("missing_input");
      expect(body.answer.recommendation).toBe("Ask the accountable owner to confirm the obligation and capacity.");
      const saved: any = await client.callTool({ name: "inspect_result", arguments: { result_id: body.id } });
      expect(saved.structuredContent.decision_ready).toBe(true);
      expect(saved.structuredContent.feasibility_checked).toBe(false);
      const feedbackInput = makeFeedbackInput(body);
      const feedback: any = await client.callTool({ name: "record_feedback", arguments: { request: feedbackInput } });
      expect(feedback.isError ?? false).toBe(false);
      const feedbackBody = feedback.structuredContent;
      const replay: any = await client.callTool({ name: "record_feedback", arguments: { request: feedbackInput } });
      expect(replay.structuredContent).toEqual(feedbackBody);
      const inspectedFeedback: any = await client.callTool({ name: "inspect_feedback", arguments: { feedback_id: feedbackBody.id } });
      expect(inspectedFeedback.structuredContent).toEqual(feedbackBody);
      const nextInput = { ...JSON.parse(JSON.stringify(request)), case_version: "2", prior_feedback_id: feedbackBody.id };
      const child: any = await client.callTool({ name: "run_decision", arguments: { request: nextInput } });
      expect(child.isError ?? false).toBe(false);
      expect(child.structuredContent.decision.reassessment.prior_result_id).toBe(body.id);

      store.rows.get(headId(logicalId(item.source)))!.grant.revoked = true;
      const denied: any = await client.callTool({ name: "inspect_result", arguments: { result_id: body.id } });
      expect(denied.isError).toBe(true);
      expect(text(denied)).toContain("permission is unavailable");
      expect(text(denied)).not.toContain(item.source.text);
      for (const [tool, args] of [
        ["inspect_feedback", { feedback_id: feedbackBody.id }],
        ["inspect_result", { result_id: child.structuredContent.id }],
      ] as const) {
        const refused: any = await client.callTool({ name: tool, arguments: args });
        expect(refused.isError).toBe(true);
        expect(text(refused)).toContain("permission is unavailable");
      }
    } finally {
      await close();
    }
  });

  // Python negotiated 2026-07-28 ("auto") and 2025-11-25 ("legacy") over stdio. The TypeScript
  // SDK's latest version is 2025-11-25, so "auto" asserts that and "legacy" pins 2025-06-18.
  // py: tests/test_mcp.py::test_stdio_client_discovers_tools_and_rejects_unbounded_inputs[auto-2026-07-28]
  // py: tests/test_mcp.py::test_stdio_client_discovers_tools_and_rejects_unbounded_inputs[legacy-2025-11-25]
  for (const [mode, requested, expected] of [
    ["auto-2026-07-28", undefined, "2025-11-25"],
    ["legacy-2025-11-25", "2025-06-18", "2025-06-18"],
  ] as const) {
    it(`tests/test_mcp.py::test_stdio_client_discovers_tools_and_rejects_unbounded_inputs[${mode}]`, async () => {
      const { engine, store } = makeEngine();
      const ctx = contextFor(engine, store, async () => {
        throw new Error("No provider call is expected");
      });
      const { client, negotiated, close } = await connect(invoker(ctx), requested);
      try {
        expect(negotiated()).toBe(expected);
        const listed = await client.listTools();
        const names = listed.tools.map((tool) => tool.name);
        // The TypeScript server adds the standing-decision tools; the original six must remain.
        for (const name of ORIGINAL_TOOLS) expect(names).toContain(name);
        expect(names.filter((name) => !ORIGINAL_TOOLS.includes(name)).sort()).toEqual(["ask_standing_decision", "survey_standing_decisions"]);
        // No tool acquires new sources.
        expect(names.some((name) => /ingest|sync|resume|acquire|capture/.test(name))).toBe(false);
        const annotations = Object.fromEntries(listed.tools.map((tool) => [tool.name, tool.annotations]));
        for (const name of ["search_evidence", "inspect_evidence", "inspect_result", "inspect_feedback", "ask_standing_decision", "survey_standing_decisions"]) {
          expect(annotations[name]).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
        }
        expect(annotations.run_decision).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
        expect(annotations.record_feedback).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true });

        let rejected: any = await client.callTool({ name: "search_evidence", arguments: { query: "fictional", limit: 50 } });
        expect(rejected.isError).toBe(true);
        expect(text(rejected)).toContain("Too big: expected number to be <=8");
        rejected = await client.callTool({ name: "inspect_evidence", arguments: { source_ids: ["../../secrets"] } });
        expect(rejected.isError).toBe(true);
        expect(text(rejected)).toContain("Invalid string: must match pattern /^[a-f0-9]{64}$/");
        rejected = await client.callTool({ name: "record_feedback", arguments: { request: { result_id: "../private", authority_verified: true } } });
        expect(rejected.isError).toBe(true);
        expect(text(rejected)).toBe("Input or stored record failed schema validation; no input values printed");
        expect(store.writes).toBe(0);
      } finally {
        await close();
      }
    });
  }

  it("py: tests/test_mcp.py::test_provider_exception_does_not_escape_to_mcp", async () => {
    const bounded = "Crowbo could not complete this operation; inspect the private runtime receipt";
    // The invocation itself fails (Python: the session factory raised).
    const { client, close } = await connect(async () => {
      throw new Error("sensitive upstream response and secret");
    });
    try {
      const result: any = await client.callTool({ name: "search_evidence", arguments: { query: "fictional" } });
      expect(result.isError).toBe(true);
      expect(text(result)).toBe(bounded);
      expect(JSON.stringify(result)).not.toContain("secret");
    } finally {
      await close();
    }
    // A provider failing inside the operation is bounded by the operation boundary too.
    const { engine, store } = makeEngine();
    store.search = async () => {
      throw new Error("sensitive upstream response and secret");
    };
    const second = await connect(invoker(contextFor(engine, store, undefined)));
    try {
      const result: any = await second.client.callTool({ name: "search_evidence", arguments: { query: "fictional" } });
      expect(result.isError).toBe(true);
      expect(text(result)).toBe(bounded);
      expect(JSON.stringify(result)).not.toContain("secret");
    } finally {
      await second.close();
    }
  });

  it("py: tests/test_mcp.py::test_session_closes_runtime_if_provider_creation_fails", async () => {
    // TypeScript has no per-session runtime to close; the analogue is that a provider which
    // cannot be created fails the call closed, before any write, and the server stays usable.
    const { engine, store } = makeEngine();
    const [, request] = await configured(engine, makeItem());
    const writes = store.writes;
    const ctx = contextFor(engine, store, async () => {
      throw new Error("No provider call is expected");
    }, null);
    const { client, close } = await connect(invoker(ctx));
    try {
      const failed: any = await client.callTool({ name: "run_decision", arguments: { request: JSON.parse(JSON.stringify(request)) } });
      expect(failed.isError).toBe(true);
      expect(text(failed)).toBe("Required provider credential is unavailable");
      expect(store.writes).toBe(writes);
      const inspected: any = await client.callTool({ name: "inspect_evidence", arguments: { source_ids: [...request.source_ids] } });
      expect(inspected.isError ?? false).toBe(false);
    } finally {
      await close();
    }
  });
});
