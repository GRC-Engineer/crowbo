import { z } from "zod";
import { MANIFESTS } from "../connections/manifests";
import type { Env } from "./env";

/**
 * The install-and-consent routes (ADR 0003). An operator with the ingestor role starts a connection;
 * the provider's consent screen sends the admin back to the public callback, whose state names the
 * tenant and carries a one-time nonce only that tenant's Durable Object can redeem. Okta returns a
 * public key for the admin to register; Vanta and Drata take a pasted secret. Nothing here returns a
 * secret. Off (404) until the key-encryption key is configured.
 */

export type ConnectOp =
  | { op: "start"; provider: string; redirectUri: string }
  | { op: "callback"; provider: string; nonce: string; code: string; redirectUri: string }
  | { op: "okta_setup"; host: string; clientId: string }
  | { op: "paste"; provider: "vanta" | "drata"; clientId?: string; secret: string }
  | { op: "status" }
  | { op: "rekey" };

export type ConnectCall = (tenant: string, op: ConnectOp) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const providerRe = /^\/connect\/([a-z-]{2,30})\/(start|callback|setup|secret)$/;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export const connectEnabled = (env: Env) => Boolean(env.CONNECTIONS_KEK && env.CONNECT_REDIRECT_BASE);

/** Routes that need an authenticated operator: start, Okta setup, a pasted secret, status. */
export async function connectAuthed(request: Request, env: Env, tenant: string, roles: string[], call: ConnectCall): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/connect/")) return null;
  if (!connectEnabled(env)) return json({ error: "Not found" }, 404);
  if (!roles.includes("ingestor")) return json({ error: "Connecting a source needs the ingestor role" }, 403);
  if (url.pathname === "/connect/status" && request.method === "GET") return answer(await call(tenant, { op: "status" }));
  if (url.pathname === "/connect/rekey" && request.method === "POST") return answer(await call(tenant, { op: "rekey" }));
  const m = providerRe.exec(url.pathname);
  if (!m || request.method !== "POST" || !MANIFESTS[m[1]]) return json({ error: "Not found" }, 404);
  const [, provider, action] = m;
  const body = await request.json().catch(() => ({}));
  if (action === "start") {
    const r = await call(tenant, { op: "start", provider, redirectUri: `${env.CONNECT_REDIRECT_BASE}/connect/${provider}/callback` });
    if (!r.ok) return answer(r);
    const { url: authorize, state } = r.result as { url: string; state: string };
    // The state the provider echoes back names the tenant and the nonce; only that tenant's object can redeem it.
    const u = new URL(authorize);
    u.searchParams.set("state", `${b64url(tenant)}.${state}`);
    return json({ authorize_url: u.toString() });
  }
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

/** The public callback the provider redirects the admin to. */
export async function connectCallback(request: Request, env: Env, call: ConnectCall): Promise<Response | null> {
  const url = new URL(request.url);
  const m = providerRe.exec(url.pathname);
  if (!m || m[2] !== "callback") return null;
  if (!connectEnabled(env) || !MANIFESTS[m[1]]) return json({ error: "Not found" }, 404);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const dot = state.indexOf(".");
  if (!code || dot < 1) return json({ error: "The provider did not return a code and state" }, 400);
  let tenant: string;
  try {
    tenant = unb64url(state.slice(0, dot));
  } catch {
    return json({ error: "Invalid state" }, 400);
  }
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(tenant)) return json({ error: "Invalid state" }, 400);
  const r = await call(tenant, { op: "callback", provider: m[1], nonce: state.slice(dot + 1), code, redirectUri: `${env.CONNECT_REDIRECT_BASE}/connect/${m[1]}/callback` });
  return r.ok ? new Response(`Connected ${MANIFESTS[m[1]].label}. You can close this tab.`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }) : json({ error: r.error }, 400);
}

function answer(r: { ok: true; result: unknown } | { ok: false; error: string }) {
  return r.ok ? json(r.result) : json({ error: r.error }, 400);
}
