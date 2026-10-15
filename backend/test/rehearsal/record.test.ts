import { describe, expect, it } from "vitest";
import "../../src/engine/connectors";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_IDENTITY } from "../../src/engine/fixture-identity";
import { NORTHWIND_TICKETS } from "../../src/engine/fixture-tickets";
import type { CompanyFixture } from "../../src/engine/model";
import { LINEAR_QUERIES } from "../../src/engine/tickets";
import { assertSandboxAccount, liveApi, targetFromEnv } from "../../scripts/rehearsal/live";
import { recordProvider } from "../../scripts/rehearsal/record";
import { recordedApi } from "../../scripts/rehearsal/recording";
import { findLeaks } from "../../scripts/rehearsal/scrub";

/** A fixture standing in for a provider's live API: its latest response per path. */
const asLive = (f: CompanyFixture) => recordedApi({ responses: Object.fromEntries(f.api.map((r) => [r.path, r.versions.at(-1)!.body])) });
const NOW = new Date("2026-10-20T09:00:00Z");

describe("recording from a sandbox", () => {
  it("each provider's read is recorded, scrubbed, leak-free and replays to the same records", async () => {
    for (const [provider, fixture] of [["okta", NORTHWIND_IDENTITY], ["google-workspace", NORTHWIND_IDENTITY], ["linear", NORTHWIND_TICKETS], ["jira", NORTHWIND_TICKETS], ["slack", NORTHWIND]] as const) {
      const { recording, records } = await recordProvider(provider, asLive(fixture), ["crowbo.ai"], NOW);
      expect({ provider, leaks: findLeaks(recording), some: records > 0 }).toEqual({ provider, leaks: [], some: true });
    }
  });

  it("a token that reads a company outside the sandbox domains writes nothing", async () => {
    const real = structuredClone(NORTHWIND_IDENTITY);
    const users = real.api.find((r) => r.path === "/api/v1/users")!.versions.at(-1)!.body as { profile: { login: string } }[];
    users[0].profile.login = "someone@real-company.test";
    await expect(recordProvider("okta", asLive(real), ["crowbo.ai"], NOW)).rejects.toThrow(/outside SANDBOX_DOMAINS: this does not look like a Crowbo sandbox; nothing written/);
  });

  it("only a developer or trial Okta org is accepted, and missing credentials are named", () => {
    expect(() => targetFromEnv("okta", { OKTA_ORG: "acme.okta.com", OKTA_TOKEN: "t" })).toThrow(/developer or trial org/);
    expect(() => targetFromEnv("jira", { JIRA_SITE: "x.atlassian.net" })).toThrow(/Set JIRA_EMAIL, JIRA_API_TOKEN/);
    expect(targetFromEnv("okta", { OKTA_ORG: "dev-31337.okta.com", OKTA_TOKEN: "t" }).origin).toBe("https://dev-31337.okta.com");
  });
});

describe("the sandbox account check", () => {
  const answer = (body: unknown) => async () => Response.json(body);
  it("Linear and Jira tokens must belong to an account at a sandbox domain; a Slack token to SLACK_WORKSPACE", async () => {
    const t = { origin: "https://x.test", headers: {} };
    await expect(assertSandboxAccount("linear", t, {}, ["crowbo.ai"], answer({ data: { viewer: { email: "admin@crowbo.ai" } } }))).resolves.toBeUndefined();
    await expect(assertSandboxAccount("linear", t, {}, ["crowbo.ai"], answer({ data: { viewer: { email: "cto@real-company.test" } } }))).rejects.toThrow(/not for a Crowbo sandbox/);
    await expect(assertSandboxAccount("jira", t, {}, ["crowbo.ai"], answer({ accountId: "x" }))).rejects.toThrow(/not for a Crowbo sandbox/);
    await expect(assertSandboxAccount("slack", t, { SLACK_WORKSPACE: "crowbo-sandbox" }, [], answer({ ok: true, url: "https://crowbo-sandbox.slack.com/" }))).resolves.toBeUndefined();
    await expect(assertSandboxAccount("slack", t, { SLACK_WORKSPACE: "crowbo-sandbox" }, [], answer({ ok: true, url: "https://acme.slack.com/" }))).rejects.toThrow(/not for a Crowbo sandbox/);
  });
});

describe("live adapters", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = (handler: (url: string) => Response) => async (url: string, init: RequestInit) => (calls.push({ url, init }), handler(url));

  it("Linear's named requests are sent as the GraphQL documents, with their variables", async () => {
    const api = liveApi("linear", { origin: "https://api.linear.app", headers: { authorization: "k" } }, http(() => Response.json({ data: { project: null } })));
    await api("/graphql?query=project-issues&project=checkout-v2&after=c1");
    const { url, init } = calls.at(-1)!;
    expect([url, init.method, JSON.parse(String(init.body))]).toEqual(["https://api.linear.app/graphql", "POST", { query: LINEAR_QUERIES["project-issues"], variables: { project: "checkout-v2", after: "c1" } }]);
    await expect(api("/graphql?query=viewer")).rejects.toThrow(/not one of the connector's named requests/);
  });

  it("Slack's demo channel is read from the rehearsal channel; an error answer throws", async () => {
    const api = liveApi("slack", { origin: "https://slack.com", headers: {}, slackChannel: "C123REHEARSE" }, http(() => Response.json({ ok: true, messages: [] })));
    await api("/api/conversations.history?channel=C0GRC");
    expect(calls.at(-1)!.url).toBe("https://slack.com/api/conversations.history?channel=C123REHEARSE");
    const denied = liveApi("slack", { origin: "https://slack.com", headers: {} }, http(() => Response.json({ ok: false, error: "missing_scope" })));
    await expect(denied("/api/conversations.history?channel=C0GRC")).rejects.toThrow(/missing_scope/);
  });

  it("Okta's Link header becomes the next page on the same host; another host or an error status throws", async () => {
    const target = { origin: "https://dev-1.okta.com", headers: {} };
    const paged = liveApi("okta", target, http(() => new Response("[]", { headers: { link: '<https://dev-1.okta.com/api/v1/users?after=x&limit=200>; rel="next"' } })));
    expect(await paged.page!("/api/v1/users")).toEqual({ body: [], next: "/api/v1/users?after=x&limit=200" });
    const away = liveApi("okta", target, http(() => new Response("[]", { headers: { link: '<https://elsewhere.test/x>; rel="next"' } })));
    await expect(away.page!("/api/v1/users")).rejects.toThrow(/another host/);
    await expect(liveApi("okta", target, http(() => new Response("no", { status: 403 })))("/api/v1/users")).rejects.toThrow(/answered 403/);
  });
});
