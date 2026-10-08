import { type AuthRequest, OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { authenticate, type OperatorConfig, operatorByHash, parseOperators, tokenHash } from "./auth";
import type { Env } from "./env";

/**
 * OAuth 2.1 in front of /mcp so Claude (app, claude.ai, Claude Code) can connect as a custom
 * connector. Claude registers itself (RFC 7591), then the person signs in once on /authorize by
 * pasting their existing Crowbo operator token. The grant stores only that token's hash, and every
 * request re-resolves it against the current CROWBO_OPERATORS secret, so removing an operator
 * revokes their connector immediately. Redirects are limited to Claude's callbacks and loopback.
 */

export const SCOPE = "crowbo";
const CLAUDE_CALLBACKS = new Set(["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);

/** Claude's hosted callbacks, or a loopback callback for a local client such as Claude Code. */
export function redirectAllowed(uri: string): boolean {
  if (CLAUDE_CALLBACKS.has(uri)) return true;
  try {
    const u = new URL(uri);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1") && !u.username && !u.password;
  } catch {
    return false;
  }
}

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:10vh auto;padding:0 16px;color:#111;background:#fff}` +
      `input,button{font:inherit;padding:.6rem;width:100%;box-sizing:border-box;margin-top:.5rem}button{cursor:pointer}small{color:#555}</style></head>` +
      `<body><h1>${escape(title)}</h1>${body}</body></html>`,
    { status, headers: PAGE_HEADERS },
  );
}

async function clientName(env: Env, auth: AuthRequest): Promise<string> {
  const client = await env.OAUTH_PROVIDER!.lookupClient(auth.clientId);
  return client?.clientName?.slice(0, 100) || "An MCP client";
}

/** /authorize: show who is asking, take the operator token, and complete the grant. */
async function authorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let query = url.search;
  let token: string | null = null;
  if (request.method === "POST") {
    // The form posts back to this origin only; a cross-site post cannot complete a grant.
    if (request.headers.get("origin") !== url.origin) return page("Request refused", "<p>This form must be submitted from Crowbo itself.</p>", 403);
    const length = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(length) || length > 8_000) return page("Request refused", "<p>The form is too large.</p>", 413);
    const form = new URLSearchParams((await request.text()).slice(0, 8_000));
    query = form.get("q") ?? "";
    token = form.get("token");
    if (!query.startsWith("?")) return page("Request refused", "<p>The authorization request is missing.</p>", 400);
  } else if (request.method !== "GET") {
    return page("Request refused", "<p>Unsupported method.</p>", 405);
  }

  let auth: AuthRequest;
  try {
    auth = await env.OAUTH_PROVIDER!.parseAuthRequest(new Request(`${url.origin}/authorize${query}`));
  } catch {
    return page("Request refused", "<p>The authorization request is invalid or the client is not registered.</p>", 400);
  }
  if (!redirectAllowed(auth.redirectUri)) return page("Request refused", "<p>Crowbo only returns sign-ins to Claude or to a client on this computer.</p>", 400);
  const name = await clientName(env, auth);
  const destination = new URL(auth.redirectUri).host;

  if (token !== null) {
    let operators: Record<string, OperatorConfig>;
    try {
      operators = parseOperators(env.CROWBO_OPERATORS);
    } catch {
      return page("Unavailable", "<p>Crowbo's operator configuration is invalid.</p>", 500);
    }
    const trimmed = token.trim();
    const config = authenticate(`Bearer ${trimmed}`, operators);
    if (config) {
      const { redirectTo } = await env.OAUTH_PROVIDER!.completeAuthorization({
        request: auth,
        // Authorization codes use ":" as a separator, so the user ID must not contain one.
        userId: encodeURIComponent(`${config.tenant}/${config.reader}`),
        metadata: { client: name },
        scope: [SCOPE],
        props: { operator: tokenHash(trimmed) },
      });
      return Response.redirect(redirectTo, 302);
    }
  }

  const retry = token !== null ? `<p role="alert"><strong>That token was not recognised.</strong></p>` : "";
  return page(
    "Connect Crowbo",
    `<p><strong>${escape(name)}</strong> wants to use Crowbo as you. After you sign in you will be returned to <strong>${escape(destination)}</strong>.</p>` +
      `<p>Results are simulations: Crowbo never authorises or executes work.</p>${retry}` +
      `<form method="post" action="/authorize"><input type="hidden" name="q" value="${escape(query)}">` +
      `<label>Crowbo operator token<input name="token" type="password" autocomplete="off" required minlength="24" maxlength="512"></label>` +
      `<button type="submit">Allow</button></form><p><small>Crowbo stores only a hash of this token. Removing your operator access revokes the connection.</small></p>`,
    token !== null ? 401 : 200,
  );
}

type Serve = (request: Request, env: Env, config: OperatorConfig) => Promise<Response>;

/** The OAuth provider for one request's origin. `serve` handles authenticated /mcp requests. */
export function oauthProvider(origin: string, serve: Serve): OAuthProvider<Env> {
  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: {
      async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        let config: OperatorConfig | null = null;
        try {
          config = operatorByHash((ctx as ExecutionContext & { props?: { operator?: unknown } }).props?.operator, parseOperators(env.CROWBO_OPERATORS));
        } catch {
          config = null;
        }
        if (!config) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
        return serve(request, env, config);
      },
    },
    defaultHandler: {
      async fetch(request: Request, env: Env) {
        if (new URL(request.url).pathname === "/authorize") return authorize(request, env);
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });
      },
    },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: [SCOPE],
    resourceMetadata: { resource: `${origin}/mcp`, scopes_supported: [SCOPE], resource_name: "Crowbo" },
    accessTokenTTL: 3600,
    refreshTokenTTL: 14 * 24 * 3600,
    clientRegistrationTTL: 30 * 24 * 3600,
    clientRegistrationCallback: ({ clientMetadata }) => {
      const uris = clientMetadata.redirect_uris;
      const ok = Array.isArray(uris) && uris.length > 0 && uris.every((u) => typeof u === "string" && redirectAllowed(u));
      return ok ? undefined : { code: "invalid_redirect_uri", description: "Crowbo accepts Claude's callback or a loopback redirect only" };
    },
  });
}
