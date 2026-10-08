// The engine prototype, tested through its interface: one test per promise of the architecture.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND, NORTHWIND_MODEL_LABELS } from "../../src/engine/fixture";
import { registerEngineTools } from "../../src/engine/tools";

const engine = () => new Engine(structuredClone(NORTHWIND), { modelLabels: NORTHWIND_MODEL_LABELS, clock: () => "2026-10-08T09:00:00Z" });
const ids = (xs: { action: string }[]) => xs.map((x) => x.action);

describe("01 ingest", () => {
  it("withholds records the viewer may not read before anything is derived from them", () => {
    const e = engine();
    expect(e.status().layers["01_ingest"].records_withheld_from_viewer).toBe(1);
    expect(JSON.stringify(e.graphAround("person:alex"))).not.toContain("billing-admins"); // the restricted termination record
  });
});

describe("02 classify and weight", () => {
  it("binds every fact to an exact quote and rejects a model label whose quote is not in the source", () => {
    const e = engine();
    expect(e.status().layers["02_classify_and_weight"].facts_rejected_unquoted).toBe(1);
    const moves = e.nextMoves().next_moves;
    for (const m of moves) for (const c of m.evidence) expect(c.quote.length).toBeGreaterThan(0);
  });

  it("source text cannot instruct the engine: the injected Slack line changes nothing", () => {
    const clean = structuredClone(NORTHWIND);
    clean.records = clean.records.map((r) => (r.connector === "slack" ? { ...r, text: r.text.split("\n")[0] } : r));
    const labels = { [`${clean.records.find((r) => r.connector === "slack")!.id}@1`]: NORTHWIND_MODEL_LABELS["slack:C0GRC/1728300000.000100@1"].map((l) => ({ ...l })) };
    const withoutInjection = new Engine(clean, { modelLabels: labels }).nextMoves();
    expect(ids(engine().nextMoves().next_moves)).toEqual(ids(withoutInjection.next_moves));
  });

  it("weights are visible and editable, and a change is logged and moves the decision", () => {
    const e = engine();
    expect(ids(e.nextMoves().next_moves)).toContain("drop-access-screenshots");
    const r = e.setWeight("slack", 1, "grc-lead", "Slack threads are not proof");
    expect(r.decision_changed).toBe(true);
    expect(ids(r.decision.next_moves)).not.toContain("drop-access-screenshots");
    expect(e.memory.list("weight_change")[0].body).toMatchObject({ connector: "slack", from: 2, to: 1 });
  });
});

describe("03 context graph", () => {
  it("gives each move an owner and a due date from relationships no single tool holds", () => {
    const fix = engine().nextMoves().next_moves.find((m) => m.action === "fix-billing-access")!;
    expect(fix.owner).toBe("person:dana"); // from Vanta
    expect(fix.due).toBe("2026-11-15"); // from the Linear launch that depends on the control
    const edges = engine().graphAround("control:billing-access-review").edges;
    expect(edges.every((e) => e.contributors.length > 0)).toBe(true);
  });
});

describe("decide: the next move, by risk removed", () => {
  it("drops a control that never moved the risk, and spends the hours it gives back on the biggest risk", () => {
    const d = engine().nextMoves();
    expect(ids(d.next_moves)).toEqual(["drop-access-screenshots", "fix-billing-access"]);
    expect(d.hours_back.security_hours).toBe(21);
    expect(d.deferred.find((x) => x.action === "build-deploy-approval")!.reason).toBe("Does not fit this horizon: short by 8 engineering hours");
    expect(d.deferred.find((x) => x.action === "fund-device-management")!.reason).toMatch(/no gap observed/);
  });

  it("is deterministic: same inputs, same decision ID", () => {
    expect(engine().nextMoves().id).toBe(engine().nextMoves().id);
  });

  it("stays current: new evidence makes the old decision stale and reranks", () => {
    const e = engine();
    const r = e.arrive("okta-cleanup");
    expect(r.stale_before).toBe(true);
    expect(r.removed).toEqual(["fix-billing-access"]);
    expect(r.added).toEqual(["build-deploy-approval"]);
    const jamf = e.arrive("jamf-report");
    expect(e.nextMoves().deferred.find((x) => x.action === "fund-device-management")!.reason).toMatch(/\$5k cash/);
    expect(jamf.added).toEqual([]);
  });
});

describe("04 decision memory", () => {
  it("keeps every call and weight change, hash chained, and only proposes tuning", () => {
    const e = engine();
    e.recordCall("fix-billing-access", "override", "grc-lead", "Okta group is already being cleaned", "okta");
    const second = e.recordCall("fix-billing-access", "override", "grc-lead", "Still being cleaned", "okta");
    expect(second.proposals).toEqual([{ connector: "okta", from: 5, to: 4, disputes: 2 }]);
    expect(e.weightsTable().find((w) => w.connector === "okta")!.weight).toBe(5); // unchanged until approved
    expect(e.memory.verify()).toBe(true);
    (e.memory.list()[1].body as any).reason = "edited";
    expect(e.memory.verify()).toBe(false);
  });
});

describe("surface: MCP", () => {
  it("serves the engine to any harness", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerEngineTools(server, engine());
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["engine_explain", "engine_graph", "engine_memory", "engine_next_moves", "engine_record_call", "engine_set_weight", "engine_simulate_evidence", "engine_status"]);
    const r: any = await client.callTool({ name: "engine_set_weight", arguments: { connector: "okta", weight: 9, reason: "x" } });
    expect(r.isError).toBe(true);
  });
});
