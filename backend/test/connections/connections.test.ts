import { describe, expect, it } from "vitest";
import { type Keyring, open, parseKeyring, reencrypt, seal } from "../../src/connections/crypto";
import { authorizeUrl, MANIFESTS } from "../../src/connections/manifests";
import { MemoryConnectionStore } from "../../src/connections/store";
import { connectionFetch, linkNext } from "../../src/connections/transport";
import { ConnectionVault } from "../../src/connections/vault";
import { weeklyBrief } from "../../src/engine/answer";
import { CONNECTORS } from "../../src/engine/connectors";
import { demoOptions } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_GRC } from "../../src/engine/fixture-grc";
import { NORTHWIND_IDENTITY } from "../../src/engine/fixture-identity";
import { NORTHWIND_TICKETS } from "../../src/engine/fixture-tickets";
import { okta } from "../../src/engine/identity";
import { linked } from "../../src/engine/paging";
import type { FetchLike } from "../../src/providers/http";

const key = (n: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(n)));
const ring = (current = "k1", keys: Record<string, number> = { k1: 1 }): Keyring => parseKeyring(JSON.stringify({ current, keys: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, key(v)])) }));
const NOW = Date.parse("2026-10-16T09:00:00Z");

/** A fake HTTP endpoint recording requests and answering from a handler. */
function fakeHttp(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const http: FetchLike = async (url, init) => (calls.push({ url, init: init ?? {} }), handler(url, init ?? {}));
  return { http, calls };
}
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(String(init.body)));

describe("connection secrets: sealed per tenant, provider and kind", () => {
  it("round-trips, and nothing opens under another tenant, provider or kind", async () => {
    const r = ring();
    const env = await seal(r, "tenant-a", "linear", "refresh_token", "rt-secret");
    expect(await open(r, "tenant-a", "linear", "refresh_token", env)).toBe("rt-secret");
    await expect(open(r, "tenant-b", "linear", "refresh_token", env)).rejects.toThrow(/could not be decrypted/);
    await expect(open(r, "tenant-a", "jira", "refresh_token", env)).rejects.toThrow(/could not be decrypted/);
    await expect(open(r, "tenant-a", "linear", "access_token", env)).rejects.toThrow(/could not be decrypted/);
    expect(env.ct).not.toContain("rt-secret");
  });

  it("during a key rotation, material under the old key id still opens, and reencrypt moves it to the current one", async () => {
    const before = ring("k1", { k1: 1 });
    const env = await seal(before, "t", "okta", "private_jwk", "jwk");
    const during = ring("k2", { k1: 1, k2: 2 });
    expect(await open(during, "t", "okta", "private_jwk", env)).toBe("jwk");
    const moved = await reencrypt(during, "t", "okta", "private_jwk", env);
    expect(moved.kid).toBe("k2");
    const after = ring("k2", { k2: 2 });
    expect(await open(after, "t", "okta", "private_jwk", moved)).toBe("jwk");
    await expect(open(after, "t", "okta", "private_jwk", env)).rejects.toThrow(/Key id k1 is not in the keyring/);
  });

  it("rekey moves every stored secret to the current key id, after which the old key can be removed", async () => {
    const store = new MemoryConnectionStore();
    const v1 = new ConnectionVault("t", store, ring("k1", { k1: 1 }), () => NOW);
    await v1.storePasted("drata", { secret: "drata-key-0123456789" });
    await v1.setupOkta("northwind.okta.com", "0oa-x");
    const v2 = new ConnectionVault("t", store, ring("k2", { k1: 1, k2: 2 }), () => NOW);
    expect(await v2.rekey()).toEqual({ moved: 2, current: "k2" });
    expect(store.allSecrets().every((s) => s.envelope.kid === "k2")).toBe(true);
    const v3 = new ConnectionVault("t", store, ring("k2", { k2: 2 }), () => NOW);
    expect(await v3.accessToken("drata", { id: "", secret: "" }, fakeHttp(() => Response.json({})).http)).toBe("drata-key-0123456789");
    expect(await v2.rekey()).toEqual({ moved: 0, current: "k2" });
  });

  it("refuses a malformed keyring", () => {
    expect(() => parseKeyring(JSON.stringify({ current: "k1", keys: { k1: btoa("short") } }))).toThrow(/32 bytes/);
    expect(() => parseKeyring(JSON.stringify({ current: "k9", keys: { k1: key(1) } }))).toThrow(/current key id has no key/);
  });
});

describe("scope manifests: the consent screen asks for exactly what the manifest lists", () => {
  const scenarios = new Set([NORTHWIND, NORTHWIND_IDENTITY, NORTHWIND_TICKETS, NORTHWIND_GRC].flatMap((f) => f.scenarios.map((s) => s.id)).concat("*"));

  it("every authorize request carries the manifest's scopes, and PKCE where the provider supports it", () => {
    for (const m of Object.values(MANIFESTS)) {
      if (m.flow.kind !== "authorization_code") continue;
      const u = new URL(authorizeUrl(m.provider, { clientId: "c", redirectUri: "https://crowbo.example/cb", state: "s", codeChallenge: "x" }));
      expect(u.origin + u.pathname).toBe(m.flow.authorize);
      expect(u.searchParams.get("scope")!.split(m.flow.scopeSeparator)).toEqual(m.scopes.map((s) => s.scope));
      expect(u.searchParams.get("code_challenge_method")).toBe(m.flow.pkce ? "S256" : null);
    }
  });

  it("every scope names a scenario that reads it; Google scopes are read-only and nothing uses domain-wide delegation", () => {
    for (const m of Object.values(MANIFESTS)) for (const s of m.scopes) expect(s.scenarios.every((x) => scenarios.has(x))).toBe(true);
    expect(MANIFESTS["google-workspace"].scopes.every((s) => s.scope.endsWith(".readonly"))).toBe(true);
    expect(MANIFESTS["google-workspace"].flow.kind).toBe("authorization_code");
  });
});

describe("consent and tokens", () => {
  const client = { id: "client-1", secret: "client-secret-1", redirectUri: "https://crowbo.example/connect/linear/callback" };

  it("the consent state is one-time, unexpired and for the provider; the code exchange stores only sealed tokens", async () => {
    const store = new MemoryConnectionStore();
    const vault = new ConnectionVault("tenant-a", store, ring(), () => NOW);
    const { url, state } = await vault.startConsent("linear", client.id, client.redirectUri);
    expect(new URL(url).searchParams.get("code_challenge")).toBeTruthy();
    const { http, calls } = fakeHttp(() => Response.json({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: "read" }));
    await expect(vault.completeConsent("jira", state, "code", client, http)).rejects.toThrow(/unknown, used or expired/);
    const again = await vault.startConsent("linear", client.id, client.redirectUri);
    const c = await vault.completeConsent("linear", again.state, "code-1", client, http);
    expect(c).toMatchObject({ provider: "linear", status: "active", scopes: ["read"] });
    expect(form(calls[0].init).code_verifier).toBeTruthy();
    await expect(vault.completeConsent("linear", again.state, "code-1", client, http)).rejects.toThrow(/unknown, used or expired/);
    expect(JSON.stringify([...store.secrets.values()])).not.toMatch(/at-1|rt-1/);
    const late = new ConnectionVault("tenant-a", store, ring(), () => NOW + 11 * 60_000);
    const old = await vault.startConsent("linear", client.id, client.redirectUri);
    await expect(late.completeConsent("linear", old.state, "c", client, http)).rejects.toThrow(/expired/);
  });

  it("refresh commits the rotated refresh token before the access token is used; a failed write is a hard error, never a retry", async () => {
    const store = new MemoryConnectionStore();
    let now = NOW;
    const vault = new ConnectionVault("tenant-a", store, ring(), () => now);
    const { state } = await vault.startConsent("jira", client.id, client.redirectUri);
    await vault.completeConsent("jira", state, "code", client, fakeHttp(() => Response.json({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 })).http);
    now += 2 * 3600_000;
    const { http, calls } = fakeHttp(() => Response.json({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 }));
    store.failNextCommit = true;
    await expect(vault.accessToken("jira", client, http)).rejects.toThrow(/storage write failed/);
    expect(calls).toHaveLength(1);
    expect(await open(ring(), "tenant-a", "jira", "refresh_token", store.secret("jira", "refresh_token")!)).toBe("rt-1");
    // The next call presents rt-1 again: Atlassian would refuse it, and the connection is revoked, not retried with it twice.
    const refused = fakeHttp(() => Response.json({ error: "invalid_grant" }, { status: 400 }));
    expect(await vault.accessToken("jira", client, refused.http)).toBeNull();
    expect(store.get("jira")).toMatchObject({ status: "revoked", revoked_reason: "the provider refused the refresh token" });
  });

  it("a successful refresh stores both new tokens together", async () => {
    const store = new MemoryConnectionStore();
    let now = NOW;
    const vault = new ConnectionVault("tenant-a", store, ring(), () => now);
    const { state } = await vault.startConsent("jira", client.id, client.redirectUri);
    await vault.completeConsent("jira", state, "code", client, fakeHttp(() => Response.json({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 })).http);
    now += 2 * 3600_000;
    expect(await vault.accessToken("jira", client, fakeHttp(() => Response.json({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 })).http)).toBe("at-2");
    expect(await open(ring(), "tenant-a", "jira", "refresh_token", store.secret("jira", "refresh_token")!)).toBe("rt-2");
  });
});

describe("Okta: private-key JWT, only the public key leaves", () => {
  it("the public JWK has no private part, and the client assertion verifies against it", async () => {
    const store = new MemoryConnectionStore();
    const vault = new ConnectionVault("tenant-a", store, ring(), () => NOW);
    const { public_jwk } = await vault.setupOkta("northwind.okta.com", "0oa-crowbo");
    expect(public_jwk).not.toHaveProperty("d");
    const pub = await crypto.subtle.importKey("jwk", public_jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const { http, calls } = fakeHttp(() => Response.json({ access_token: "okta-at", expires_in: 3600 }));
    expect(await vault.accessToken("okta", { id: "", secret: "" }, http)).toBe("okta-at");
    const f = form(calls[0].init);
    expect(calls[0].url).toBe("https://northwind.okta.com/oauth2/v1/token");
    expect(f.scope).toBe("okta.users.read okta.groups.read okta.apps.read");
    const [h, p, s] = f.client_assertion.split(".");
    const unb64url = (x: string) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pub, unb64url(s), new TextEncoder().encode(`${h}.${p}`))).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(unb64url(p)))).toMatchObject({ iss: "0oa-crowbo", sub: "0oa-crowbo", aud: "https://northwind.okta.com/oauth2/v1/token" });
    expect(JSON.stringify([...store.secrets.values()])).not.toContain('"d"');
  });
});

describe("pasted secrets and the report", () => {
  it("Vanta and Drata: sealed, due for rotation in 90 days, reported once due; unused for 14 days and revoked are reported", async () => {
    const store = new MemoryConnectionStore();
    let now = NOW;
    const vault = new ConnectionVault("tenant-a", store, ring(), () => now);
    const drata = await vault.storePasted("drata", { secret: "drata-key-0123456789" });
    expect(drata.rotation_due).toBe("2027-01-14T09:00:00.000Z");
    expect(await vault.accessToken("drata", { id: "", secret: "" }, fakeHttp(() => Response.json({})).http)).toBe("drata-key-0123456789");
    await vault.storePasted("vanta", { client_id: "v-client", secret: "vanta-secret-0123456789" });
    vault.revoke("vanta", "the provider answered 401");
    now += 91 * 86_400_000;
    expect(vault.report().map((r) => [r.provider, r.problem]).sort()).toEqual([["drata", "rotation_due"], ["drata", "unused"], ["vanta", "revoked"]]);
  });
});

describe("transport: Link-header paging, and revocation fails closed", () => {
  it("parses rel=next, and Okta reads a two-page Link list completely", async () => {
    expect(linkNext('<https://x.okta.com/api/v1/users?after=a>; rel="next", <https://x.okta.com/api/v1/users>; rel="self"')).toBe("https://x.okta.com/api/v1/users?after=a");
    const { http } = fakeHttp((url) => url.endsWith("after=2")
      ? Response.json([{ profile: { login: "b@x" } }])
      : Response.json([{ profile: { login: "a@x" } }], { headers: { link: '<https://northwind.okta.com/api/v1/groups/g/users?after=2>; rel="next"' } }));
    const api = connectionFetch({ host: "northwind.okta.com", token: async () => "t", revoke: () => {}, used: () => {}, http });
    expect(await linked(api, "/api/v1/groups/g/users", (u: { profile: { login: string } }) => u.profile.login)).toEqual({ items: [{ profile: { login: "a@x" } }, { profile: { login: "b@x" } }], complete: true });
  });

  it("a next link to another host is not followed; the list stays incomplete", async () => {
    const { http, calls } = fakeHttp(() => Response.json([{ id: 1 }], { headers: { link: '<https://evil.example/api/v1/users?after=2>; rel="next"' } }));
    const api = connectionFetch({ host: "northwind.okta.com", token: async () => "t", revoke: () => {}, used: () => {}, http });
    expect((await linked(api, "/api/v1/users")).complete).toBe(false);
    expect(calls.every((c) => c.url.startsWith("https://northwind.okta.com/"))).toBe(true);
  });

  it("a 401 revokes the connection; the read is partial, the scenario unresolved, and the brief names the source and since when", async () => {
    const store = new MemoryConnectionStore();
    const vault = new ConnectionVault("tenant-a", store, ring(), () => NOW);
    await vault.setupOkta("northwind.okta.com", "0oa-crowbo");
    const tokens = fakeHttp(() => Response.json({ access_token: "okta-at", expires_in: 3600 })).http;
    const api = fakeHttp(() => new Response("{}", { status: 401 })).http;
    const fetchFor = (id: string) => (id === "identity"
      ? connectionFetch({ host: "northwind.okta.com", token: () => vault.accessToken("okta", { id: "", secret: "" }, tokens), revoke: (r) => vault.revoke("okta", r), used: () => vault.markUsed("okta"), http: api })
      : null);
    const e = await Engine.start(structuredClone(NORTHWIND), { ...demoOptions(), connectors: CONNECTORS.filter((c) => c.id === "identity"), fetchFor, sourceReport: () => vault.report() });
    expect(store.get("okta")).toMatchObject({ status: "revoked", revoked_reason: "the provider answered 401" });
    expect(e.nextMoves().scenarios.find((s) => s.scenario === "billing-exposure")!.state).toBe("unresolved");
    expect(weeklyBrief(e).markdown).toContain("## Sources not read\n- Okta: not read since 2026-10-16 (the provider answered 401). Answers that depend on it stay unresolved.");
    expect(okta.label).toBe("Okta");
  });
});
