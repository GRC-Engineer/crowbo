import { email, ROSTER, SEED_MARK } from "./roster";

/**
 * What seeding a sandbox would change, planned from what it already holds. Planning is pure: given a
 * sandbox's current state, return only the writes still missing, so a rerun on a seeded sandbox plans
 * nothing (idempotent). A write that needs an id the provider has not issued yet (a membership of a
 * group not created) waits for the next round, after the state is read again.
 */

export interface Step {
  what: string;
  method: "POST" | "PUT";
  path: string;
  body?: unknown;
}

export interface OktaState {
  users: { id: string; login: string; status: string }[];
  groups: { id: string; name: string; members: string[] }[];
  apps: { label: string }[];
  groupSchemaHasApp: boolean;
}

export function planOkta(s: OktaState): Step[] {
  const steps: Step[] = [];
  if (!s.groupSchemaHasApp) {
    steps.push({
      what: "add the custom group profile property app", method: "POST", path: "/api/v1/meta/schemas/group/default",
      body: { definitions: { custom: { id: "#custom", type: "object", properties: { app: { title: "App this group administers", type: "string" } } } } },
    });
  }
  const user = (p: string) => s.users.find((u) => u.login.toLowerCase() === email(p));
  for (const p of ROSTER.people) {
    // Created without activation: no email is sent and nobody can sign in.
    if (!user(p)) steps.push({ what: `create user ${p}`, method: "POST", path: "/api/v1/users?activate=false", body: { profile: { firstName: p, lastName: "Northwind", email: email(p), login: email(p) } } });
  }
  for (const g of ROSTER.groups) {
    const have = s.groups.find((x) => x.name === g.name);
    if (!have) {
      steps.push({ what: `create group ${g.name}`, method: "POST", path: "/api/v1/groups", body: { profile: { name: g.name, description: SEED_MARK, app: g.app } } });
      continue;
    }
    for (const m of g.members) {
      const u = user(m);
      if (u && !have.members.includes(email(m))) steps.push({ what: `add ${m} to ${g.name}`, method: "PUT", path: `/api/v1/groups/${have.id}/users/${u.id}` });
    }
  }
  for (const a of ROSTER.apps) {
    if (!s.apps.some((x) => x.label === a.label)) {
      steps.push({
        what: `create app ${a.label}`, method: "POST", path: "/api/v1/apps",
        body: { name: "bookmark", label: a.label, signOnMode: "BOOKMARK", settings: { app: { requestIntegration: false, url: `https://${a.label}.${ROSTER.domain}` } }, profile: { businessOwner: email(a.owner) } },
      });
    }
  }
  for (const p of ROSTER.deprovisioned) {
    const u = user(p);
    if (u && u.status !== "DEPROVISIONED") steps.push({ what: `deprovision ${p}`, method: "POST", path: `/api/v1/users/${u.id}/lifecycle/deactivate` });
  }
  return steps;
}

export interface GoogleState {
  groups: { email: string; members: string[] }[];
}

/** Groups only: Workspace users are paid seats, so the seed adds the synthetic people as external members. */
export function planGoogle(s: GoogleState, domain: string): Step[] {
  const steps: Step[] = [];
  for (const g of ROSTER.groups) {
    const key = `${g.name}@${domain}`;
    const have = s.groups.find((x) => x.email.toLowerCase() === key);
    if (!have) {
      steps.push({ what: `create group ${key}`, method: "POST", path: "/admin/directory/v1/groups", body: { email: key, name: g.name, description: SEED_MARK } });
      continue;
    }
    for (const m of g.members) {
      if (!have.members.includes(email(m))) steps.push({ what: `add ${m} to ${key}`, method: "POST", path: `/admin/directory/v1/groups/${encodeURIComponent(key)}/members`, body: { email: email(m), role: "MEMBER" } });
    }
  }
  return steps;
}

export interface LinearState {
  teamId: string;
  projects: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  issueTitles: string[];
}

const gql = (what: string, query: string, input: Record<string, unknown>): Step => ({ what, method: "POST", path: "/graphql", body: { query, variables: { input } } });
export const seedTitle = (key: string, title: string) => `[${SEED_MARK}:${key}] ${title}`;

/** Projects are launches; issues carry the labels the connector reads. Leads and assignees stay unset: only real members can hold them. */
export function planLinear(s: LinearState): Step[] {
  const steps: Step[] = [];
  const names = [...new Set(ROSTER.launches.flatMap((l) => l.issues.flatMap((i) => i.labels)))];
  for (const n of names) if (!s.labels.some((l) => l.name === n)) steps.push(gql(`create label ${n}`, "mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success } }", { name: n }));
  for (const l of ROSTER.launches) {
    const project = s.projects.find((p) => p.name === l.name);
    if (!project) {
      steps.push(gql(`create project ${l.name}`, "mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { success } }", { name: l.name, teamIds: [s.teamId], startDate: l.date, description: SEED_MARK }));
      continue;
    }
    for (const i of l.issues) {
      const labelIds = i.labels.map((n) => s.labels.find((x) => x.name === n)?.id);
      if (s.issueTitles.includes(seedTitle(i.key, i.title)) || labelIds.some((x) => !x)) continue;
      steps.push(gql(`create issue ${i.key}`, "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success } }", { title: seedTitle(i.key, i.title), teamId: s.teamId, projectId: project.id, labelIds }));
    }
  }
  return steps;
}

export interface JiraState {
  projectId: string;
  versions: string[];
  /** Seed markers on issues already created ("crowbo-seed-SEC-41"). */
  markers: string[];
}

export const jiraMarker = (key: string) => `${SEED_MARK}-${key}`;

/** Unreleased versions are launches; issues name their fix version and carry the connector's labels plus a seed marker. */
export function planJira(s: JiraState, projectKey: string): Step[] {
  const steps: Step[] = [];
  for (const l of ROSTER.launches) {
    if (!s.versions.includes(l.key)) {
      steps.push({ what: `create version ${l.key}`, method: "POST", path: "/rest/api/3/version", body: { name: l.key, projectId: Number(s.projectId), releaseDate: l.date, released: false, description: SEED_MARK } });
      continue;
    }
    for (const i of l.issues) {
      if (s.markers.includes(jiraMarker(i.key))) continue;
      steps.push({
        what: `create issue ${i.key}`, method: "POST", path: "/rest/api/3/issue",
        body: { fields: { project: { key: projectKey }, summary: i.title, issuetype: { name: "Task" }, labels: [...i.labels, jiraMarker(i.key)], fixVersions: [{ name: l.key }] } },
      });
    }
  }
  return steps;
}

export interface SlackState {
  texts: string[];
}

export function planSlack(s: SlackState, channel: string): Step[] {
  return ROSTER.slack.filter((t) => !s.texts.includes(t)).map((text) => ({ what: `post "${text.slice(0, 32)}…"`, method: "POST", path: "/api/chat.postMessage", body: { channel, text } }));
}

const EMAIL_DOMAIN = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Refuse a workspace whose people are not all at the sandbox's own domains (or Northwind's). */
export function assertSandbox(state: unknown, domains: string[], consequence = "nothing changed"): void {
  const allowed = new Set([...domains.map((d) => d.toLowerCase()), ROSTER.domain]);
  const foreign = new Set([...JSON.stringify(state).matchAll(EMAIL_DOMAIN)].map((m) => m[1].toLowerCase()).filter((d) => !allowed.has(d)));
  if (foreign.size) throw new Error(`${foreign.size} email domain(s) outside SANDBOX_DOMAINS: this does not look like a Crowbo sandbox; ${consequence}`);
}

/**
 * Apply plans round by round until nothing is missing. A write already made in this run is never made
 * again, even when the provider's search has not caught up with it yet (Jira's index lags its writes).
 */
export async function seedRounds(plan: () => Promise<Step[]>, apply: (s: Step) => Promise<void>, log: (line: string) => void, rounds = 3): Promise<{ applied: Step[]; complete: boolean }> {
  const applied: Step[] = [];
  const done = new Set<string>();
  const pending = async () => (await plan()).filter((s) => !done.has(s.what));
  for (let round = 1; round <= rounds; round++) {
    const steps = await pending();
    if (!steps.length) return { applied, complete: true };
    log(`round ${round}: ${steps.length} change(s)`);
    for (const s of steps) {
      log(`  ${s.what}`);
      await apply(s);
      done.add(s.what);
      applied.push(s);
    }
  }
  return { applied, complete: (await pending()).length === 0 };
}
