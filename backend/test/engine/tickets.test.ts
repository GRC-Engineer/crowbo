import { describe, expect, it } from "vitest";
import { answerTopic } from "../../src/engine/answer";
import { CONNECTORS } from "../../src/engine/connectors";
import { demoOptions } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_TICKETS } from "../../src/engine/fixture-tickets";
import type { CompanyFixture } from "../../src/engine/model";
import { MemoryEngineStore } from "../../src/engine/store";
import { jira, launchLines, linear, type TicketsProvider, ticketsConnector } from "../../src/engine/tickets";

const S10 = "launch-without-review";
const withProvider = (p: TicketsProvider) => ({ ...demoOptions(), connectors: CONNECTORS.map((c) => (c.id === "tickets" ? ticketsConnector(p) : c)) });
const start = (p: TicketsProvider, fixture: CompanyFixture = NORTHWIND_TICKETS) => Engine.start(structuredClone(fixture), withProvider(p));
const fact = (e: Engine, subject: string, predicate: string) => e.facts.find((f) => f.subject === subject && f.predicate === predicate && f.freshness === "fresh");
const scenario = (e: Engine, id: string) => e.nextMoves().scenarios.find((s) => s.scenario === id)!.state;

describe("tickets: one connector class, two providers", () => {
  it("Linear and Jira give the same S10 exposure: checkout-v2 handles customer data with no security review, so the review is due before the launch", async () => {
    for (const p of [linear, jira]) {
      const e = await start(p);
      expect(fact(e, "launch:checkout-v2", "unreviewed_customer_data")!.quote).toBe("checkout-v2 on 2026-11-10 handles customer-pii, payment-card; security review: none");
      expect(scenario(e, S10)).toBe("gap_supported");
      const move = e.nextMoves().next_moves.find((m) => m.action === "review-before-launch")!;
      expect([move.decides, move.due, move.due_reason]).toEqual(["person:priya", "2026-11-10", "before checkout v2"]);
    }
  });

  it("weights name the class; records keep their provider; citations show its label", async () => {
    for (const [p, label] of [[linear, "Linear"], [jira, "Jira"]] as const) {
      const e = await start(p);
      expect(e.weightsTable().map((w) => w.connector)).toContain("tickets");
      expect(e.records.get(`tickets:${p.id}/launch/checkout-v2`)).toMatchObject({ connector: "tickets", provider: p.id });
      const a = answerTopic(e, "Which launches handle customer data without a security review?");
      expect(a.sources.some((s) => s.label === label && s.connector === "tickets")).toBe(true);
    }
  });

  it("the edges: launch includes feature, feature handles data class, launch led by a person", async () => {
    const e = await start(linear);
    const edges = e.graph.all().map((x) => `${x.from} ${x.rel} ${x.to}`);
    expect(edges).toEqual(expect.arrayContaining([
      "launch:checkout-v2 includes feature:checkout-redesign", "feature:checkout-redesign handles_data data:customer-pii",
      "feature:saved-cards handles_data data:payment-card", "launch:checkout-v2 led_by person:priya", "launch:checkout-v2 depends_on control:security-review",
    ]));
  });
});

describe("tickets: S10 holds only on evidence", () => {
  it("a finished security review is no gap", async () => {
    const done = structuredClone(NORTHWIND_TICKETS);
    const search = done.api.find((r) => r.path === "/rest/api/3/search?jql=project%3DNW")!.versions[0].body as { issues: unknown[]; total: number };
    search.issues.push({ fields: { labels: ["security-review"], status: { statusCategory: { key: "done" } }, assignee: { emailAddress: "dana@northwind.example" }, fixVersions: [{ name: "checkout-v2" }] } });
    search.total = 4;
    const e = await start(jira, done);
    expect(fact(e, "launch:checkout-v2", "security_review")!.value).toBe("done");
    expect(scenario(e, S10)).toBe("no_gap_observed");
  });

  it("a partial read states nothing about the review, so S10 stays unresolved instead of looking reviewed or unreviewed", async () => {
    const partial = structuredClone(NORTHWIND_TICKETS);
    (partial.api.find((r) => r.path === "/rest/api/3/search?jql=project%3DNW")!.versions[0].body as { total: number }).total = 120;
    const e = await start(jira, partial);
    expect(fact(e, "launch:checkout-v2", "security_review")).toBeUndefined();
    expect(scenario(e, S10)).toBe("unresolved");
    expect(launchLines({ key: "x", start_date: null, lead: null, complete: false, issues: [{ labels: ["security-review"], done: false, assignee: null }] })).toContain("launch:x security_review open");
  });

  it("which data is customer data comes from the company's register, not the label: without the classification, S10 is unresolved", async () => {
    const unclassified = structuredClone(NORTHWIND_TICKETS);
    const reg = unclassified.api.find((r) => r.path.startsWith("/v4/spreadsheets/controls-register"))!.versions[0].body as { values: string[][] };
    reg.values = reg.values.filter((row) => row[2] !== "customer_data");
    const e = await start(linear, unclassified);
    expect(fact(e, "launch:checkout-v2", "unreviewed_customer_data")).toBeUndefined();
    expect(scenario(e, S10)).toBe("unresolved");
  });

  it("the default demo is unchanged: two moves, due before audit prep, cited from Linear", async () => {
    const e = await Engine.start(structuredClone(NORTHWIND), demoOptions());
    expect(e.nextMoves().next_moves.map((m) => [m.action, m.due])).toEqual([["drop-access-screenshots", "2027-01-11"], ["move-unused-to-operator", "2026-11-24"]]);
    expect(answerTopic(e, "Who should still have billing admin?").sources.find((s) => s.connector === "tickets")!.label).toBe("Linear");
  });
});

describe("tickets: a stored engine from before the class", () => {
  it("moves linear to tickets with a logged weight change and reads again", async () => {
    const store = new MemoryEngineStore();
    await Engine.open(structuredClone(NORTHWIND), demoOptions(), store);
    const old = store.load()!;
    old.records = old.records.map((r) => (r.connector === "tickets" ? { ...r, connector: "linear", id: r.id.replace("tickets:linear/launch/", "linear:project/") } : r));
    old.readAt = Object.fromEntries(Object.entries(old.readAt).map(([k, v]) => [k === "tickets" ? "linear" : k, v]));
    const e = await Engine.open(structuredClone(NORTHWIND), demoOptions(), new MemoryEngineStore(old));
    expect(e.memory.list("weight_change").at(-1)!.body).toMatchObject({ connector: "tickets", renamed_from: "linear", from: 3, to: 3 });
    await e.catchUp();
    expect(e.records.has("tickets:linear/launch/audit-prep")).toBe(true);
    expect(e.nextMoves().next_moves.find((m) => m.action === "move-unused-to-operator")!.due).toBe("2026-11-24");
  });
});
