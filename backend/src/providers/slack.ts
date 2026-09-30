import { z } from "zod";
import { canonicalJson } from "../domain/canonical";
import { CrowboError } from "../domain/errors";
import { instant, now } from "../domain/time";
import type { Ledger } from "../services/ports";
import { type FetchLike, fixedHostFetch, withTimeout } from "./http";

/** Read complete, bounded Slack threads under one explicitly configured identity. */

export const slackTarget = z.strictObject({
  channel_id: z.string().regex(/^[CG][A-Z0-9]{8,32}$/),
  message_ts: z.string().regex(/^\d{10,12}\.\d{6}$/),
  title: z.string().min(1).max(500),
});
export type SlackTarget = z.infer<typeof slackTarget>;
export const nativeId = (t: SlackTarget) => `${t.channel_id}:${t.message_ts}`;

export const slackSpec = z
  .strictObject({
    name: z.string().regex(/^[a-z0-9-]{1,64}$/),
    workspace: z.string().regex(/^[a-z0-9-]{1,100}$/),
    team_id: z.string().regex(/^T[A-Z0-9]{8,32}$/),
    user_id: z.string().regex(/^[UW][A-Z0-9]{8,32}$/),
    targets: z.array(slackTarget).min(1).max(5),
    processors: z.array(z.enum(["turbopuffer", "voyage", "jev", "openai/gpt-6-luna", "@cf/zai-org/glm-5.3-flash"])),
    poll_seconds: z.number().int().min(60).max(86400).default(900),
    freshness_seconds: z.number().int().min(60).max(86400).default(3600),
    grant_seconds: z.number().int().min(60).max(86400).default(86400),
  })
  .superRefine((s, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new Set(s.targets.map(nativeId)).size !== s.targets.length) return fail("Duplicate Slack thread");
    if (!["turbopuffer", "voyage", "jev"].every((p) => (s.processors as string[]).includes(p))) {
      return fail("Sync requires storage, embedding and classification permission");
    }
    if (!(s.poll_seconds <= s.freshness_seconds && s.freshness_seconds <= s.grant_seconds)) {
      return fail("Poll interval must fit within freshness and access lifetimes");
    }
  });
export type SlackSpec = z.infer<typeof slackSpec>;

export const threadSnapshot = z
  .strictObject({
    native_id: z.string(),
    checked_at: instant,
    text: z.string().min(1).max(40000).nullable().default(null),
    unavailable: z.boolean().default(false),
    method: z.enum(["slack_api", "mcp_capture"]),
  })
  .refine((s) => s.unavailable !== (s.text !== null), "A snapshot must have either text or a confirmed withdrawal");
export type ThreadSnapshot = z.infer<typeof threadSnapshot>;

export class SlackReadError extends CrowboError {
  constructor(
    message: string,
    readonly retrySeconds = 60,
  ) {
    super(message);
  }
}

export interface ThreadReader {
  authenticate(spec: SlackSpec): Promise<void>;
  read(target: SlackTarget): Promise<ThreadSnapshot>;
}

export class SlackReader implements ThreadReader {
  private readonly http: FetchLike;

  constructor(
    private readonly ledger: Ledger,
    private readonly token: string,
    fetchImpl?: FetchLike,
  ) {
    this.http = fetchImpl ?? fixedHostFetch("slack.com", 1_000_000);
  }

  private async get(method: string, params: Record<string, string | number> = {}): Promise<Record<string, any> | null> {
    const call = await this.ledger.reserve("slack", method);
    try {
      const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
      const response = await this.http(`https://slack.com/api/${method}${query.size ? `?${query}` : ""}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        ...withTimeout(30_000),
      });
      await this.ledger.receipt(call, { http_status: response.status });
      if (response.status === 429) {
        const delay = Number.parseInt(response.headers.get("retry-after") ?? "60", 10);
        throw new SlackReadError("Slack rate limit; retry is scheduled", Math.max(60, Math.min(Number.isNaN(delay) ? 60 : delay, 86400)));
      }
      if (response.status !== 200) throw new SlackReadError("Slack request did not succeed");
      const body = await response.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new TypeError();
      const b = body as Record<string, any>;
      if (b.ok !== true) {
        if (["thread_not_found", "channel_not_found", "not_in_channel"].includes(b.error) && method === "conversations.replies") return null;
        throw new SlackReadError("Slack did not confirm source access or a complete response");
      }
      return b;
    } catch (error) {
      if (error instanceof SlackReadError) throw error;
      throw new SlackReadError("Slack transport or response validation failed");
    }
  }

  async authenticate(spec: SlackSpec): Promise<void> {
    const result = (await this.get("auth.test"))!;
    if (result.team_id !== spec.team_id || result.user_id !== spec.user_id) {
      throw new SlackReadError("Slack credential does not match the configured workspace and reader");
    }
  }

  async read(target: SlackTarget): Promise<ThreadSnapshot> {
    const checkedAt = now();
    const messages = new Map<string, Record<string, unknown>>();
    const cursors = new Set<string>();
    let cursor = "";
    let expectedReplies: unknown;
    let complete = false;
    for (let page = 0; page < 20; page++) {
      const body = await this.get("conversations.replies", { channel: target.channel_id, ts: target.message_ts, limit: 15, cursor });
      if (body === null) return threadSnapshot.parse({ native_id: nativeId(target), checked_at: checkedAt, unavailable: true, method: "slack_api" });
      const items = body.messages;
      if (!Array.isArray(items) || !items.length) throw new SlackReadError("Slack returned an incomplete thread");
      for (const message of items) {
        if (!message || typeof message !== "object" || typeof message.ts !== "string" || typeof message.text !== "string") {
          throw new SlackReadError("Slack message is incomplete");
        }
        const stamp = message.ts as string;
        if (stamp === target.message_ts) expectedReplies = message.reply_count;
        if (messages.has(stamp) || (message.thread_ts ?? target.message_ts) !== target.message_ts) {
          throw new SlackReadError("Slack pagination repeated or crossed threads");
        }
        const kept: Record<string, unknown> = {};
        for (const key of ["ts", "user", "bot_id", "text", "edited", "subtype"]) if (key in message) kept[key] = message[key];
        // Python truthiness: an empty list, empty string, 0 or null means no file references.
        if (message.files !== undefined && message.files !== null && message.files !== false && message.files !== 0 && message.files !== "" && !(Array.isArray(message.files) && message.files.length === 0)) {
          if (!Array.isArray(message.files) || !message.files.every((f: unknown) => f && typeof f === "object" && !Array.isArray(f))) {
            throw new SlackReadError("Slack file references are incomplete");
          }
          kept.files = message.files.map((f: Record<string, unknown>) =>
            Object.fromEntries(["id", "name", "mimetype", "permalink"].filter((k) => k in f).map((k) => [k, f[k]])),
          );
        }
        messages.set(stamp, kept);
      }
      const metadata = body.response_metadata ?? {};
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new SlackReadError("Slack pagination metadata is invalid");
      cursor = metadata.next_cursor ?? "";
      if (typeof cursor !== "string" || (body.has_more && !cursor) || cursors.has(cursor)) {
        throw new SlackReadError("Slack pagination is incomplete or cyclic");
      }
      if (!cursor) {
        complete = true;
        break;
      }
      cursors.add(cursor);
    }
    if (!complete) throw new SlackReadError("Slack thread exceeds the bounded pagination limit");
    if (!messages.has(target.message_ts)) throw new SlackReadError("Slack did not return the requested parent");
    if (!Number.isInteger(expectedReplies) || expectedReplies !== messages.size - 1) {
      throw new SlackReadError("Slack reply count changed or the thread is incomplete; retry");
    }
    const ordered = [...messages.keys()].sort().map((key) => messages.get(key));
    // json.dumps(sort_keys=True, ensure_ascii=False, compact separators); length in code points.
    const text = canonicalJson(ordered);
    if ([...text].length > 40000) throw new SlackReadError("Slack thread exceeds the source text limit");
    return threadSnapshot.parse({ native_id: nativeId(target), checked_at: checkedAt, text, method: "slack_api" });
  }
}


export const mcpCapture = z.strictObject({
  workspace: z.string(),
  team_id: z.string(),
  user_id: z.string(),
  channel_id: z.string(),
  message_ts: z.string(),
  checked_at: instant,
  messages: z.string().min(1).max(40000),
  pagination_info: z.string(),
});
export type McpCapture = z.infer<typeof mcpCapture>;

/** An owner-supplied receipt from an authorised MCP read, never a model output. */
export class CaptureReader implements ThreadReader {
  private readonly captures: Map<string, McpCapture>;

  constructor(captures: McpCapture[]) {
    this.captures = new Map(captures.map((c) => [`${c.channel_id}:${c.message_ts}`, c]));
    if (this.captures.size !== captures.length) throw new CrowboError("Duplicate MCP capture");
  }

  async authenticate(spec: SlackSpec): Promise<void> {
    const wanted = new Set(spec.targets.map(nativeId));
    if (wanted.size !== this.captures.size || ![...this.captures.keys()].every((k) => wanted.has(k))) {
      throw new CrowboError("Capture set does not match the configured threads");
    }
    for (const c of this.captures.values()) {
      if (c.workspace !== spec.workspace || c.team_id !== spec.team_id || c.user_id !== spec.user_id) {
        throw new CrowboError("Capture identity does not match the configured source");
      }
    }
  }

  async read(target: SlackTarget): Promise<ThreadSnapshot> {
    const capture = this.captures.get(nativeId(target))!;
    if (capture.pagination_info.trim() !== "There are no more messages in this thread.") {
      throw new SlackReadError("MCP capture does not confirm complete pagination");
    }
    const header = splitN(capture.messages, "\n", 5).slice(0, 5);
    if (!header.includes("=== THREAD PARENT MESSAGE ===") || !header.includes(`Message TS: ${target.message_ts}`)) {
      throw new SlackReadError("MCP capture does not identify the requested parent");
    }
    return threadSnapshot.parse({ native_id: nativeId(target), checked_at: capture.checked_at, text: capture.messages.trim(), method: "mcp_capture" });
  }
}

/** Python `str.split(sep, maxsplit)`. */
function splitN(value: string, separator: string, maxSplit: number): string[] {
  const parts = value.split(separator);
  return parts.length <= maxSplit + 1 ? parts : [...parts.slice(0, maxSplit), parts.slice(maxSplit).join(separator)];
}
