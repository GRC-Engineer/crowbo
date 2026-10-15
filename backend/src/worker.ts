import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate, callerFor, type OperatorConfig, parseOperators } from "./app/auth";
import type { Env } from "./app/env";
import { buildServer } from "./app/mcp";
import { oauthProvider } from "./app/oauth";
import { readCapped } from "./app/body";
import { type ConnectCall, connectAuthed, connectCallback } from "./app/connect";
import { isOperation } from "./app/operations";
import { slackConfig, slackDeps, slackPoster, weeklyTargets } from "./app/slack";
import { handleSlackEvent, postWeekly, WEEKLY_CRON } from "./surfaces/slack-events";

export { TenantStore } from "./app/tenant";

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000",
};

const MAX_BODY = 1_000_000;

/** The request body, or a 413 when it is over the cap (see readCapped). */
export async function boundedBody(request: Request): Promise<Uint8Array | Response> {
  return (await readCapped(request, MAX_BODY)) ?? json({ error: "Request exceeds the size limit" }, 413);
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...SECURITY_HEADERS } });

/**
 * One Durable Object per tenant, created in the EU jurisdiction. Fails closed: anything other
 * than the explicit local-only value "none" means EU. (Local workerd cannot emulate jurisdictions.)
 */
function tenant(env: Env, name: string) {
  const namespace = env.DO_JURISDICTION === "none" ? env.TENANT : env.TENANT.jurisdiction("eu");
  return namespace.get(namespace.idFromName(name));
}

/** A plain secret or a Secrets Store binding, read in the Worker; null when unset. */
async function secretValue(v: string | SecretsStoreSecret | undefined): Promise<string | null> {
  if (!v) return null;
  if (typeof v === "string") return v;
  return v.get().catch(() => null);
}

/** A tenant's connections live in the tenant's own object. */
const connectCaller = (env: Env): ConnectCall => (tenantName, op) => tenant(env, tenantName).connections(tenantName, op);

/** A demo engine copy's operations, by its key (tenant::engine::reader). */
/** The Slack surface's calls into a workspace's engine copy, marked as coming from Slack. */
const engineCaller = (env: Env) => (key: string) => (actor: string, op: string, args: unknown) => tenant(env, key).engineCall(actor, op, args, "slack");

function invoker(env: Env, config: OperatorConfig) {
  const caller = callerFor(config, env.CLOUDFLARE_ACCOUNT_ID, env.AI_GATEWAY ?? "default");
  const stub = tenant(env, config.tenant);
  type Outcome = { ok: true; result: unknown } | { ok: false; error: string };
  return async (operation: string, args: unknown): Promise<Outcome> => (await stub.operate(caller, operation, args)) as Outcome;
}

/** Serve an authenticated operator's request: MCP at /mcp, operations at /v1/operations/<name>. */
async function serve(request: Request, env: Env, config: OperatorConfig): Promise<Response> {
  const url = new URL(request.url);
  // Connecting a source: handled first, it reads its own small JSON body.
  const connected = await connectAuthed(request, env, config, () => secretValue(env.CONNECTIONS_KEK), connectCaller(env));
  if (connected) return withSecurityHeaders(connected);
  const invoke = invoker(env, config);
  const body = request.method === "GET" || request.method === "HEAD" ? new Uint8Array() : await boundedBody(request);
  if (body instanceof Response) return body;

  if (url.pathname === "/mcp") {
    // Stateless: a fresh server and transport per request; identity is the bearer token.
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const synthetic = env.ALLOW_SYNTHETIC_GATES === "true";
      // Each person's demo engine lives in its own object, keyed by tenant and reader, so two tokens can
      // never share a clock or a memory even if they share a tenant. Their reader name is the actor.
      const engine = synthetic ? (op: string, args: unknown) => tenant(env, `${config.tenant}::engine::${config.reader}`).engineCall(config.reader, op, args) : undefined;
      const server = buildServer(invoke, { synthetic, engine });
    await server.connect(transport);
    try {
      const buffered = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : body,
    });
    const response = await transport.handleRequest(buffered);
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
      return new Response(response.body, { status: response.status, headers });
    } finally {
      await server.close();
    }
  }

  const match = /^\/v1\/operations\/([a-z_]+)$/.exec(url.pathname);
  if (!match || request.method !== "POST") return json({ error: "Not found" }, 404);
  const operation = match[1];
  if (!isOperation(operation)) return json({ error: "Unknown operation" }, 404);
  let args: unknown = {};
  try {
    const text = new TextDecoder().decode(body);
    args = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "Request body must be JSON" }, 400);
  }
  const outcome = await invoke(operation, args);
  if (outcome.ok && operation === "export_decision") {
    const html = (outcome.result as { html: string }).html;
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        ...SECURITY_HEADERS,
      },
    });
  }
  return outcome.ok ? json(outcome.result) : json({ error: outcome.error }, 422);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "crowbo-api" });
    // Claude shows a connector's favicon: point it at the crow on the public site.
    if (url.pathname === "/favicon.ico") return Response.redirect("https://crowbo.ai/assets/favicon-32.png", 301);
    // A provider's consent callback: public, its state names the tenant and a one-time nonce.
    const callback = await connectCallback(request, env, () => secretValue(env.CONNECTIONS_KEK), connectCaller(env));
    if (callback) return withSecurityHeaders(callback);
    // Slack's Events API: signed by Slack, not by an operator token, so it is checked before auth.
    if (url.pathname === "/slack/events") {
      let config;
      try {
        config = slackConfig(env);
      } catch {
        return json({ error: "Slack configuration is invalid" }, 500);
      }
      if (!config) return json({ error: "Not found" }, 404);
      return withSecurityHeaders(await handleSlackEvent(request, slackDeps(config, engineCaller(env), (work) => ctx.waitUntil(work))));
    }

    let operators;
    try {
      operators = parseOperators(env.CROWBO_OPERATORS);
    } catch {
      return json({ error: "Operator configuration is invalid" }, 500);
    }
    // An operator's own bearer token (CLI, Claude Code, scripts) is served directly.
    const config = authenticate(request.headers.get("authorization"), operators);
    if (config) return serve(request, env, config);
    // Where OAuth is bound (staging), everything else goes through the OAuth provider: Claude's
    // discovery and registration, /authorize, token exchange, and /mcp with an OAuth token.
    if (env.OAUTH_KV) return withSecurityHeaders(await oauthProvider(url.origin, serve).fetch(request, env, ctx));
    return json({ error: "Unauthorized" }, 401);
  },

  /** Cron: the weekly Slack post on WEEKLY_CRON; otherwise every registered, due Slack sync as the operator who registered it. */
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === WEEKLY_CRON) {
      const config = slackConfig(env);
      if (config) await postWeekly(weeklyTargets(config, engineCaller(env)), slackPoster(config.botToken));
      return;
    }
    const operators = parseOperators(env.CROWBO_OPERATORS);
    for (const config of Object.values(operators)) {
      if (!config.roles.includes("ingestor")) continue;
      await invoker(env, config)("sync_due", {});
    }
  },
} satisfies ExportedHandler<Env>;
