// The engine, tested through its interface: one test per promise of the architecture.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { answerTopic } from "../../src/engine/answer";
import { CONNECTORS } from "../../src/engine/connectors";
import { demoOptions, startDemo } from "../../src/engine/demo";
import { Engine, replaySchedule } from "../../src/engine/engine";
import { bind, CLEF_FLASH, clefExtractor, type WorkersAi } from "../../src/engine/extract";
import { NORTHWIND, NORTHWIND_CLEF_QUESTIONS } from "../../src/engine/fixture";
import { runEngine } from "../../src/engine/port";
import { registerEngineTools } from "../../src/engine/tools";

const Q = "Who should still have billing admin?";
const demo = () => startDemo().then((d) => d.engine);

describe("01 ingest", () => {
  it("withholds records the viewer may not read before anything is derived from them", async () => {
    const e = await demo();
    expect(e.withheld).toBe(1);
    expect(e.facts.some((f) => f.predicate === "terminated_on")).toBe(false);
  });

  it("re-reading unchanged data makes no new revision and no new decision", async () => {
    const e = await demo();
    const before = e.nextMoves().id;
    const entry = await e.read(CONNECTORS[0], "2026-10-13T10:00:00Z");
    expect(entry.records_changed).toBe(0);
    expect(entry.decision_diff).toBeNull();
    expect(e.nextMoves().id).toBe(before);
  });
});

describe("02 classify and weight", () => {
  it("rejects a model label whose quote is not in the source, and injected text yields nothing", async () => {
    const e = await demo();
    expect(e.rejected).toBe(1);
    expect(e.facts.some((f) => f.quote.includes("Ignore previous instructions"))).toBe(false);
    expect(e.facts.some((f) => f.predicate === "permits" && f.value === "manage_users")).toBe(false);
  });

  it("computes the 40 and the 31 across Okta and the billing log, with partial coverage carried", async () => {
    const e = await demo();
    const unused = e.facts.find((f) => f.predicate === "unused_90d")!;
    expect(unused.value).toBe(31);
    expect(unused.derived_from).toEqual([{ record: "billing:audit/90d", revision: 1 }, { record: "okta:group/billing-admins", revision: 1 }]);
    expect(unused.source.connector).toBe("derived");
    expect(unused.coverage).toMatchObject({ window_days: 90, days_with_data: 87 });
    expect(e.facts.find((f) => f.predicate === "holders" && f.kind === "derived")!.value).toBe(40);
  });

  it("stale evidence is shown and never used; the stale register conflicts with Okta", async () => {
    const a = answerTopic(await demo(), Q);
    expect(a.sources.find((s) => s.label === "Risk register")).toMatchObject({ freshness: "stale", conflicts_with: [1] });
    expect(a.answer.move!.cites).not.toContain(5);
  });

  it("a role's several permissions are not a conflict", async () => {
    const d = (await demo()).nextMoves();
    expect(d.unresolved.filter((u) => u.kind === "conflicting").map((u) => u.predicate)).toEqual(["holders"]);
  });

  it("weights are editable, logged, and move the decision", async () => {
    const e = await demo();
    const r = await e.setWeight("slack", 1, "grc-lead", "Slack threads are not proof");
    expect(r.decision_changed).toBe(true);
    expect(r.decision.next_moves.map((m) => m.action)).toEqual(["move-unused-to-operator"]);
    expect(e.memory.list("weight_change")[0].body).toMatchObject({ connector: "slack", from: 2, to: 1 });
  });
});

describe("Clef extractor", () => {
  it("asks typed questions per sentence, keeps the sentence as the quote, and applies the threshold", async () => {
    const seen: unknown[] = [];
    const ai: WorkersAi = {
      async run(model, input: any) {
        seen.push({ model, sentence: input.state.sentence });
        const yes = input.state.sentence.startsWith("The new Billing Operator role");
        return { answers: Object.fromEntries(Object.keys(input.questions).map((id) => [id, { type: "noul", noul: yes ? (id.includes("issue_refund") ? 0.7 : 0.95) : 0.02 }])) };
      },
    };
    const record = { id: "vendor-docs:billing-changelog", connector: "vendor-docs", rail: "business" as const, revision: 1, format: "prose" as const, observed_at: "2026-09-18", readers: ["grc-lead"], text: (NORTHWIND.api.find((r) => r.path === "/changelog/billing.md")!.versions[0].body as { markdown: string }).markdown };
    const { facts, rejected } = await bind(record, clefExtractor(ai, NORTHWIND_CLEF_QUESTIONS, CLEF_FLASH));
    expect(rejected).toBe(0);
    expect(facts.map((f) => f.value)).toEqual(["view_invoice", "export_report"]); // issue_refund at 0.7 is below 0.8
    expect(facts.every((f) => f.quote === "The new Billing Operator role can view invoices, export reports and issue refunds without admin rights.")).toBe(true);
    expect(facts[0].extractor).toBe("@cf/cloudflare/clef-flash@noul>=0.8");
    expect(seen.every((s: any) => s.model === CLEF_FLASH)).toBe(true);
  });

  it("an engine running Clef reaches the same move when the model agrees", async () => {
    const ai: WorkersAi = { run: async (_m, input: any) => ({ answers: Object.fromEntries(Object.keys(input.questions).map((id) => [id, { type: "noul", noul: input.state.sentence.includes("Billing Operator role can") || input.state.sentence.includes("accepted the Okta export") ? 0.9 : 0.05 }])) }) };
    const e = await Engine.start(structuredClone(NORTHWIND), demoOptions(ai));
    expect(e.nextMoves().next_moves.map((m) => m.action)).toEqual(["drop-access-screenshots", "move-unused-to-operator"]);
  });
});

describe("03 context graph", () => {
  it("decider, deliverer and due date come from links no single tool holds", async () => {
    const a = answerTopic(await demo(), Q);
    expect([a.answer.decides, a.answer.delivers, a.answer.due]).toEqual(["Priya", "Alex", { text: "before audit prep", date: "2026-11-24", cites: [4] }]);
  });
});

describe("decide", () => {
  it("the drop pays for itself first, then the fix, and the same inputs give the same decision", async () => {
    const [a, b] = [await demo(), await demo()];
    expect(a.nextMoves().next_moves.map((m) => m.action)).toEqual(["drop-access-screenshots", "move-unused-to-operator"]);
    expect(a.nextMoves().hours_back.security_hours).toBe(21);
    expect(a.nextMoves().id).toBe(b.nextMoves().id);
  });

  it("the schedule replay builds the decision from reads alone", async () => {
    const { log, final } = await replaySchedule(structuredClone(NORTHWIND), demoOptions(), 60);
    expect(log.find((e) => e.decision_diff?.added.includes("move-unused-to-operator"))!.connector).toBe("vendor-docs");
    expect(log.find((e) => e.decision_diff?.added.includes("drop-access-screenshots"))!.connector).toBe("slack");
    expect(final!.id).toBe((await demo()).nextMoves().id); // reads alone reach the same decision as a full sync
  });
});

describe("04 decision memory", () => {
  it("a recorded call becomes an attributed fact and the next answer uses and cites it", async () => {
    const e = await demo();
    const r = await e.recordCall("move-unused-to-operator", "override", "alex", "4 are break-glass accounts", [{ subject: "group:billing-admins", predicate: "break_glass_exempt", value: 4 }]);
    expect(r.decision_diff!.changed_reasons).toEqual(['move-unused-to-operator: now "Move the 27 unused billing admins to the Billing Operator role"']);
    const a = answerTopic(e, Q);
    expect(a.sources.map((s) => s.label)).toContain("Decision memory");
    expect(a.answer.finding.find((f) => f.text.includes("break-glass"))!.text).toBe("31 unused minus 4 break-glass accounts kept by decision = 27");
  });

  it("is hash chained, and tuning is only proposed", async () => {
    const e = await demo();
    await e.recordCall("move-unused-to-operator", "override", "alex", "Okta group sync is lagging", [], "okta");
    const second = await e.recordCall("move-unused-to-operator", "override", "alex", "Still lagging", [], "okta");
    expect(second.proposals).toEqual([{ connector: "okta", from: 5, to: 4, disputes: 2 }]);
    expect(e.weightsTable().find((w) => w.connector === "okta")!.weight).toBe(5);
    expect(e.memory.verify()).toBe(true);
    (e.memory.list()[1].body as any).records_changed = 99;
    expect(e.memory.verify()).toBe(false);
  });
});

describe("surface: MCP", () => {
  it("serves the engine tools, and drafts can never be sent", async () => {
    const { engine } = await startDemo();
    const server = new McpServer({ name: "test", version: "0" });
    registerEngineTools(server, (op, args) => runEngine(engine, "tester", op, args));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["engine_advance_time", "engine_decide", "engine_draft_followups", "engine_graph", "engine_memory", "engine_next_moves", "engine_record_call", "engine_record_outcome", "engine_reset_demo", "engine_run_schedule", "engine_set_weight", "engine_status", "engine_weekly_brief", "engine_what_if"]);
    const drafts: any = await client.callTool({ name: "engine_draft_followups", arguments: { topic: "billing-admin" } });
    expect(drafts.structuredContent.sent).toBe(false);
    expect(names.some((n) => /send|post/.test(n))).toBe(false);
  });
});
