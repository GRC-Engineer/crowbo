// Port of tests/test_scenarios.py. Synthetic client receipts test the acceptance gate without
// live providers. Python monkeypatched `Client`; the TypeScript runner takes a `connect` function.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, type ScenarioClient, type ToolResult } from "../../scripts/scenarios";

const toolResult = (value: unknown, error = false): ToolResult => ({ structuredContent: value, isError: error });

class FakeClient implements ScenarioClient {
  protocolVersion = "2025-11-25";
  calls: string[] = [];
  constructor(private readonly failure: string | null = null) {}

  async listTools() {
    return { tools: ["search_evidence", "inspect_evidence", "run_decision", "inspect_result"].map((name) => ({ name })) };
  }

  async callTool(name: string, args: Record<string, any>): Promise<ToolResult> {
    this.calls.push(name);
    if (name === "search_evidence") return toolResult({ records: [] }, args.limit === 50 || this.failure === "search");
    if (name === "inspect_evidence") {
      let records: any[] = args.source_ids.map((key: string) => ({ source_id: key, revision_id: "b".repeat(64) }));
      if (this.failure === "missing") records = [];
      else if (this.failure === "duplicate") records = [...records, ...records];
      else if (this.failure === "unexpected") records[0].source_id = "f".repeat(64);
      return toolResult({ records });
    }
    if (name === "run_decision") {
      const request = args.request;
      return toolResult({
        id: "c".repeat(64),
        simulated: true,
        decision: {
          calculation: { status: "missing_input" },
          bindings: Object.entries(request.expected_revisions).map(([key, revision]) => ({ source_id: key, revision_id: revision })),
        },
      });
    }
    return toolResult(
      {
        id: this.failure === "wrong_result" ? "d".repeat(64) : args.result_id,
        decision_ready: this.failure !== "stale",
        evidence_unchanged: this.failure !== "changed",
      },
      this.failure === "history",
    );
  }

  async close() {}
}

async function execute(failure: string | null = null) {
  const dir = mkdtempSync(join(tmpdir(), "crowbo-scenarios-"));
  const cases = join(dir, "cases.json");
  writeFileSync(
    cases,
    JSON.stringify({
      dataset: "synthetic-only",
      discovery_queries: ["fictional commitment"],
      cases: [{ request: { case_id: "synthetic-one", source_ids: ["a".repeat(64)] }, expected_calculation_status: "missing_input" }],
    }),
  );
  chmodSync(cases, 0o600);
  const output = join(dir, "new-result.json");
  const client = new FakeClient(failure);
  const printed: string[] = [];
  const status = await run(
    { url: "https://unused.example/mcp", tokenFile: "unused-token", cases, output },
    async () => client,
    (line) => printed.push(line),
  );
  return { status, report: JSON.parse(readFileSync(output, "utf8")), client, printed };
}

describe("MCP scenario runner", () => {
  it("py: tests/test_scenarios.py::test_complete_client_journey_passes_and_records_each_acceptance_check", async () => {
    const { status, report, printed } = await execute();
    expect(status).toBe(0);
    expect(report.discovery).toEqual([{ query: "fictional commitment", succeeded: true }]);
    expect(report.evidence_selection_complete).toBe(true);
    expect(report.result_inspection).toEqual({
      requested_id: "c".repeat(64),
      id_matches: true,
      decision_ready: true,
      evidence_unchanged: true,
      succeeded: true,
    });
    expect(report.cases[0].deterministic_checks).toEqual({ calculation_status: true, exact_revisions: true, simulation: true });
    // Output format: Python's json.dumps line per case.
    expect(printed).toEqual(['{"case": "synthetic-one", "completed": true, "checks": {"calculation_status": true, "exact_revisions": true, "simulation": true}}']);
  });

  // py: tests/test_scenarios.py::test_successful_decisions_do_not_hide_failed_discovery_or_history[search]
  // py: tests/test_scenarios.py::test_successful_decisions_do_not_hide_failed_discovery_or_history[history]
  // py: tests/test_scenarios.py::test_successful_decisions_do_not_hide_failed_discovery_or_history[wrong_result]
  // py: tests/test_scenarios.py::test_successful_decisions_do_not_hide_failed_discovery_or_history[stale]
  // py: tests/test_scenarios.py::test_successful_decisions_do_not_hide_failed_discovery_or_history[changed]
  for (const failure of ["search", "history", "wrong_result", "stale", "changed"]) {
    it(`tests/test_scenarios.py::test_successful_decisions_do_not_hide_failed_discovery_or_history[${failure}]`, async () => {
      const { status, report } = await execute(failure);
      expect(status).toBe(2);
      expect(report.cases[0].result.id).toBe("c".repeat(64));
      if (failure === "search") expect(report.discovery).toEqual([{ query: "fictional commitment", succeeded: false }]);
      else expect(report.result_inspection.succeeded).toBe(false);
    });
  }

  // py: tests/test_scenarios.py::test_inexact_inspection_fails_before_any_decision[missing]
  // py: tests/test_scenarios.py::test_inexact_inspection_fails_before_any_decision[duplicate]
  // py: tests/test_scenarios.py::test_inexact_inspection_fails_before_any_decision[unexpected]
  for (const failure of ["missing", "duplicate", "unexpected"]) {
    it(`tests/test_scenarios.py::test_inexact_inspection_fails_before_any_decision[${failure}]`, async () => {
      const { status, report, client } = await execute(failure);
      expect(status).toBe(2);
      expect(report.evidence_selection_complete).toBe(false);
      expect(report.failure).toBe("Evidence inspection failed or returned missing, duplicate or unexpected source IDs");
      expect(client.calls).toEqual(["search_evidence", "inspect_evidence"]);
    });
  }
});
