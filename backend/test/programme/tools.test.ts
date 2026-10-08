// Exercise the programme tools through a real MCP client, the way Claude Code calls them.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import fixture from "../../../proof/fixtures/programme.json";
import { registerProgrammeTools } from "../../src/programme/tools";

async function connect() {
  const server = new McpServer({ name: "test", version: "0" });
  registerProgrammeTools(server, structuredClone(fixture));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    return r.isError ? { error: r.content[0].text } : r.structuredContent;
  };
  return { client, call };
}

describe("programme MCP tools", () => {
  it("lists four read-only tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["programme_evidence", "programme_overview", "programme_reassess", "programme_recommend"]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it("recommends the recorded baseline portfolio", async () => {
    const { call } = await connect();
    const r = await call("programme_recommend", { case_id: "baseline" });
    expect(r).toMatchObject({ record_id: "3f7d9d3a0929306a8dfd1df0cc8e7d4720cbeb80bc9549debbc6ee7ef3e80659", synthetic: true, selected: ["ai_data_review", "application_fix", "record_cleanup", "recovery_fix"] });
  });

  it("requires a label for counterfactual capacity and keeps the case value alongside it", async () => {
    const { call } = await connect();
    expect(await call("programme_recommend", { case_id: "baseline", capacity: { platform_half_days: 2 } })).toEqual({ error: "Rejected: A capacity change needs a counterfactual_label" });
    const r = await call("programme_recommend", { case_id: "baseline", capacity: { platform_half_days: 2 }, counterfactual_label: "Platform loses three days to an outage" });
    expect(r.capacity.platform_half_days).toBe(2);
    expect(r.capacity_counterfactual).toMatchObject({ label: "Platform loses three days to an outage", case_capacity: { platform_half_days: 8 } });
    expect(r.usage_range.high.platform_half_days).toBeLessThanOrEqual(2);
  });

  it("replays the recorded reassessment", async () => {
    const { call } = await connect();
    const r = await call("programme_reassess", {
      from_case: "baseline", to_case: "incident",
      owner_selected: ["recovery_fix", "application_fix", "ai_data_review"],
      owner_rationale: "Keep the remaining half day as contingency instead of cleaning records.",
    });
    expect(r.later.record_id).toBe("5b7d31c8fca677052e37180d307242cf30e32edda15035d9092ec515bb0e268f");
    expect(r.later.changes.owner_choice_now_needs_review).toBe(true);
  });

  it("rejects an owner choice that skips the evidence prerequisite", async () => {
    const { call } = await connect();
    const r = await call("programme_reassess", { from_case: "baseline", to_case: "incident", owner_selected: ["identity_fix"], owner_rationale: "x" });
    expect(r.error).toMatch(/unmet evidence prerequisite/);
  });
});
