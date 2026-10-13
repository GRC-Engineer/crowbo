import { execFileSync } from "node:child_process";
import { fixedHostFetch, type FetchLike, withTimeout } from "../providers/http";
import type { WorkersAi } from "./extract";

/**
 * The models the engine calls, each over one pinned host with a timeout and a response cap.
 *  - Ingestion: Clef or Clef-flash (typed probabilities) through Workers AI.
 *  - Routing and answering: GLM-5.3-flash through Workers AI, or Claude Haiku 5.5 through the
 *    Anthropic API. They write words around a decision the code already computed; their output is
 *    checked before use (answer.ts) and never selects or ranks.
 * Keys come from the environment or the macOS Keychain and are never logged or returned.
 */

export const GLM_FLASH = "@cf/zai-org/glm-5.3-flash";
export const HAIKU = "claude-haiku-5-5";

/** A chat model that returns one JSON object as text. */
export interface ChatModel {
  id: string;
  json(system: string, user: string): Promise<unknown>;
}

const cloudflare = (account: string, token: string, http: FetchLike) => (path: string, body: unknown, timeoutMs: number) =>
  http(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...withTimeout(timeoutMs),
  });

async function unwrap(response: Response, what: string): Promise<any> {
  if (response.status !== 200) throw new Error(`${what} failed with HTTP ${response.status}`);
  const data = (await response.json()) as any;
  if (data && typeof data === "object" && "success" in data) {
    if (data.success !== true) throw new Error(`${what} returned an unsuccessful response`);
    return data.result;
  }
  return data;
}

/** Workers AI over REST: the same `run` the Worker binding offers, for the local server. */
export function workersAiRest(account: string, token: string, http: FetchLike = fixedHostFetch("api.cloudflare.com", 1_000_000)): WorkersAi {
  const post = cloudflare(account, token, http);
  return { run: async (model, input) => unwrap(await post(`/ai/run/${model}`, input, 30_000), `Workers AI ${model}`) };
}

export function glmFlash(account: string, token: string, http: FetchLike = fixedHostFetch("api.cloudflare.com", 1_000_000)): ChatModel {
  const post = cloudflare(account, token, http);
  return {
    id: GLM_FLASH,
    async json(system, user) {
      const result = await unwrap(
        await post("/ai/v1/chat/completions", {
          model: GLM_FLASH, messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_object" }, max_completion_tokens: 2048, store: false, stream: false,
        }, 60_000),
        "GLM",
      );
      const text = result?.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("GLM returned no message");
      return JSON.parse(text);
    },
  };
}

export function claudeHaiku(apiKey: string, http: FetchLike = fixedHostFetch("api.anthropic.com", 1_000_000)): ChatModel {
  return {
    id: HAIKU,
    async json(system, user) {
      const response = await http("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: HAIKU, max_tokens: 2048, system: `${system}\nReply with one JSON object and nothing else.`, messages: [{ role: "user", content: user }] }),
        ...withTimeout(60_000),
      });
      if (response.status !== 200) throw new Error(`Haiku failed with HTTP ${response.status}`);
      const data = (await response.json()) as any;
      const text = data?.content?.find((c: any) => c.type === "text")?.text;
      if (typeof text !== "string") throw new Error("Haiku returned no text");
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    },
  };
}

/** A secret from the environment, else the macOS Keychain (any account, by service name). */
export function secret(env: string | undefined, service: string): string | null {
  if (env) return env;
  try {
    const out = execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], { stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 });
    const value = new TextDecoder().decode(out).replace(/[\r\n]+$/, "");
    return /^[\x21-\x7e]{8,512}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}
