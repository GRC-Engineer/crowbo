import { z } from "zod";
import { KB_LIMITS, type KbFile } from "../engine/kb";
import type { EngineInvoke } from "../engine/tools";
import { handleExport, handleMention, type SlackMessage, weeklyPost } from "./slack";

/**
 * Delivers the Slack surface to a workspace. Slack's Events API posts here; every request is
 * checked before anything reads it: a bounded body, then Slack's signature over the raw bytes with a
 * five-minute replay window, then JSON. Only then is the event routed:
 *  - app_mention: one reply, in the thread it came from.
 *  - a direct message with files: the export is imported only if the workspace is registered as
 *    synthetic; the declaration comes from that registration, never from the message.
 *  - anything else, bot messages and Slack's retries: acknowledged and ignored.
 * The weekly brief goes to each workspace's one configured channel, on the schedule (WEEKLY_CRON).
 * Mention text is only ever a question: it is routed, never executed, and escaped in the reply.
 */

export const WEEKLY_CRON = "0 8 * * 1";
const MAX_BODY = 64_000;
const REPLAY_SECONDS = 300;

/** One registered workspace: which engine answers it, where the weekly list goes, and whether its exports are synthetic. */
export const slackWorkspace = z.strictObject({
  tenant: z.string().min(1).max(100),
  reader: z.string().min(1).max(100),
  channel: z.string().regex(/^[CG][A-Z0-9]{8,32}$/),
  synthetic: z.boolean(),
});
export type SlackWorkspace = z.infer<typeof slackWorkspace>;
export const slackWorkspaces = z.record(z.string().regex(/^T[A-Z0-9]{8,32}$/), slackWorkspace);

export interface Post {
  channel: string;
  /** Absent only for the scheduled weekly post. */
  thread_ts?: string;
  text: string;
}

export interface SlackDeps {
  signingSecret: string;
  now: () => number;
  /** The registered workspace for a team, with an engine invoker acting as the Slack user; null when not registered. */
  workspace(team: string): (Pick<SlackWorkspace, "channel" | "synthetic"> & { invoke(actor: string): EngineInvoke }) | null;
  post(message: Post): Promise<void>;
  /** Fetch a file's text from Slack; null when it cannot be read. */
  download?(url: string): Promise<string | null>;
  /** Run the work after acknowledging, so Slack gets its answer within three seconds. Absent: run inline. */
  defer?(work: Promise<unknown>): void;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => Number.parseInt(h, 16)));

/** Why a request is not from Slack, or null when its signature and timestamp check out. */
export async function verifySlack(secret: string, timestamp: string | null, signature: string | null, body: Uint8Array, nowMs: number): Promise<string | null> {
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return "missing timestamp";
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > REPLAY_SECONDS) return "stale timestamp";
  const m = /^v0=([a-f0-9]{64})$/.exec(signature ?? "");
  if (!m) return "missing signature";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const base = new Uint8Array([...new TextEncoder().encode(`v0:${timestamp}:`), ...body]);
  // crypto.subtle.verify compares in constant time.
  return (await crypto.subtle.verify("HMAC", key, unhex(m[1]), base)) ? null : "bad signature";
}

async function boundedBody(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return null;
  const body = new Uint8Array(await request.arrayBuffer());
  return body.byteLength > MAX_BODY ? null : body;
}

const event = z.object({
  type: z.string(),
  user: z.string().optional(),
  bot_id: z.string().optional(),
  subtype: z.string().optional(),
  channel: z.string().optional(),
  channel_type: z.string().optional(),
  text: z.string().max(4000).optional(),
  ts: z.string().optional(),
  thread_ts: z.string().optional(),
  files: z.array(z.object({ name: z.string().max(300), size: z.number(), url_private_download: z.string().optional(), created: z.number().optional() })).max(KB_LIMITS.files).optional(),
});
const envelope = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url_verification"), challenge: z.string().max(200) }),
  z.object({ type: z.literal("event_callback"), team_id: z.string(), event }),
]);

const TEXT = /\.(md|markdown|txt|csv)$/i;
const FAULT = "Crowbo could not complete this. Nothing was changed.";

/** Read the files of a direct message as an export: text files by download, others listed so the profile says they were not read. */
async function exportFiles(files: z.infer<typeof event>["files"], deps: SlackDeps): Promise<KbFile[]> {
  const out: KbFile[] = [];
  for (const f of files ?? []) {
    const readable = TEXT.test(f.name) && f.size <= KB_LIMITS.file_chars && f.url_private_download && deps.download;
    const content = readable ? ((await deps.download!(f.url_private_download!)) ?? "") : "";
    const created = f.created ? new Date(f.created * 1000).toISOString().slice(0, 10) : undefined;
    out.push({ path: f.name, content, ...(created ? { modified_at: created } : {}) });
  }
  return out;
}

export async function handleSlackEvent(request: Request, deps: SlackDeps): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await boundedBody(request);
  if (!body) return new Response("Too large", { status: 413 });
  const problem = await verifySlack(deps.signingSecret, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"), body, deps.now());
  if (problem) return new Response("Unauthorized", { status: 401 });

  let parsed: z.infer<typeof envelope>;
  try {
    parsed = envelope.parse(JSON.parse(new TextDecoder().decode(body)));
  } catch {
    return new Response("OK", { status: 200 }); // a signed payload we do not handle is acknowledged, not answered
  }
  if (parsed.type === "url_verification") return Response.json({ challenge: parsed.challenge });
  // Slack retries when a reply is slow; the first delivery already has the work, so a retry is ignored.
  if (request.headers.get("x-slack-retry-num")) return new Response("OK", { status: 200 });

  const e = parsed.event;
  const ws = deps.workspace(parsed.team_id);
  if (!ws || e.bot_id || !e.user || !e.channel || !e.ts) return new Response("OK", { status: 200 });
  const invoke = ws.invoke(`slack:${e.user}`);
  const thread_ts = e.thread_ts ?? e.ts;

  let work: (() => Promise<SlackMessage>) | null = null;
  if (e.type === "app_mention") work = () => handleMention(invoke, { text: e.text ?? "", thread: thread_ts });
  else if (e.type === "message" && e.channel_type === "im" && e.files?.length && (!e.subtype || e.subtype === "file_share")) {
    work = ws.synthetic
      ? async () => handleExport(invoke, await exportFiles(e.files, deps), { synthetic: true })
      : async () => ({ text: "This workspace is not registered for synthetic exports. Real exports wait until the founders clear them." });
  }
  if (!work) return new Response("OK", { status: 200 });

  const run = work()
    .then(
      (m) => deps.post({ channel: e.channel!, thread_ts, text: m.text }),
      () => deps.post({ channel: e.channel!, thread_ts, text: FAULT }),
    )
    // Slack refused the reply itself (a revoked token, a removed channel): logged, since there is no one to tell in Slack.
    .catch((error: unknown) => console.error(`Slack reply not delivered: ${error instanceof Error ? error.message : "unknown"}`));
  if (deps.defer) deps.defer(run);
  else await run;
  return new Response("OK", { status: 200 });
}

/** The scheduled weekly post: the brief to each registered workspace's channel, not in a thread. One failure does not stop the others. */
export async function postWeekly(workspaces: { channel: string; invoke: EngineInvoke }[], post: SlackDeps["post"]): Promise<{ posted: number; failed: number }> {
  let posted = 0;
  let failed = 0;
  for (const ws of workspaces) {
    try {
      await post({ channel: ws.channel, text: (await weeklyPost(ws.invoke)).text });
      posted++;
    } catch {
      failed++;
    }
  }
  return { posted, failed };
}
