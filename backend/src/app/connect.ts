import { z } from "zod";
import { MANIFESTS } from "../connections/manifests";
import { readCapped } from "./body";
import type { Env } from "./env";

/**
 * The install-and-consent routes (ADR 0003). An operator with the ingestor role starts a connection;
 * the provider's consent screen sends the admin back to the public callback. The state the provider
 * echoes is signed by the Worker (HMAC over tenant, provider and nonce), so a forged or altered state
 * is refused before any tenant object is touched; the nonce itself is one-time and lives in the
 * tenant. Which company consented is checked in the tenant against its registered identities, or
 * confirmed by the operator who started the flow. Nothing here returns a secret. Off (404) until the
 * key-encryption key is configured.
 */

export type ConnectOp =
  | { op: "start"; provider: string; redirectUri: string; initiator: string }
  | { op: "callback"; provider: string; nonce: string; code: string; redirectUri: string }
  | { op: "confirm"; provider: string; operator: string }
  | { op: "okta_setup"; host: string; clientId: string }
  | { op: "paste"; provider: "vanta" | "drata"; clientId?: string; secret: string }
  | { op: "status" }
  | { op: "rekey" };

export type ConnectCall = (tenant: string, op: ConnectOp) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const textB64url = (s: string) => b64url(new TextEncoder().encode(s));
const fromB64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
const providerRe = /^\/connect\/([a-z-]{2,30})\/(start|callback|setup|secret|confirm)$/;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export const connectEnabled = (env: Env) => Boolean(env.CONNECTIONS_KEK && env.CONNECT_REDIRECT_BASE);

/** An HMAC key for consent states, derived from the key-encryption keyring the Worker reads. */
export async function stateKey(kekRaw: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(kekRaw), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("crowbo:consent-state"), info: new TextEncoder().encode("v1") },
    base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"],
  );
}

const signed = (tenant: string, provider: string, nonce: string) => new TextEncoder().encode(`${tenant}|${provider}|${nonce}`);

export async function signState(key: CryptoKey, tenant: string, provider: string, nonce: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed(tenant, provider, nonce)));
  return `${textB64url(tenant)}.${nonce}.${b64url(mac)}`;
}

/** The tenant and nonce of a state, or null when it is malformed or its signature does not check. */
export async function verifyState(key: CryptoKey, provider: string, state: string): Promise<{ tenant: string; nonce: string } | null> {
  const parts = state.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]{1,200}$/.test(p))) return null;
  let tenant: string;
  try {
    tenant = fromB64url(parts[0]);
  } catch {
    return null;
  }
  const mac = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  return (await crypto.subtle.verify("HMAC", key, mac, signed(tenant, provider, parts[1]))) ? { tenant, nonce: parts[1] } : null;
}

/** Routes that need an authenticated operator: start, confirm, Okta setup, a pasted secret, status, rekey. */
export async function connectAuthed(request: Request, env: Env, operator: { tenant: string; reader: string; roles: string[] }, kek: () => Promise<string | null>, call: ConnectCall): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/connect/")) return null;
  if (!connectEnabled(env)) return json({ error: "Not found" }, 404);
  const { tenant, reader, roles } = operator;
  if (url.pathname === "/connect/rekey" && request.method === "POST") {
    if (!roles.includes("key_admin")) return json({ error: "Re-encrypting keys needs the key_admin role" }, 403);
    return answer(await call(tenant, { op: "rekey" }));
  }
  if (!roles.includes("ingestor")) return json({ error: "Connecting a source needs the ingestor role" }, 403);
  if (url.pathname === "/connect/status" && request.method === "GET") return answer(await call(tenant, { op: "status" }));
  const m = providerRe.exec(url.pathname);
  if (!m || request.method !== "POST" || !MANIFESTS[m[1]] || m[2] === "callback") return json({ error: "Not found" }, 404);
  const [, provider, action] = m;
  const raw = await readCapped(request, 16_000);
  if (!raw) return json({ error: "Request exceeds the size limit" }, 413);
  let body: unknown = {};
  try {
    body = raw.length ? JSON.parse(new TextDecoder().decode(raw)) : {};
  } catch {
    return json({ error: "Request body must be JSON" }, 400);
  }
  if (action === "start") {
    const secret = await kek();
    if (!secret) return json({ error: "Connections are not configured" }, 404);
    const r = await call(tenant, { op: "start", provider, initiator: reader, redirectUri: `${env.CONNECT_REDIRECT_BASE}/connect/${provider}/callback` });
    if (!r.ok) return answer(r);
    const { url: authorize, state } = r.result as { url: string; state: string };
    const u = new URL(authorize);
    u.searchParams.set("state", await signState(await stateKey(secret), tenant, provider, state));
    return json({ authorize_url: u.toString() });
  }
  if (action === "confirm") return answer(await call(tenant, { op: "confirm", provider, operator: reader }));
  if (action === "setup" && provider === "okta") {
    const p = z.strictObject({ host: z.string().max(100), client_id: z.string().min(1).max(100) }).safeParse(body);
    return p.success ? answer(await call(tenant, { op: "okta_setup", host: p.data.host, clientId: p.data.client_id })) : json({ error: "Send {host, client_id}" }, 400);
  }
  if (action === "secret" && (provider === "vanta" || provider === "drata")) {
    const p = z.strictObject({ client_id: z.string().max(200).optional(), secret: z.string().min(16).max(4096) }).safeParse(body);
    return p.success ? answer(await call(tenant, { op: "paste", provider, clientId: p.data.client_id, secret: p.data.secret })) : json({ error: "Send {client_id?, secret}" }, 400);
  }
  return json({ error: "Not found" }, 404);
}

/** The public callback the provider redirects the admin to. The state is verified before any tenant is reached. */
export async function connectCallback(request: Request, env: Env, kek: () => Promise<string | null>, call: ConnectCall): Promise<Response | null> {
  const url = new URL(request.url);
  const m = providerRe.exec(url.pathname);
  if (!m || m[2] !== "callback") return null;
  const secret = connectEnabled(env) ? await kek() : null;
  if (!secret || !MANIFESTS[m[1]]) return json({ error: "Not found" }, 404);
  const code = url.searchParams.get("code");
  const verified = await verifyState(await stateKey(secret), m[1], url.searchParams.get("state") ?? "");
  if (!code || !verified) return json({ error: "Invalid or missing state" }, 400);
  const r = await call(verified.tenant, { op: "callback", provider: m[1], nonce: verified.nonce, code, redirectUri: `${env.CONNECT_REDIRECT_BASE}/connect/${m[1]}/callback` });
  if (!r.ok) return json({ error: r.error }, 400);
  const c = r.result as { status: string; identity: string | null };
  const label = MANIFESTS[m[1]].label;
  const text = c.status === "pending"
    ? `${label} was consented by ${c.identity ?? "an identity the provider did not state"}. Return to Crowbo: the operator who started this confirms it before it is used.`
    : `Connected ${label}. You can close this tab.`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

function answer(r: { ok: true; result: unknown } | { ok: false; error: string }) {
  return r.ok ? json(r.result) : json({ error: r.error }, 400);
}
