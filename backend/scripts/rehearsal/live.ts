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

const need = (env: Record<string, string | undefined>, ...names: string[]) => {
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
    const link = linkNext(res.headers.get("link"));
    const next = link === null ? null : link.startsWith(target.origin) || link.startsWith("/") ? nextPath(link) : null;
    if (link !== null && next === null) throw new Error(`${provider}: ${path} links to another host`);
    return { body, next };
  }
  const api: FetchJson = async (path) => (await request(path)).body;
  api.page = request;
  return api;
}
