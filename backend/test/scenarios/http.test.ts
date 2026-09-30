// The scenario runner against the real endpoint shape: src/worker.ts serving streamable HTTP at
// /mcp with bearer authentication. The tenant Durable Object is replaced by an in-process stub
// that runs the shared operation table over the in-memory store, as the object would.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));

const { tokenHash } = await import("../../src/app/auth");
const { run: operate } = await import("../../src/app/operations");
const { default: worker } = await import("../../src/worker");
const { httpConnector, run } = await import("../../scripts/scenarios");
const { configured, reply, MODEL } = await import("../services/decision-fixtures");
const { makeEngine, makeItem, MemoryLedger } = await import("../helpers");

const TOKEN = "synthetic-token-0123456789abcdef";

describe("MCP scenario runner over HTTP", () => {
  it("drives discovery, inspection, a decision, feedback and the schema denial through /mcp", async () => {
    const { engine, store } = makeEngine();
    const [item, request] = await configured(engine, makeItem());
    const env: any = {
      CLOUDFLARE_ACCOUNT_ID: engine.settings.cloudflare_account,
      DO_JURISDICTION: "none",
      CROWBO_OPERATORS: JSON.stringify({
        [tokenHash(TOKEN)]: { tenant: "synthetic", reader: "operator", source_scopes: ["fixture:public"], query_processors: ["turbopuffer", "voyage", MODEL], budget_usd: "10.00" },
      }),
      TENANT: {
        idFromName: (name: string) => name,
        get: () => ({
          operate: (caller: any, operation: string, args: unknown) =>
            operate(
              {
                caller,
                store,
                ledger: new MemoryLedger(),
                ai: { account: caller.settings.cloudflare_account, gateway: caller.settings.gateway, token: "test-token", fetch: async () => reply() },
                slackToken: null,
                allowSyntheticGates: false,
              },
              operation,
              args,
            ),
        }),
      },
    };
    const dir = mkdtempSync(join(tmpdir(), "crowbo-scenarios-http-"));
    const tokenFile = join(dir, "token");
    writeFileSync(tokenFile, TOKEN, { mode: 0o600 });
    const cases = join(dir, "cases.json");
    const { expected_revisions: _, ...unbound } = JSON.parse(JSON.stringify(request));
    writeFileSync(
      cases,
      JSON.stringify({
        dataset: "synthetic-only",
        discovery_queries: ["fictional access review"],
        cases: [
          {
            request: unbound,
            expected_calculation_status: "missing_input",
            feedback: {
              choice: { kind: "alternative", alternative_index: 0 },
              rationale: "Synthetic reviewer chooses the independently confirmed urgent work.",
            },
          },
        ],
      }),
    );
    chmodSync(cases, 0o600);
    const output = join(dir, "new-result.json");
    let authorized = 0;
    const connect = httpConnector(async (url, init) => {
      const req = new Request(url, init);
      if (req.headers.get("authorization") === `Bearer ${TOKEN}`) authorized++;
      return worker.fetch(req, env);
    });
    const printed: string[] = [];
    const status = await run({ url: "https://crowbo.test/mcp", tokenFile, cases, output }, connect, (line) => printed.push(line));
    const report = JSON.parse(readFileSync(output, "utf8"));
    expect(report.failure).toBeUndefined();
    expect(report.protocol_version).toBe("2025-11-25");
    expect(report.tools).toEqual(expect.arrayContaining(["search_evidence", "inspect_evidence", "run_decision", "inspect_result", "record_feedback", "inspect_feedback"]));
    expect(report.discovery).toEqual([{ query: "fictional access review", succeeded: true }]);
    expect(report.evidence_selection_complete).toBe(true);
    expect(report.cases[0].deterministic_checks).toEqual({
      calculation_status: true,
      exact_revisions: true,
      simulation: true,
      feedback_saved: true,
      reassessment_saved: true,
      feedback_referenced: true,
      reassessment_revisions: true,
      original_preserved: true,
    });
    expect(report.result_inspection.succeeded).toBe(true);
    expect(report.expected_schema_denial).toBe(true);
    expect(report.comparisons).toEqual([]);
    expect(status).toBe(0);
    expect(printed.length).toBe(2);
    expect(authorized).toBeGreaterThan(0);
    expect(item.source.title).toBe(report.calls.find((c: any) => c.tool === "inspect_evidence").result.structuredContent.records[0].title);

    // A wrong token never reaches the operations.
    const denied = await worker.fetch(new Request("https://crowbo.test/mcp", { method: "POST", headers: { authorization: "Bearer wrong-token-0123456789abcdef" } }), env);
    expect(denied.status).toBe(401);
  });
});
