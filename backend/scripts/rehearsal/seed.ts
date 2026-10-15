import { assertSandboxAccount, nextOnHost, sandboxAccounts, type Target, targetFromEnv } from "./live";
import { ROSTER } from "./roster";
import { OKTA_DEPROVISIONED } from "../../src/engine/identity";
import { assertSandbox, dryRunPlan, jiraMarker, planGoogle, planJira, planLinear, planOkta, planSlack, seedRounds, type Step } from "./seed-plan";

/**
 * Seed one Crowbo sandbox with Northwind (roster.ts) through the provider's API.
 *
 *   bun scripts/rehearsal/seed.ts okta                    print the plan; change nothing
 *   CROWBO_SANDBOX=yes bun scripts/rehearsal/seed.ts okta --apply
 *
 * Credentials are the recorder's (live.ts), with write access; docs/REHEARSAL.md lists them. A run
 * checks the credentials are the sandbox's (assertSandboxAccount), reads the sandbox, refuses it unless
 * every person in it is at SANDBOX_DOMAINS, plans what is
 * missing and applies it, then reads again, up to three rounds, until nothing is missing. Rerunning
 * on a seeded sandbox changes nothing.
 */

type Json = Record<string, unknown>;

export function client(provider: string, t: Target, http: typeof fetch = fetch) {
  const call = async (method: string, path: string, body?: unknown): Promise<{ body: unknown; next: string | null }> => {
    const res = await http(`${t.origin}${path}`, {
      method, redirect: "error",
      headers: { ...t.headers, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Json) : null;
    if (!res.ok || json?.ok === false || (Array.isArray(json?.errors) && json.errors.length)) throw new Error(`${method} ${path.split("?")[0]} answered ${res.status}${json?.error ? ` ${json.error}` : ""}`);
    return { body: json, next: nextOnHost(provider, path, t, res) };
  };
  const all = async <T>(path: string): Promise<T[]> => {
    const out: T[] = [];
    for (let p: string | null = path, n = 0; p && n < 20; n++) {
      const r = await call("GET", p);
      out.push(...((r.body as T[] | null) ?? []));
      p = r.next;
    }
    return out;
  };
  return { call, all };
}

const env = process.env;

/** Read the sandbox's current state and plan the missing writes. */
export async function readAndPlan(provider: string, c: ReturnType<typeof client>, t: Target, domains: string[], accounts: Record<string, string>): Promise<Step[]> {
  switch (provider) {
    case "okta": {
      // Okta lists deprovisioned users only through the status filter; without them a rerun would create u41 again.
      type User = { id: string; status: string; profile: { login: string } };
      const users = [...(await c.all<User>("/api/v1/users?limit=200")), ...(await c.all<User>(`${OKTA_DEPROVISIONED}&limit=200`))];
      const groups = await c.all<{ id: string; profile: { name: string } }>("/api/v1/groups?limit=200");
      const apps = await c.all<{ label: string }>("/api/v1/apps?limit=200");
      const schema = (await c.call("GET", "/api/v1/meta/schemas/group/default")).body as { definitions?: { custom?: { properties?: Json } } };
      const mine = groups.filter((g) => ROSTER.groups.some((r) => r.name === g.profile.name));
      const state = {
        users: users.map((u) => ({ id: u.id, login: u.profile.login, status: u.status })),
        groups: await Promise.all(mine.map(async (g) => ({ id: g.id, name: g.profile.name, members: (await c.all<{ profile: { login: string } }>(`/api/v1/groups/${g.id}/users`)).map((u) => u.profile.login.toLowerCase()) }))),
        apps: apps.map((a) => ({ label: a.label })),
        groupSchemaHasApp: Boolean(schema.definitions?.custom?.properties?.app),
      };
      assertSandbox(state, domains);
      return planOkta(state);
    }
    case "google-workspace": {
      const domain = accounts["google-workspace"];
      if (!domain || !domains.includes(domain)) throw new Error("The google-workspace entry of SANDBOX_ACCOUNTS must be one of SANDBOX_DOMAINS");
      const groups = ((await c.call("GET", `/admin/directory/v1/groups?domain=${encodeURIComponent(domain)}&maxResults=200`)).body as { groups?: { email: string }[] }).groups ?? [];
      const state = {
        groups: await Promise.all(groups.map(async (g) => ({
          email: g.email,
          members: ((((await c.call("GET", `/admin/directory/v1/groups/${encodeURIComponent(g.email)}/members?maxResults=200`)).body as { members?: { email: string }[] }).members) ?? []).map((m) => m.email.toLowerCase()),
        }))),
      };
      assertSandbox(state, domains);
      return planGoogle(state, domain);
    }
    case "linear": {
      const q = `{ teams(first: 10) { nodes { id key } } projects(first: 100) { nodes { id name } } issueLabels(first: 250) { nodes { id name } } issues(first: 250, filter: { title: { startsWith: "[crowbo-seed:" } }) { nodes { title } } }`;
      const d = ((await c.call("POST", "/graphql", { query: q })).body as { data: { teams: { nodes: { id: string; key: string }[] }; projects: { nodes: { id: string; name: string }[] }; issueLabels: { nodes: { id: string; name: string }[] }; issues: { nodes: { title: string }[] } } }).data;
      const team = env.LINEAR_TEAM_KEY ? d.teams.nodes.find((x) => x.key === env.LINEAR_TEAM_KEY) : d.teams.nodes[0];
      if (!team) throw new Error("No Linear team found; set LINEAR_TEAM_KEY");
      return planLinear({ teamId: team.id, projects: d.projects.nodes, labels: d.issueLabels.nodes, issueTitles: d.issues.nodes.map((i) => i.title) });
    }
    case "jira": {
      const key = env.JIRA_PROJECT ?? "NW";
      const project = (await c.call("GET", `/rest/api/3/project/${encodeURIComponent(key)}`).catch(() => {
        throw new Error(`Create the Jira project ${key} first (docs/REHEARSAL.md)`);
      })).body as { id: string };
      const versions = ((await c.call("GET", `/rest/api/3/project/${encodeURIComponent(key)}/versions`)).body as { name: string }[]).map((v) => v.name);
      const markers = ROSTER.launches.flatMap((l) => l.issues.map((i) => jiraMarker(i.key)));
      const jql = encodeURIComponent(`project = ${key} AND labels in (${markers.join(",")})`);
      const found = ((await c.call("GET", `/rest/api/3/search/jql?jql=${jql}&fields=labels&maxResults=100`)).body as { issues: { fields: { labels: string[] } }[] }).issues;
      return planJira({ projectId: project.id, versions, markers: found.flatMap((i) => i.fields.labels).filter((l) => markers.includes(l)) }, key);
    }
    case "slack": {
      const channel = t.slackChannel!;
      const texts = (((await c.call("GET", `/api/conversations.history?channel=${encodeURIComponent(channel)}&limit=200`)).body as { messages?: { text: string }[] }).messages ?? []).map((m) => m.text);
      return planSlack({ texts }, channel);
    }
    default:
      throw new Error(`No seed for ${provider}`);
  }
}

if (import.meta.main) {
  const provider = process.argv[2] ?? "";
  const apply = process.argv.includes("--apply");
  try {
    const domains = (env.SANDBOX_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (!domains.length) throw new Error("Set SANDBOX_DOMAINS to the sandbox's email domains, comma-separated");
    const accounts = sandboxAccounts(env);
    if (!apply) {
      // The dry run sends nothing: it shows what seeding an empty sandbox would create.
      const steps = dryRunPlan(provider, accounts);
      console.log(`${provider}: seeding an empty sandbox makes ${steps.length} change(s) in its first round\n${steps.map((s) => `  ${s.what}`).join("\n")}\nDry run: nothing was sent. Later rounds add memberships and issues once their groups and projects exist; --apply reads the sandbox and makes only what is missing.`);
    } else {
      if (env.CROWBO_SANDBOX !== "yes") throw new Error("Seeding writes to the sandbox: set CROWBO_SANDBOX=yes to confirm it is Crowbo's own");
      const t = targetFromEnv(provider, env);
      const c = client(provider, t);
      await assertSandboxAccount(provider, t, env, accounts);
      const plan = () => readAndPlan(provider, c, t, domains, accounts);
      const { applied, complete } = await seedRounds(plan, async (s) => void (await c.call(s.method, s.path, s.body)), (line) => console.log(`${provider}, ${line}`));
      console.log(complete ? `${provider}: seeded (${applied.length} change(s)); a rerun changes nothing` : `${provider}: still incomplete after three rounds; rerun to finish`);
      if (!complete) process.exitCode = 1;
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
