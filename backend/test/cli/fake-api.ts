// An in-process stand-in for the Worker's HTTP API (src/worker.ts): bearer check, the
// /v1/operations/<name> route, the operation table with its bounded error policy, and the
// HTML response for export_decision. It lets the CLI run end to end without a server.
import { isOperation, run, type Context } from "../../src/app/operations";
import type { Settings } from "../../src/domain/settings";
import type { FetchLike } from "../../src/providers/http";
import type { Store } from "../../src/services/ports";
import { MemoryLedger } from "../helpers";

export const TOKEN = "synthetic-operator-token-0123456789";

export type FakeApi = {
  fetch: FetchLike;
  calls: { operation: string; body: unknown }[];
  providerCalls: string[];
  ledger: MemoryLedger;
};

export function fakeApi(options: { settings: () => Settings; store: Store; aiToken?: string | null; provider?: FetchLike }): FakeApi {
  const ledger = new MemoryLedger();
  const calls: FakeApi["calls"] = [];
  const providerCalls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    if (new Headers(init?.headers).get("authorization") !== `Bearer ${TOKEN}`) return json({ error: "Unauthorized" }, 401);
    const match = /^\/v1\/operations\/([a-z_]+)$/.exec(url.pathname);
    if (!match || init?.method !== "POST") return json({ error: "Not found" }, 404);
    const operation = match[1];
    if (!isOperation(operation)) return json({ error: "Unknown operation" }, 404);
    let body: unknown;
    try {
      body = JSON.parse(String(init?.body ?? "{}"));
    } catch {
      return json({ error: "Request body must be JSON" }, 400);
    }
    calls.push({ operation, body });
    const settings = options.settings();
    const context: Context = {
      caller: { settings, roles: ["operator", "ingestor"] },
      store: options.store,
      ledger,
      ai: {
        account: settings.cloudflare_account,
        gateway: settings.gateway,
        token: options.aiToken ?? null,
        fetch: async (target, request) => {
          providerCalls.push(target);
          if (!options.provider) throw new Error("no provider call expected");
          return options.provider(target, request);
        },
      },
      slackToken: null,
      allowSyntheticGates: true,
    };
    const outcome = await run(context, operation, body);
    if (outcome.ok && operation === "export_decision") {
      return new Response((outcome.result as { html: string }).html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return outcome.ok ? json(outcome.result) : json({ error: outcome.error }, 422);
  };
  return { fetch, calls, providerCalls, ledger };
}
