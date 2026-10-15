import { describe, expect, it } from "vitest";
import "../../src/engine/connectors";
import { identityConnector, OKTA_DEPROVISIONED, okta } from "../../src/engine/identity";
import { jira, jiraIssueSearch, ticketsConnector } from "../../src/engine/tickets";
import { recordedApi } from "../../scripts/rehearsal/recording";
import { email, ROSTER } from "../../scripts/rehearsal/roster";
import {
  assertSandbox, type GoogleState, type JiraState, type LinearState, type OktaState,
  planGoogle, planJira, planLinear, planOkta, planSlack, type SlackState, seedTitle, type Step,
} from "../../scripts/rehearsal/seed-plan";

/** Plan, apply to an in-memory sandbox, read again: the run must converge, and a rerun must plan nothing. */
function converge<S>(state: S, plan: (s: S) => Step[], apply: (s: S, step: Step) => void): { state: S; rounds: number } {
  for (let round = 1; round <= 3; round++) {
    const steps = plan(state);
    if (!steps.length) return { state, rounds: round - 1 };
    for (const s of steps) apply(state, s);
  }
  return { state, rounds: plan(state).length ? Infinity : 3 };
}

const body = <T>(s: Step) => s.body as T;
let n = 0;
const id = (prefix: string) => `${prefix}${++n}`;

function applyOkta(s: OktaState, step: Step) {
  if (step.path.startsWith("/api/v1/meta/schemas")) s.groupSchemaHasApp = true;
  else if (step.path.startsWith("/api/v1/users?activate=false")) s.users.push({ id: id("00u"), login: body<{ profile: { login: string } }>(step).profile.login, status: "STAGED" });
  else if (step.path === "/api/v1/groups") s.groups.push({ id: id("00g"), name: body<{ profile: { name: string } }>(step).profile.name, members: [] });
  else if (step.path === "/api/v1/apps") s.apps.push({ label: body<{ label: string }>(step).label });
  else if (step.path.endsWith("/lifecycle/deactivate")) s.users.find((u) => step.path === `/api/v1/users/${u.id}/lifecycle/deactivate`)!.status = "DEPROVISIONED";
  else {
    const [, gid, uid] = /groups\/([^/]+)\/users\/([^/]+)$/.exec(step.path)!;
    s.groups.find((g) => g.id === gid)!.members.push(s.users.find((u) => u.id === uid)!.login);
  }
}

describe("seeding the sandboxes", () => {
  it("Okta converges, a rerun plans nothing, and the identity connector reads the scenarios from what was seeded", async () => {
    const { state, rounds } = converge<OktaState>({ users: [], groups: [], apps: [], groupSchemaHasApp: false }, planOkta, applyOkta);
    expect(rounds).toBe(2);
    expect(planOkta(state)).toEqual([]);
    // The sandbox as Okta's API would answer it, read by the real connector.
    const groupBody = state.groups.map((g) => ({ id: g.id, profile: { name: g.name, app: ROSTER.groups.find((x) => x.name === g.name)!.app } }));
    const users = state.users.map((u) => ({ id: u.id, status: u.status, lastLogin: null, profile: { login: u.login } }));
    const responses: Record<string, unknown> = {
      "/api/v1/groups": groupBody,
      "/api/v1/apps": ROSTER.apps.map((a, i) => ({ id: `0oa${i}`, name: "bookmark", label: a.label, profile: { businessOwner: email(a.owner) } })),
      "/api/v1/users": users.filter((u) => u.status !== "DEPROVISIONED"),
      [OKTA_DEPROVISIONED]: users.filter((u) => u.status === "DEPROVISIONED"),
      ...Object.fromEntries(state.groups.map((g) => [`/api/v1/groups/${g.id}/users`, g.members.map((login) => ({ profile: { login } }))])),
    };
    const text = (await identityConnector(okta).read(recordedApi({ responses }))).map((r) => r.text).join("\n");
    for (const line of ["group:billing-admins grants_admin_on app:billing", "person:u05 member_of group:billing-admins", "app:billing business_owner person:priya", "person:u41 account_status deprovisioned", "person:u37 account_status active"]) expect(text).toContain(line);
  });

  it("Google Workspace: groups and external members only, no paid user seats; a rerun plans nothing", () => {
    const { state } = converge<GoogleState>({ groups: [] }, (s) => planGoogle(s, "crowbo.ai"), (s, step) => {
      if (step.path === "/admin/directory/v1/groups") s.groups.push({ email: body<{ email: string }>(step).email, members: [] });
      else s.groups.find((g) => step.path.includes(encodeURIComponent(g.email)))!.members.push(body<{ email: string }>(step).email);
    });
    expect(state.groups.map((g) => [g.email, g.members.length])).toEqual([["billing-admins@crowbo.ai", 5], ["workspace-super-admins@crowbo.ai", 2]]);
    expect(planGoogle(state, "crowbo.ai").every((s) => !s.path.includes("/users"))).toBe(true);
    expect(planGoogle(state, "crowbo.ai")).toEqual([]);
  });

  it("Linear: labels, then projects, then labelled issues; a rerun plans nothing", () => {
    const { state, rounds } = converge<LinearState>({ teamId: "t1", projects: [], labels: [], issueTitles: [] }, planLinear, (s, step) => {
      const { query, variables } = body<{ query: string; variables: { input: { name?: string; title?: string } } }>(step);
      if (query.includes("issueLabelCreate")) s.labels.push({ id: id("l"), name: variables.input.name! });
      else if (query.includes("projectCreate")) s.projects.push({ id: id("p"), name: variables.input.name! });
      else s.issueTitles.push(variables.input.title!);
    });
    expect(rounds).toBe(2);
    expect(state.issueTitles).toContain(seedTitle("ENG-7", "Checkout redesign"));
    expect(planLinear(state)).toEqual([]);
  });

  it("Jira converges, a rerun plans nothing, and the tickets connector finds checkout-v2 handling customer data with no review", async () => {
    const issues: { labels: string[]; version: string }[] = [];
    const { state } = converge<JiraState>({ projectId: "10000", versions: [], markers: [] }, (s) => planJira(s, "NW"), (s, step) => {
      if (step.path === "/rest/api/3/version") s.versions.push(body<{ name: string }>(step).name);
      else {
        const f = body<{ fields: { labels: string[]; fixVersions: { name: string }[] } }>(step).fields;
        issues.push({ labels: f.labels, version: f.fixVersions[0].name });
        s.markers.push(f.labels.at(-1)!);
      }
    });
    expect(planJira(state, "NW")).toEqual([]);
    const responses = {
      "/rest/api/3/project/search": { values: [{ key: "NW" }] },
      "/rest/api/3/project/NW/versions": state.versions.map((name) => ({ name, released: false, releaseDate: ROSTER.launches.find((l) => l.key === name)!.date })),
      [jiraIssueSearch("NW")]: { isLast: true, issues: issues.map((i, k) => ({ key: `NW-${k}`, fields: { labels: i.labels, status: { statusCategory: { key: "new" } }, resolution: null, assignee: null, fixVersions: [{ name: i.version }] } })) },
    };
    const text = (await ticketsConnector(jira).read(recordedApi({ responses }))).map((r) => r.text).join("\n");
    for (const line of ["launch:checkout-v2 includes feature:checkout-redesign", "feature:saved-cards handles_data data:payment-card", "launch:checkout-v2 security_review none"]) expect(text).toContain(line);
  });

  it("Slack posts each roster message once", () => {
    const s: SlackState = { texts: [] };
    for (const step of planSlack(s, "C1")) s.texts.push(body<{ text: string }>(step).text);
    expect(s.texts).toHaveLength(ROSTER.slack.length);
    expect(planSlack(s, "C1")).toEqual([]);
  });

  it("a workspace with people outside the sandbox domains is refused", () => {
    expect(() => assertSandbox({ users: [{ login: "priya@northwind.example" }, { login: "admin@crowbo.ai" }] }, ["crowbo.ai"])).not.toThrow();
    expect(() => assertSandbox({ users: [{ login: "cfo@real-company.test" }] }, ["crowbo.ai"])).toThrow(/does not look like a Crowbo sandbox; nothing changed/);
  });
});
