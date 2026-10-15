import { describe, expect, it } from "vitest";
import { slackConfig, slackPoster } from "../../src/app/slack";
import type { Env } from "../../src/app/env";
import { demoOptions, startDemo } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_KB_EXPORT } from "../../src/engine/kb-fixture";
import { runEngine } from "../../src/engine/port";
import type { EngineInvoke } from "../../src/engine/tools";
import { handleSlackEvent, type Post, postWeekly, type SlackDeps, verifySlack } from "../../src/surfaces/slack-events";

const SECRET = "test-signing-secret";
const NOW = 1_791_468_000;
const TEAM = "T0NORTHWND";
const CHANNEL = "C0GRCTEAM1";

async function sign(body: string, ts = String(NOW), secret = SECRET) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`));
  return `v0=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function request(payload: unknown, opts: { ts?: string; secret?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const body = opts.raw ?? JSON.stringify(payload);
  const ts = opts.ts ?? String(NOW);
  return new Request("https://crowbo.example/slack/events", {
    method: "POST", body,
    headers: { "x-slack-request-timestamp": ts, "x-slack-signature": await sign(body, ts, opts.secret), ...opts.headers },
  });
}

const mention = (event: Record<string, unknown> = {}) => ({
  type: "event_callback", team_id: TEAM,
  event: { type: "app_mention", user: "U0ALEX0001", channel: CHANNEL, ts: "1791468000.000200", thread_ts: "1791468000.000100", text: "<@U0CROWBO> Who should still have billing admin?", ...event },
});

/** Deps over one in-process engine, recording every post and download. */
async function setup(opts: { synthetic?: boolean; engine?: Engine; invoke?: EngineInvoke } = {}) {
  const engine = opts.engine ?? (await startDemo()).engine;
  const posts: Post[] = [];
  const downloads: string[] = [];
  const deps: SlackDeps = {
    signingSecret: SECRET,
    now: () => NOW * 1000,
    workspace: (team) => (team === TEAM ? { channel: CHANNEL, synthetic: opts.synthetic ?? true, invoke: (actor) => opts.invoke ?? ((op, args) => runEngine(engine, actor, op, args)) } : null),
    post: async (m) => void posts.push(m),
    download: async (url) => {
      downloads.push(url);
      return NORTHWIND_KB_EXPORT.find((f) => url.endsWith(f.path))?.content ?? null;
    },
  };
  return { engine, posts, downloads, deps };
}

describe("Slack events: nothing is read before it is verified", () => {
  it("accepts Slack's signature over the raw body, and refuses a wrong secret, a stale timestamp or a missing signature", async () => {
    const body = new TextEncoder().encode("{}");
    expect(await verifySlack(SECRET, String(NOW), await sign("{}"), body, NOW * 1000)).toBeNull();
    expect(await verifySlack(SECRET, String(NOW), await sign("{}", String(NOW), "other"), body, NOW * 1000)).toBe("bad signature");
    expect(await verifySlack(SECRET, String(NOW - 301), await sign("{}", String(NOW - 301)), body, NOW * 1000)).toBe("stale timestamp");
    expect(await verifySlack(SECRET, String(NOW), null, body, NOW * 1000)).toBe("missing signature");
  });

  it("an unsigned or forged event gets 401 and no reply; an oversized one gets 413", async () => {
    const { posts, deps } = await setup();
    expect((await handleSlackEvent(await request(mention(), { secret: "forged" }), deps)).status).toBe(401);
    const unsigned = new Request("https://crowbo.example/slack/events", { method: "POST", body: JSON.stringify(mention()) });
    expect((await handleSlackEvent(unsigned, deps)).status).toBe(401);
    expect((await handleSlackEvent(await request(null, { raw: "x".repeat(70_000) }), deps)).status).toBe(413);
    // No Content-Length: a streamed body is cut off at the cap, not read whole.
    let pulled = 0;
    const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(16_000)); } });
    const chunked = new Request("https://crowbo.example/slack/events", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect((await handleSlackEvent(chunked, deps)).status).toBe(413);
    expect(pulled).toBeLessThan(10);
    expect(posts).toEqual([]);
  });

  it("answers Slack's URL verification only when signed", async () => {
    const { deps } = await setup();
    const ok = await handleSlackEvent(await request({ type: "url_verification", challenge: "abc" }), deps);
    expect(await ok.json()).toEqual({ challenge: "abc" });
    expect((await handleSlackEvent(await request({ type: "url_verification", challenge: "abc" }, { secret: "forged" }), deps)).status).toBe(401);
  });
});

describe("Slack events: a mention is answered once, in its thread", () => {
  it("replies in the thread the mention was in, with the card", async () => {
    const { posts, deps, engine } = await setup();
    expect((await handleSlackEvent(await request(mention()), deps)).status).toBe(200);
    expect(posts.map((p) => [p.channel, p.thread_ts])).toEqual([[CHANNEL, "1791468000.000100"]]);
    expect(posts[0].text).toContain("Decides: Priya");
    expect(posts[0].text).toContain(`_Result ${engine.nextMoves().id}.`);
  });

  it("a mention outside a thread starts one on the mention itself", async () => {
    const { posts, deps } = await setup();
    await handleSlackEvent(await request(mention({ thread_ts: undefined })), deps);
    expect(posts[0].thread_ts).toBe("1791468000.000200");
  });

  it("ignores Slack's retries, bot messages and workspaces that are not registered", async () => {
    const { posts, deps } = await setup();
    await handleSlackEvent(await request(mention(), { headers: { "x-slack-retry-num": "1" } }), deps);
    await handleSlackEvent(await request(mention({ bot_id: "B0CROWBO01" })), deps);
    await handleSlackEvent(await request({ ...mention(), team_id: "T0OTHERTEAM" }), deps);
    expect(posts).toEqual([]);
  });

  it("with defer, acknowledges first and posts when the work finishes", async () => {
    const { posts, deps } = await setup();
    let pending: Promise<unknown> | null = null;
    const res = await handleSlackEvent(await request(mention()), { ...deps, defer: (w) => void (pending = w) });
    expect(res.status).toBe(200);
    await pending;
    expect(posts).toHaveLength(1);
  });

  it("a reply Slack refuses is logged, not thrown", async () => {
    const { deps } = await setup();
    const res = await handleSlackEvent(await request(mention()), { ...deps, post: async () => { throw new Error("Slack refused the post: invalid_auth"); } });
    expect(res.status).toBe(200);
  });

  it("a fault inside the engine is replied to plainly, without its details", async () => {
    const { posts, deps } = await setup({ invoke: async () => { throw new Error("SQLITE_BUSY at /internal/path"); } });
    await handleSlackEvent(await request(mention()), deps);
    expect(posts.map((p) => p.text)).toEqual(["Crowbo could not complete this. Nothing was changed."]);
  });
});

describe("Slack events: an export by direct message", () => {
  const dm = (files: { name: string; size: number }[]) => ({
    type: "event_callback", team_id: TEAM,
    event: { type: "message", channel_type: "im", subtype: "file_share", user: "U0ALEX0001", channel: "D0ALEX0001", ts: "1791468000.000300",
      files: files.map((f) => ({ ...f, url_private_download: `https://files.slack.com/files-pri/T0/${f.name}`, created: NOW - 86_400 })) },
  });

  it("in a workspace registered as synthetic, downloads the text files and replies with the first profile", async () => {
    const engine = await Engine.start(structuredClone(NORTHWIND), { ...demoOptions(), connectors: [] });
    const { posts, downloads, deps } = await setup({ engine });
    const files = NORTHWIND_KB_EXPORT.map((f) => ({ name: f.path, size: f.content.length }));
    await handleSlackEvent(await request(dm(files)), deps);
    expect(downloads.map((d) => d.split("/").at(-1))).toEqual(["systems.csv", "controls.csv", "risk-register.csv", "vendors.csv", "access-control.md", "soc2-2025-report.md"]);
    expect(posts[0].text).toContain("*First profile from your export*");
    expect(engine.memory.list("import")[0].body.declared).toBe("synthetic");
  });

  it("in a workspace not registered as synthetic, imports nothing and says why", async () => {
    const { posts, downloads, deps, engine } = await setup({ synthetic: false });
    const before = engine.memory.list().length;
    await handleSlackEvent(await request(dm([{ name: "policies/access-control.md", size: 100 }])), deps);
    expect(downloads).toEqual([]);
    expect(engine.memory.list().length).toBe(before);
    expect(posts[0].text).toMatch(/not registered for synthetic exports/);
  });
});

describe("Slack: the weekly post and the Worker wiring", () => {
  it("posts the brief to each workspace's channel, not in a thread; one failure does not stop the others", async () => {
    const engine = (await startDemo()).engine;
    const posts: Post[] = [];
    const ok: EngineInvoke = (op, args) => runEngine(engine, "slack-weekly", op, args);
    const broken: EngineInvoke = async () => { throw new Error("down"); };
    const r = await postWeekly([{ channel: "C0BROKEN01", invoke: broken }, { channel: CHANNEL, invoke: ok }], async (m) => void posts.push(m));
    expect(r).toEqual({ posted: 1, failed: 1 });
    expect(posts).toEqual([{ channel: CHANNEL, text: expect.stringMatching(/^\*Security brief, week of 13 Oct\*/) }]);
  });

  it("is off unless synthetic data is allowed and every Slack secret is set; a bad registry is an error", () => {
    const base = { ALLOW_SYNTHETIC_GATES: "true", SLACK_SIGNING_SECRET: "s", SLACK_BOT_TOKEN: "xoxb-1", SLACK_WORKSPACES: JSON.stringify({ [TEAM]: { tenant: "demo", reader: "slack-northwind", channel: CHANNEL, synthetic: true } }) } as unknown as Env;
    expect(slackConfig(base)?.workspaces[TEAM].reader).toBe("slack-northwind");
    expect(slackConfig({ ...base, ALLOW_SYNTHETIC_GATES: "false" })).toBeNull();
    expect(slackConfig({ ...base, SLACK_BOT_TOKEN: undefined })).toBeNull();
    expect(() => slackConfig({ ...base, SLACK_WORKSPACES: JSON.stringify({ [TEAM]: { tenant: "demo" } }) })).toThrow();
  });

  it("posts only to slack.com, with the bot token, links not unfurled", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const post = slackPoster("xoxb-test", async (url, init) => (seen.push({ url, init }), Response.json({ ok: true })));
    await post({ channel: CHANNEL, thread_ts: "1.2", text: "hi" });
    expect(seen[0].url).toBe("https://slack.com/api/chat.postMessage");
    expect((seen[0].init!.headers as Record<string, string>).authorization).toBe("Bearer xoxb-test");
    expect(JSON.parse(seen[0].init!.body as string)).toEqual({ channel: CHANNEL, thread_ts: "1.2", text: "hi", unfurl_links: false, unfurl_media: false });
    const refused = slackPoster("xoxb-test", async () => Response.json({ ok: false, error: "channel_not_found" }));
    await expect(refused({ channel: CHANNEL, text: "x" })).rejects.toThrow(/channel_not_found/);
  });
});
