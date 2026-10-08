// The Claude connector sign-in, end to end through the Worker: discovery, registration, the
// /authorize page, code exchange with PKCE, then MCP with the OAuth token. Also the refusals.
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { tokenHash } from "../../src/app/auth";
import worker from "../../src/worker";

const ORIGIN = "https://crowbo.test";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const TOKEN = "operator-token-0123456789abcdef";
const operators = (token = TOKEN) => JSON.stringify({ [tokenHash(token)]: { tenant: "synthetic", reader: "ayoub", source_scopes: [], experiment_id: "oauth-test" } });

/** Enough of Workers KV for the OAuth provider: values, expiry ignored, metadata, prefix listing. */
function memoryKv() {
  const store = new Map<string, { value: string; metadata?: unknown }>();
  return {
    async get(key: string, type?: unknown) {
      const v = store.get(key)?.value ?? null;
      const kind = typeof type === "string" ? type : (type as { type?: string } | undefined)?.type;
      return v !== null && kind === "json" ? JSON.parse(v) : v;
    },
    async getWithMetadata(key: string, type?: unknown) {
      const entry = store.get(key);
      return { value: entry ? await this.get(key, type) : null, metadata: entry?.metadata ?? null };
    },
    async put(key: string, value: string, options?: { metadata?: unknown }) {
      store.set(key, { value, metadata: options?.metadata });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(options: { prefix?: string } = {}) {
      const keys = [...store.entries()].filter(([k]) => k.startsWith(options.prefix ?? "")).map(([name, e]) => ({ name, metadata: e.metadata }));
      return { keys, list_complete: true, cursor: "" };
    },
  };
}

function setup(withKv = true) {
  const kv = memoryKv();
  const env: any = {
    CROWBO_OPERATORS: operators(),
    CLOUDFLARE_ACCOUNT_ID: "0".repeat(32),
    ALLOW_SYNTHETIC_GATES: "true",
    TENANT: { jurisdiction() { return this; }, idFromName: () => "id", get: () => ({ operate: async () => ({ ok: false, error: "unused" }) }) },
    ...(withKv ? { OAUTH_KV: kv } : {}),
  };
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
  const fetch = (path: string, init?: RequestInit) => worker.fetch(new Request(`${ORIGIN}${path}`, { redirect: "manual", ...init }), env, ctx);
  return { env, fetch };
}

type Fetch = (path: string, init?: RequestInit) => Promise<Response>;

const verifier = createHash("sha256").update(randomUUID()).digest("base64url"); // 43 chars, a valid PKCE verifier
const challenge = createHash("sha256").update(verifier).digest("base64url");

async function register(fetch: Fetch, redirect = CALLBACK) {
  return fetch("/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Claude", redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  });
}

const authorizeQuery = (clientId: string) =>
  `?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: CALLBACK, state: "s1", code_challenge: challenge, code_challenge_method: "S256", resource: `${ORIGIN}/mcp` })}`;

const submit = (fetch: Fetch, q: string, token: string, origin = ORIGIN) =>
  fetch("/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin }, body: new URLSearchParams({ q, token }).toString() });

async function signIn(s: ReturnType<typeof setup>) {
  const { client_id } = await (await register(s.fetch)).json() as { client_id: string };
  const q = authorizeQuery(client_id);
  const done = await submit(s.fetch, q, TOKEN);
  const code = new URL(done.headers.get("location")!).searchParams.get("code")!;
  const tokens = await s.fetch("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id, code_verifier: verifier, resource: `${ORIGIN}/mcp` }).toString(),
  });
  return { client_id, q, done, tokens: (await tokens.json()) as { access_token: string; refresh_token: string } };
}

const listTools = (s: ReturnType<typeof setup>, token: string) =>
  s.fetch("/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });

describe("Claude connector OAuth", () => {
  it("advertises protected-resource metadata and challenges an unauthenticated /mcp call", async () => {
    const s = setup();
    const meta = await (await s.fetch("/.well-known/oauth-protected-resource/mcp")).json() as { resource: string };
    expect(meta.resource).toBe(`${ORIGIN}/mcp`);
    const challenged = await s.fetch("/mcp", { method: "POST" });
    expect(challenged.status).toBe(401);
    expect(challenged.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("registers Claude's callback and refuses any other redirect", async () => {
    const s = setup();
    expect((await register(s.fetch)).status).toBe(201);
    expect((await register(s.fetch, "https://attacker.example/cb")).status).toBe(400);
    expect((await register(s.fetch, "http://127.0.0.1:5173/callback")).status).toBe(201);
  });

  it("signs in with the operator token, exchanges the code with PKCE and serves MCP", async () => {
    const s = setup();
    const { client_id } = await (await register(s.fetch)).json() as { client_id: string };
    const shown = await s.fetch(`/authorize${authorizeQuery(client_id)}`);
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(await shown.text()).toContain("claude.ai");

    const { done, tokens } = await signIn(s);
    expect(done.status).toBe(302);
    expect(done.headers.get("location")).toMatch(/^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?code=.+&state=s1(&iss=.+)?$/);
    expect(tokens.access_token).toBeTruthy();

    const listed = await listTools(s, tokens.access_token);
    expect(listed.status).toBe(200);
    const names = ((await listed.json()) as any).result.tools.map((t: any) => t.name);
    expect(names).toContain("programme_recommend");
    expect(names).toContain("ask_standing_decision");
  });

  it("refuses a wrong token and a cross-site form post", async () => {
    const s = setup();
    const { client_id } = await (await register(s.fetch)).json() as { client_id: string };
    const q = authorizeQuery(client_id);
    expect((await submit(s.fetch, q, "not-the-operator-token-000000")).status).toBe(401);
    expect((await submit(s.fetch, q, TOKEN, "https://attacker.example")).status).toBe(403);
  });

  it("removing the operator revokes the connector at once", async () => {
    const s = setup();
    const { tokens } = await signIn(s);
    expect((await listTools(s, tokens.access_token)).status).toBe(200);
    s.env.CROWBO_OPERATORS = operators("a-different-operator-token-000");
    expect((await listTools(s, tokens.access_token)).status).toBe(401);
  });

  it("without the OAuth store (production) only operator bearer tokens work", async () => {
    const s = setup(false);
    expect((await s.fetch("/oauth/register", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await listTools(s, TOKEN)).status).toBe(200);
  });
});
