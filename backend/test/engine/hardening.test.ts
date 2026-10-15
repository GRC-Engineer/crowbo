import { describe, expect, it } from "vitest";
import { CONNECTORS, FakeApi } from "../../src/engine/connectors";
import { demoOptions } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_GRC } from "../../src/engine/fixture-grc";
import { NORTHWIND_IDENTITY } from "../../src/engine/fixture-identity";
import { NORTHWIND_TICKETS } from "../../src/engine/fixture-tickets";
import { drata, type GrcProvider, grcPlatformConnector, vanta } from "../../src/engine/grc-platform";
import { googleWorkspace, type IdentityProvider, identityConnector, okta, OKTA_DEPROVISIONED, oktaStatus } from "../../src/engine/identity";
import type { CompanyFixture, FakeApiRoute } from "../../src/engine/model";
import { MAX_PAGES } from "../../src/engine/paging";
import { MemoryEngineStore } from "../../src/engine/store";
import { jira, linear, type TicketsProvider, ticketsConnector } from "../../src/engine/tickets";

const SINCE = "2025-01-01T00:00:00Z";
const route = (path: string, body: unknown, next?: string): FakeApiRoute => ({ path, versions: [{ from: SINCE, body, ...(next ? { next } : {}) }] });
const withRoutes = (f: CompanyFixture, routes: FakeApiRoute[]) => {
  const out = structuredClone(f);
  for (const r of routes) out.api = [...out.api.filter((x) => x.path !== r.path), r];
  return out;
};
const body = <T>(f: CompanyFixture, path: string) => f.api.find((r) => r.path === path)!.versions[0].body as T;
const engineWith = (f: CompanyFixture, swap: { identity?: IdentityProvider; tickets?: TicketsProvider; grc?: GrcProvider }) => {
  const connectors = CONNECTORS.map((c) => (c.id === "identity" && swap.identity ? identityConnector(swap.identity) : c.id === "tickets" && swap.tickets ? ticketsConnector(swap.tickets) : c));
  return Engine.start(structuredClone(f), { ...demoOptions(), connectors: swap.grc ? [...connectors, grcPlatformConnector(swap.grc)] : connectors });
};
const state = (e: Engine, id: string) => e.nextMoves().scenarios.find((s) => s.scenario === id)!.state;
const fact = (e: Engine, subject: string, predicate: string) => e.facts.find((f) => f.subject === subject && f.predicate === predicate && f.freshness === "fresh");

describe("identity: paging, Okta status, admins from the admin flag", () => {
  it("Okta: a group's members on two Link-header pages are all read, and the list is complete", async () => {
    const users = body<unknown[]>(NORTHWIND, "/api/v1/groups/00g-billing/users");
    const f = withRoutes(NORTHWIND, [
      route("/api/v1/groups/00g-billing/users", users.slice(0, 25), "/api/v1/groups/00g-billing/users?after=25"),
      route("/api/v1/groups/00g-billing/users?after=25", users.slice(25)),
    ]);
    const e = await Engine.start(f, demoOptions());
    expect(fact(e, "group:billing-admins", "holders")!.value).toBe(40);
    expect(e.records.get("identity:okta/group/billing-admins")!.completeness).toEqual({ read: 40, total: 40, of: "members" });
  });

  it("Okta: a members page that cannot be read leaves the counts unresolved and says how much was read", async () => {
    const users = body<unknown[]>(NORTHWIND, "/api/v1/groups/00g-billing/users");
    const f = withRoutes(NORTHWIND, [route("/api/v1/groups/00g-billing/users", users.slice(0, 25), "/api/v1/groups/00g-billing/users?after=25")]);
    const e = await Engine.start(f, demoOptions());
    expect(fact(e, "group:billing-admins", "holders")).toBeUndefined();
    expect(fact(e, "group:billing-admins", "read_in_part")!.quote).toBe("members read in part (25 of an unknown number of members)");
    expect(state(e, "billing-exposure")).toBe("unresolved");
  });

  it("Okta: only SUSPENDED and DEPROVISIONED are inactive; a locked-out account is live", () => {
    expect(["ACTIVE", "LOCKED_OUT", "PASSWORD_EXPIRED", "RECOVERY", "STAGED", "PROVISIONED", "SUSPENDED", "DEPROVISIONED"].map(oktaStatus))
      .toEqual(["active", "active", "active", "active", "active", "active", "suspended", "deprovisioned"]);
  });

  it("Okta: deprovisioned users come from the status filter, and a leaver deprovisioned there does not count", async () => {
    const e = await engineWith(NORTHWIND_IDENTITY, { identity: okta });
    const accounts = e.records.get("identity:okta/accounts")!.text;
    expect(accounts).toContain("person:u41 account_status deprovisioned");
    expect(accounts).toContain("person:u02 account_status active");
    expect(fact(e, "directory:accounts", "leavers_active")!.value).toBe(1);
    expect(NORTHWIND_IDENTITY.api.some((r) => r.path === OKTA_DEPROVISIONED)).toBe(true);
  });

  it("Google Workspace: admins come from isAdmin as admin_of facts; no group name decides, and the review sits on the app", async () => {
    const e = await engineWith(NORTHWIND_IDENTITY, { identity: googleWorkspace });
    expect(e.facts.filter((f) => f.predicate === "admin_of").map((f) => `${f.subject} ${f.value}`).sort()).toEqual(["person:alex app:google-workspace", "person:u02 app:google-workspace"]);
    expect([...e.records.keys()].some((k) => k.includes("workspace-super-admins"))).toBe(false);
    expect(fact(e, "app:google-workspace", "review_overdue")!.quote).toMatch(/^Admin access to google-workspace \(2 admins\) last reviewed 2026-03-01/);
  });

  it("Google Workspace: users on two pages by nextPageToken are all read; a missing page leaves leavers unresolved", async () => {
    const path = "/admin/directory/v1/users?customer=my_customer";
    const all = body<{ users: unknown[] }>(NORTHWIND_IDENTITY, path).users;
    const paged = withRoutes(NORTHWIND_IDENTITY, [route(path, { users: all.slice(0, 20), nextPageToken: "t2" }), route(`${path}&pageToken=t2`, { users: all.slice(20) })]);
    const e = await engineWith(paged, { identity: googleWorkspace });
    expect(e.records.get("identity:google-workspace/accounts")!.completeness).toEqual({ read: all.length, total: all.length, of: "accounts" });
    expect(fact(e, "directory:accounts", "leavers_active")!.value).toBe(1);
    const cut = withRoutes(NORTHWIND_IDENTITY, [route(path, { users: all.slice(0, 20), nextPageToken: "t2" })]);
    const m = await engineWith(cut, { identity: googleWorkspace });
    expect(fact(m, "directory:accounts", "leavers_active")).toBeUndefined();
    expect(state(m, "leaver-access")).toBe("unresolved");
  });

  it("a paged list that never ends stops at the page cap and is incomplete", async () => {
    // A members page whose Link header always points back to itself.
    const api = new FakeApi([
      { path: "/api/v1/groups", versions: [{ from: SINCE, body: [{ id: "00g-billing", profile: { name: "g" } }] }] },
      { path: "/api/v1/groups/00g-billing/users", versions: [{ from: SINCE, body: [{ profile: { login: "a@x" } }], next: "/api/v1/groups/00g-billing/users" }] },
    ], "2026-10-13T09:00:00Z");
    const s = await okta.snapshot(api.fetch);
    expect(s.groups[0].members).toEqual({ items: Array(MAX_PAGES).fill("a@x"), complete: false });
  });
});

describe("tickets and GRC platform: paging", () => {
  it("Linear: issues past the first page are read by cursor before S10 is decided", async () => {
    const f = structuredClone(NORTHWIND_TICKETS);
    const project = body<{ data: { projects: { nodes: { slugId: string; issues: { nodes: unknown[]; pageInfo: unknown } }[] } } }>(f, "/graphql?query=projects").data.projects.nodes.find((p) => p.slugId === "checkout-v2")!;
    const [first, second] = [project.issues.nodes.slice(0, 1), project.issues.nodes.slice(1)];
    project.issues = { nodes: first, pageInfo: { hasNextPage: true, endCursor: "c1" } };
    const paged = withRoutes(f, [route("/graphql?query=project-issues&project=checkout-v2&after=c1", { data: { project: { issues: { nodes: second, pageInfo: { hasNextPage: false } } } } })]);
    const e = await engineWith(paged, { tickets: linear });
    expect(e.records.get("tickets:linear/launch/checkout-v2")!.completeness).toEqual({ read: 2, total: 2, of: "issues" });
    expect(state(e, "launch-without-review")).toBe("gap_supported");
  });

  it("Jira: search pages by nextPageToken until isLast", async () => {
    const path = "/rest/api/3/search?jql=project%3DNW";
    const issues = body<{ issues: unknown[] }>(NORTHWIND_TICKETS, path).issues;
    const paged = withRoutes(NORTHWIND_TICKETS, [route(path, { issues: issues.slice(0, 1), nextPageToken: "n2" }), route(`${path}&nextPageToken=n2`, { issues: issues.slice(1), isLast: true })]);
    const e = await engineWith(paged, { tickets: jira });
    expect(e.records.get("tickets:jira/launch/nw/checkout-v2")!.completeness).toEqual({ read: 3, total: 3, of: "issues" });
    expect(state(e, "launch-without-review")).toBe("gap_supported");
  });

  it("Vanta: vendors on two cursor pages are all read; Drata: vendors on two numbered pages reach the stated total", async () => {
    const vendors = body<{ results: { data: unknown[] } }>(NORTHWIND_GRC, "/v1/vendors").results.data;
    const vantaPaged = withRoutes(NORTHWIND_GRC, [
      route("/v1/vendors", { results: { data: vendors.slice(0, 2), pageInfo: { hasNextPage: true, endCursor: "v2" } } }),
      route("/v1/vendors?pageCursor=v2", { results: { data: vendors.slice(2), pageInfo: { hasNextPage: false } } }),
    ]);
    expect(state(await engineWith(vantaPaged, { grc: vanta }), "vendor-review-gap")).toBe("gap_supported");
    const dv = body<{ data: unknown[]; total: number }>(NORTHWIND_GRC, "/public/vendors");
    const drataPaged = withRoutes(NORTHWIND_GRC, [route("/public/vendors", { data: dv.data.slice(0, 2), total: 4 }), route("/public/vendors?page=2", { data: dv.data.slice(2), total: 4 })]);
    const e = await engineWith(drataPaged, { grc: drata });
    expect(e.records.get("grc-platform:drata/vendors")!.completeness).toEqual({ read: 4, total: 4, of: "vendors" });
    expect(state(e, "vendor-review-gap")).toBe("gap_supported");
  });
});

describe("migration: the default is marked, and the renamed connector is read at once", () => {
  it("a stored engine from before the class logs default: true and opens with the class already read", async () => {
    const store = new MemoryEngineStore();
    await Engine.open(structuredClone(NORTHWIND), demoOptions(), store);
    const old = store.load()!;
    old.records = old.records.map((r) => (r.connector === "identity" ? { ...r, connector: "okta", id: r.id.replace("identity:okta/", "okta:") } : r));
    old.readAt = Object.fromEntries(Object.entries(old.readAt).map(([k, v]) => [k === "identity" ? "okta" : k, v]));
    const e = await Engine.open(structuredClone(NORTHWIND), demoOptions(), new MemoryEngineStore(old));
    expect(e.memory.list("weight_change").at(-1)!.body).toMatchObject({ connector: "identity", renamed_from: "okta", default: true });
    // No empty decision in between: the first decision kept after the rename already has the 31.
    expect(e.records.has("identity:okta/group/billing-admins")).toBe(true);
    expect(fact(e, "group:billing-admins", "unused_90d")!.value).toBe(31);
  });
});
