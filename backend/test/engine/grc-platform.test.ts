import { describe, expect, it } from "vitest";
import { answerTopic } from "../../src/engine/answer";
import { CONNECTORS } from "../../src/engine/connectors";
import { demoOptions } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND_GRC } from "../../src/engine/fixture-grc";
import { drata, type GrcProvider, grcPlatformConnector, vanta } from "../../src/engine/grc-platform";
import type { CompanyFixture } from "../../src/engine/model";

const start = (p: GrcProvider, fixture: CompanyFixture = NORTHWIND_GRC) => Engine.start(structuredClone(fixture), { ...demoOptions(), connectors: [...CONNECTORS, grcPlatformConnector(p)] });
const quote = (e: Engine, predicate: string) => e.facts.find((f) => f.predicate === predicate)?.quote;
const state = (e: Engine, id: string) => e.nextMoves().scenarios.find((s) => s.scenario === id)!.state;
const body = <T>(f: CompanyFixture, path: string) => f.api.find((r) => r.path === path)!.versions[0].body as T;
const S5 = "vendor-review-gap", S6 = "exception-drift", S7 = "unlinked-effort";

describe("GRC platform: one connector class, two providers, read-only", () => {
  it("Vanta and Drata give the same S5, S6 and S7, and the same moves", async () => {
    const results = [];
    for (const p of [vanta, drata]) {
      const e = await start(p);
      expect(quote(e, "unreviewed_customer_data_vendors")).toBe("2 of 3 vendors handling customer data have no security review in 365 days: analytics (2025-06-01), support-desk (never)");
      expect(quote(e, "exceptions_needing_review")).toBe("2 of 3 exceptions need re-signing: ex-2 past its review date (2026-09-30); ex-1 signed by u37, who left");
      expect(quote(e, "unlinked_effort_controls")).toBe("1 control takes 24 hours a quarter with no linked risk, obligation or commitment: quarterly-access-screenshots");
      expect([S5, S6, S7].map((id) => state(e, id))).toEqual(["gap_supported", "gap_supported", "gap_supported"]);
      results.push(e.nextMoves().next_moves.map((m) => [m.action, m.title, m.decides]));
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toContainEqual(["drop-unlinked-controls", "Stop the work on controls tied to no risk, obligation or commitment (1 found)", "person:dana"]);
  });

  it("weights name the class; records keep their provider; citations show its label", async () => {
    for (const [p, label] of [[vanta, "Vanta"], [drata, "Drata"]] as const) {
      const e = await start(p);
      expect(e.records.get(`grc-platform:${p.id}/vendors`)).toMatchObject({ connector: "grc-platform", provider: p.id, completeness: { read: 4, total: 4, of: "vendors" } });
      expect(answerTopic(e, "Which vendors with customer data have not been reviewed?").sources.some((s) => s.label === label && s.connector === "grc-platform")).toBe(true);
    }
  });

  it("assurance class and coverage are two findings, never one score, and the source is quoted for what it was cited for", async () => {
    const e = await start(vanta);
    const a = answerTopic(e, "How well is it assured?", "control-assurance");
    const texts = a.answer.finding.map((f) => f.text);
    expect(texts).toContain("control:billing-admin-access assurance_class automated");
    expect(texts).toContain("control:billing-admin-access coverage 18 of 20 tests passing");
    // No fact or finding folds the two together.
    expect(e.facts.filter((f) => f.subject === "control:billing-admin-access" && /score|assurance/.test(f.predicate)).map((f) => f.predicate)).toEqual(["assurance_class"]);
    expect(texts.filter((t) => t.includes("assurance_class") && t.includes("coverage"))).toEqual([]);
    expect(a.sources.find((s) => s.label === "Vanta")!.claim).toBe("control:billing-admin-access assurance_class automated");
  });

  it("the default demo does not read a GRC platform and is unchanged", async () => {
    expect(CONNECTORS.map((c) => c.id)).not.toContain("grc-platform");
  });
});

describe("GRC platform: unknown or partial state stays unresolved", () => {
  it("a list read in part leaves its scenario unresolved and says how much was read", async () => {
    const partial = structuredClone(NORTHWIND_GRC);
    body<{ results: { pageInfo: { hasNextPage: boolean } } }>(partial, "/v1/vendors").results.pageInfo.hasNextPage = true;
    body<{ results: { pageInfo: { hasNextPage: boolean } } }>(partial, "/v1/controls").results.pageInfo.hasNextPage = true;
    const e = await start(vanta, partial);
    expect([state(e, S5), state(e, S7)]).toEqual(["unresolved", "unresolved"]);
    expect(e.nextMoves().unresolved.find((u) => u.subject === "vendors:all")!.detail).toMatch(/No fresh source .* states vendors:all unreviewed_customer_data_vendors$/);
    expect(e.records.get("grc-platform:vanta/vendors")!.completeness).toEqual({ read: 4, total: null, of: "vendors" });
    expect(e.nextMoves().next_moves.map((m) => m.action)).not.toContain("drop-unlinked-controls");
  });

  it("unknown completeness is incomplete: a Drata list with no total, a Vanta page with no pageInfo", async () => {
    const noTotal = structuredClone(NORTHWIND_GRC);
    delete body<{ total?: number }>(noTotal, "/public/exceptions").total;
    expect(state(await start(drata, noTotal), S6)).toBe("unresolved");
    const noPageInfo = structuredClone(NORTHWIND_GRC);
    delete (body<{ results: { pageInfo?: unknown } }>(noPageInfo, "/v1/vendors").results.pageInfo);
    expect(state(await start(vanta, noPageInfo), S5)).toBe("unresolved");
  });

  it("S5 needs every data class a vendor handles classified", async () => {
    const half = structuredClone(NORTHWIND_GRC);
    const reg = half.api.find((r) => r.path.startsWith("/v4/spreadsheets/controls-register"))!.versions[0].body as { values: string[][] };
    reg.values = reg.values.filter((row) => row[1] !== "data:employee-pii");
    expect(state(await start(vanta, half), S5)).toBe("unresolved");
  });

  it("S6 without the HR grant: a past review date still counts, the signers are said not to be checked; with nothing past due it stays unresolved", async () => {
    const noHr = { ...structuredClone(NORTHWIND_GRC), grants: [] };
    const e = await start(vanta, noHr);
    expect(quote(e, "exceptions_needing_review")).toBe("1 of 3 exceptions need re-signing: ex-2 past its review date (2026-09-30); signers not checked, HR terminations not readable");
    const nothingPast = { ...structuredClone(NORTHWIND_GRC), grants: [] };
    body<{ results: { data: { expiresAt: string }[] } }>(nothingPast, "/v1/exceptions").results.data.forEach((x) => (x.expiresAt = "2027-06-30"));
    const m = await start(vanta, nothingPast);
    expect(quote(m, "exceptions_needing_review")).toBeUndefined();
    expect(state(m, S6)).toBe("unresolved");
  });

  it("S7: when every control with hours is linked, there is no gap and no drop", async () => {
    const linked = structuredClone(NORTHWIND_GRC);
    body<{ results: { data: { id: string; linkedRisks: string[] }[] } }>(linked, "/v1/controls").results.data.forEach((c) => (c.linkedRisks = c.linkedRisks.length ? c.linkedRisks : ["access-misuse"]));
    const e = await start(vanta, linked);
    expect(quote(e, "unlinked_effort_controls")).toBe("Every control with recurring hours is linked to a risk, obligation or commitment");
    expect(state(e, S7)).toBe("no_gap_observed");
    expect(e.nextMoves().next_moves.map((m) => m.action)).not.toContain("drop-unlinked-controls");
  });
});
