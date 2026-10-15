import { describe, expect, it } from "vitest";
import { answerTopic } from "../../src/engine/answer";
import { CONNECTORS } from "../../src/engine/connectors";
import { demoOptions } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_IDENTITY } from "../../src/engine/fixture-identity";
import { googleWorkspace, type IdentityProvider, identityConnector, okta } from "../../src/engine/identity";
import { MemoryEngineStore } from "../../src/engine/store";

const IDENTITY_MOVES = ["disable-leaver-accounts", "review-standing-admins"];
const withProvider = (p: IdentityProvider) => ({ ...demoOptions(), connectors: CONNECTORS.map((c) => (c.id === "identity" ? identityConnector(p) : c)) });
const start = (p: IdentityProvider, fixture = NORTHWIND_IDENTITY) => Engine.start(structuredClone(fixture), withProvider(p));
const value = (e: Engine, subject: string, predicate: string) => e.facts.find((f) => f.subject === subject && f.predicate === predicate && f.freshness === "fresh")?.value;

describe("identity: one connector class, two providers", () => {
  it("Okta and Google Workspace give the same identity exposure: the same facts, scenarios and moves", async () => {
    const [a, b] = [await start(okta), await start(googleWorkspace)];
    for (const e of [a, b]) {
      expect(value(e, "group:workspace-super-admins", "review_overdue")).toBe(true);
      expect(value(e, "directory:accounts", "leavers_active")).toBe(1);
      expect(e.nextMoves().scenarios.map((s) => [s.scenario, s.state])).toEqual([["billing-exposure", "gap_supported"], ["standing-admin-unreviewed", "gap_supported"], ["leaver-access", "gap_supported"]]);
      expect(e.nextMoves().next_moves.map((m) => m.action).filter((x) => IDENTITY_MOVES.includes(x)).sort()).toEqual(IDENTITY_MOVES);
    }
  });

  it("weights and scenarios name the class; records keep their provider, and citations show its label", async () => {
    for (const [p, label] of [[okta, "Okta"], [googleWorkspace, "Google Workspace"]] as const) {
      const e = await start(p);
      expect(e.weightsTable().map((w) => w.connector)).toContain("identity");
      const accounts = e.records.get(`identity:${p.id}/accounts`)!;
      expect([accounts.connector, accounts.provider]).toEqual(["identity", p.id]);
      expect(answerTopic(e, "Who left but can still sign in?").sources.some((s) => s.label === label && s.connector === "identity")).toBe(true);
    }
  });

  it("a provider that holds no app owners leaves the decider missing, not guessed", async () => {
    const e = await start(googleWorkspace);
    expect(e.nextMoves().next_moves.find((m) => m.action === "review-standing-admins")!.decides).toBeNull();
    expect((await start(okta)).nextMoves().next_moves.find((m) => m.action === "review-standing-admins")!.decides).toBe("person:dana");
  });
});

describe("identity: the three scenarios", () => {
  it("leavers: someone HR shows as gone with an active account counts; one already deprovisioned does not; the claim names nobody", async () => {
    const e = await start(okta);
    expect(e.facts.find((f) => f.predicate === "leavers_active")!.quote).toBe("1 of 2 people who left still has an active account");
    expect(e.nextMoves().next_moves.find((m) => m.action === "disable-leaver-accounts")!.title).toBe("Disable the accounts still active for people who left (1 found)");
  });

  it("leavers keep the narrowest audience: without the HR grant the join sees no one who left, and the scenario stays unresolved", async () => {
    const e = await start(okta, { ...structuredClone(NORTHWIND_IDENTITY), grants: [] });
    expect(e.facts.some((f) => f.predicate === "terminated_on" || f.predicate === "leavers_active")).toBe(false);
    expect(e.nextMoves().scenarios.find((s) => s.scenario === "leaver-access")!.state).toBe("unresolved");
    expect(e.nextMoves().next_moves.map((m) => m.action)).not.toContain("disable-leaver-accounts");
    expect(e.withheld).toBeGreaterThan(0);
  });

  it("standing admin: a recent review is no gap, and no review date is missing evidence, never assumed", async () => {
    const recent = structuredClone(NORTHWIND_IDENTITY);
    const controls = recent.api.find((r) => r.path.startsWith("/v4/spreadsheets/controls-register"))!.versions[0].body as { values: string[][] };
    controls.values = controls.values.map((row) => (row[2] === "last_reviewed_at" ? [...row.slice(0, 3), "2026-09-15"] : row));
    const e = await start(okta, recent);
    expect(value(e, "group:workspace-super-admins", "review_overdue")).toBe(false);
    expect(e.nextMoves().scenarios.find((s) => s.scenario === "standing-admin-unreviewed")!.state).toBe("no_gap_observed");

    const none = structuredClone(NORTHWIND_IDENTITY);
    const reg = none.api.find((r) => r.path.startsWith("/v4/spreadsheets/controls-register"))!.versions[0].body as { values: string[][] };
    reg.values = reg.values.filter((row) => row[2] !== "last_reviewed_at");
    const m = await start(okta, none);
    expect(m.facts.some((f) => f.predicate === "review_overdue")).toBe(false);
    expect(m.nextMoves().scenarios.find((s) => s.scenario === "standing-admin-unreviewed")!.state).toBe("unresolved");
  });

  it("the default demo is unchanged: two moves, the 31, no identity scenarios", async () => {
    const e = await Engine.start(structuredClone(NORTHWIND), demoOptions());
    expect(e.nextMoves().next_moves.map((m) => m.action)).toEqual(["drop-access-screenshots", "move-unused-to-operator"]);
    expect(value(e, "group:billing-admins", "unused_90d")).toBe(31);
  });
});

describe("identity: a stored engine from before the class", () => {
  it("a company that never set the okta weight still gets the rename logged, with the default it was using", async () => {
    const store = new MemoryEngineStore();
    await Engine.open(structuredClone(NORTHWIND), demoOptions(), store);
    const old = store.load()!;
    old.records = old.records.map((r) => (r.connector === "identity" ? { ...r, connector: "okta", id: r.id.replace("identity:okta/", "okta:") } : r));
    old.readAt = Object.fromEntries(Object.entries(old.readAt).map(([k, v]) => [k === "identity" ? "okta" : k, v]));
    const e = await Engine.open(structuredClone(NORTHWIND), demoOptions(), new MemoryEngineStore(old));
    expect(e.memory.list("weight_change").at(-1)!.body).toMatchObject({ connector: "identity", renamed_from: "okta", from: 5, to: 5 });
    expect([...e.records.keys()].some((k) => k.startsWith("okta:"))).toBe(false);
  });

  it("moves the company's okta weight to identity with a logged weight change, drops the old records, and reads again", async () => {
    const store = new MemoryEngineStore();
    const first = await Engine.open(structuredClone(NORTHWIND), demoOptions(), store);
    // Rewrite the stored state as an engine from before the rename held it, with a weight the company set.
    const old = store.load()!;
    old.weights = [...old.weights, { connector: "okta", weight: 4, max_age_days: 1, set_by: "grc-lead", reason: "Set by the company" }];
    old.records = old.records.map((r) => (r.connector === "identity" ? { ...r, connector: "okta", id: r.id.replace("identity:okta/", "okta:") } : r));
    old.readAt = Object.fromEntries(Object.entries(old.readAt).map(([k, v]) => [k === "identity" ? "okta" : k, v]));
    const legacy = new MemoryEngineStore(old);
    const e = await Engine.open(structuredClone(NORTHWIND), demoOptions(), legacy);
    expect(e.weightsTable().map((w) => w.connector)).not.toContain("okta");
    expect(e.weightsTable().find((w) => w.connector === "identity")!.weight).toBe(4);
    expect(e.memory.list("weight_change").at(-1)).toMatchObject({ actor: "engine", body: { connector: "identity", renamed_from: "okta", from: 4, to: 4, reason: expect.stringMatching(/^connector class rename/) } });
    expect(e.memory.verify()).toBe(true);
    expect([...e.records.keys()].some((k) => k.startsWith("okta:"))).toBe(false);
    await e.catchUp();
    expect(e.records.has("identity:okta/group/billing-admins")).toBe(true);
    expect(value(e, "group:billing-admins", "unused_90d")).toBe(31);
    // Reopening does not migrate twice.
    const again = await Engine.open(structuredClone(NORTHWIND), demoOptions(), legacy);
    expect(again.memory.list("weight_change").filter((w) => w.body.renamed_from === "okta")).toHaveLength(1);
    expect(first.memory.verify()).toBe(true);
  });
});
