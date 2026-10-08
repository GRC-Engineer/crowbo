import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate, callerFor, type OperatorConfig, parseOperators } from "./app/auth";
import type { Env } from "./app/env";
import { buildServer } from "./app/mcp";
import { isOperation } from "./app/operations";

export { TenantStore } from "./app/tenant";

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000",
};

const MAX_BODY = 1_000_000;

/**
 * Read a request body with a hard cap, whether or not Content-Length is sent (HTTP/2 and
 * streaming clients may omit it). A declared oversize length is refused before reading.
 */
export async function boundedBody(request: Request): Promise<Uint8Array | Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY) return json({ error: "Request exceeds the size limit" }, 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY) {
        await reader.cancel();
        return json({ error: "Request exceeds the size limit" }, 413);
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) (body.set(chunk, offset), (offset += chunk.byteLength));
  return body;
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

function invoker(env: Env, config: OperatorConfig) {
  const caller = callerFor(config, env.CLOUDFLARE_ACCOUNT_ID, env.AI_GATEWAY ?? "default");
  const stub = tenant(env, config.tenant);
  type Outcome = { ok: true; result: unknown } | { ok: false; error: string };
  return async (operation: string, args: unknown): Promise<Outcome> => (await stub.operate(caller, operation, args)) as Outcome;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "crowbo-api" });

    let operators;
    try {
      operators = parseOperators(env.CROWBO_OPERATORS);
    } catch {
      return json({ error: "Operator configuration is invalid" }, 500);
    }
    const config = authenticate(request.headers.get("authorization"), operators);
    if (!config) return json({ error: "Unauthorized" }, 401);
    const invoke = invoker(env, config);
    const body = request.method === "GET" || request.method === "HEAD" ? new Uint8Array() : await boundedBody(request);
    if (body instanceof Response) return body;

    if (url.pathname === "/mcp") {
      // Stateless: a fresh server and transport per request; identity is the bearer token.
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const server = buildServer(invoke, { synthetic: env.ALLOW_SYNTHETIC_GATES === "true" });
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
  },

  /** Cron: run every registered, due Slack sync as the operator who registered it. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const operators = parseOperators(env.CROWBO_OPERATORS);
    for (const config of Object.values(operators)) {
      if (!config.roles.includes("ingestor")) continue;
      await invoker(env, config)("sync_due", {});
    }
  },
} satisfies ExportedHandler<Env>;
