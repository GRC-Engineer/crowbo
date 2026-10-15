import { linkNext } from "../../src/connections/transport";
import type { FetchJson } from "../../src/engine/model";
import { nextPath } from "../../src/engine/paging";
import { linearOperation } from "../../src/engine/tickets";

/**
 * The connectors' requests sent to a provider's real API, for recording from Crowbo's own sandboxes.
 * Credentials come from the environment of the person running the recorder and are never written.
 * The recorder authenticates the way each sandbox's admin can without an app review (an Okta API
 * token, a Linear personal key, a Jira API token); the product connects through OAuth (ADR 0003).
 * Response shapes are the same either way.
 */

export interface Target {
  origin: string;
  headers: Record<string, string>;
  /** Slack: the rehearsal channel the demo connector's channel stands for. */
  slackChannel?: string;
}

export const need = (env: Record<string, string | undefined>, ...names: string[]) => {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new Error(`Set ${missing.join(", ")} (see docs/REHEARSAL.md)`);
  return names.map((n) => env[n]!);
};

/** Okta developer and trial orgs only: the recorder refuses any other org. */
export const SANDBOX_OKTA = /^(dev|trial)-\d+\.okta\.com$/;

export function targetFromEnv(provider: string, env: Record<string, string | undefined>): Target {
  switch (provider) {
    case "okta": {
      const [org, token] = need(env, "OKTA_ORG", "OKTA_TOKEN");
      if (!SANDBOX_OKTA.test(org)) throw new Error("OKTA_ORG must be a developer or trial org (dev-<n>.okta.com)");
      return { origin: `https://${org}`, headers: { authorization: `SSWS ${token}` } };
    }
    case "google-workspace":
      return { origin: "https://admin.googleapis.com", headers: { authorization: `Bearer ${need(env, "GOOGLE_TOKEN")[0]}` } };
    case "linear":
      // Linear takes a personal API key as the whole Authorization header.
      return { origin: "https://api.linear.app", headers: { authorization: need(env, "LINEAR_API_KEY")[0] } };
    case "jira": {
      const [site, user, token] = need(env, "JIRA_SITE", "JIRA_EMAIL", "JIRA_API_TOKEN");
      if (!/^[a-z0-9-]+\.atlassian\.net$/.test(site)) throw new Error("JIRA_SITE must be <site>.atlassian.net");
      return { origin: `https://${site}`, headers: { authorization: `Basic ${btoa(`${user}:${token}`)}` } };
    }
    case "slack": {
      const [token, channel] = need(env, "SLACK_BOT_TOKEN", "SLACK_CHANNEL");
      return { origin: "https://slack.com", headers: { authorization: `Bearer ${token}` }, slackChannel: channel };
    }
    default:
      throw new Error(`No recorder for ${provider}`);
  }
}

type Http = (url: string, init: RequestInit) => Promise<Response>;

/** The next page a Link header names, as a path on the target's host; a link to another host throws. */
export function nextOnHost(provider: string, path: string, target: Target, res: Response): string | null {
  const link = linkNext(res.headers.get("link"));
  const next = link === null ? null : link.startsWith(target.origin) || link.startsWith("/") ? nextPath(link) : null;
  if (link !== null && next === null) throw new Error(`${provider}: ${path} links to another host`);
  return next;
}

/**
 * A provider's API as the connector expects it. Linear's named requests become GraphQL documents;
 * Slack's demo channel becomes the rehearsal channel; Okta's Link header becomes the next page. Any
 * failure throws: a recording is complete or not written.
 */
export function liveApi(provider: string, target: Target, http: Http = fetch): FetchJson {
  async function request(path: string): Promise<{ body: unknown; next: string | null }> {
    let url = `${target.origin}${path}`;
    let init: RequestInit = { headers: { ...target.headers, accept: "application/json" }, redirect: "error" };
    if (provider === "linear") {
      const op = linearOperation(path);
      if (!op) throw new Error(`linear: ${path} is not one of the connector's named requests`);
      url = `${target.origin}/graphql`;
      init = { ...init, method: "POST", headers: { ...target.headers, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(op) };
    } else if (provider === "slack" && target.slackChannel) {
      url = url.replace(/([?&]channel=)C0GRC\b/, `$1${encodeURIComponent(target.slackChannel)}`);
    }
    const res = await http(url, init);
    if (!res.ok) throw new Error(`${provider}: ${path} answered ${res.status}`);
    const body = (await res.json()) as { ok?: boolean; error?: string; errors?: unknown[] } | null;
    if (provider === "slack" && body?.ok === false) throw new Error(`slack: ${path} answered ${body.error}`);
    if (provider === "linear" && body?.errors?.length) throw new Error(`linear: ${path} returned GraphQL errors`);
    return { body, next: nextOnHost(provider, path, target, res) };
  }
  const api: FetchJson = async (path) => (await request(path)).body;
  api.page = request;
  return api;
}

/**
 * Before anything is read or written: the credentials must belong to Crowbo's sandbox. Linear and Jira
 * name the token's own account, whose email must be at a sandbox domain; a Slack token must belong to
 * SLACK_WORKSPACE. Okta (a dev org) and Google (its users' domains) are checked on the data itself.
 */
export async function assertSandboxAccount(provider: string, target: Target, env: Record<string, string | undefined>, domains: string[], http: Http = fetch): Promise<void> {
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await http(`${target.origin}${path}`, { ...init, redirect: "error", headers: { ...target.headers, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) } });
    if (!res.ok) throw new Error(`${provider}: ${path} answered ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };
  const atSandbox = (email: unknown) => typeof email === "string" && domains.map((d) => d.toLowerCase()).includes(email.split("@")[1]?.toLowerCase() ?? "");
  let ok = true;
  if (provider === "linear") ok = atSandbox(((await call("/graphql", { method: "POST", body: JSON.stringify({ query: "{ viewer { email } }" }) })).data as { viewer?: { email?: string } } | undefined)?.viewer?.email);
  else if (provider === "jira") ok = atSandbox((await call("/rest/api/3/myself")).emailAddress);
  else if (provider === "slack") {
    const workspace = env.SLACK_WORKSPACE;
    if (!workspace) throw new Error("Set SLACK_WORKSPACE (see docs/REHEARSAL.md)");
    const url = (await call("/api/auth.test")).url;
    ok = typeof url === "string" && new URL(url).host === `${workspace}.slack.com`;
  }
  if (!ok) throw new Error(`${provider}: these credentials are not for a Crowbo sandbox (SANDBOX_DOMAINS, SLACK_WORKSPACE); nothing read or written`);
}
