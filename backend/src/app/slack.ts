import { EngineError } from "../engine/errors";
import type { EngineInvoke } from "../engine/tools";
import { fixedHostFetch } from "../providers/http";
import { type SlackDeps, type SlackWorkspace, slackWorkspaces } from "../surfaces/slack-events";
import type { Env } from "./env";

/**
 * Wires the Slack surface to the Worker: only where synthetic data is allowed (staging) and only when
 * the signing secret, bot token and workspace registry are all set. Each registered workspace has its
 * own engine copy, keyed like a person's (tenant::engine::reader), so workspaces never share state.
 * Slack is reached only at slack.com (posting) and files.slack.com (an export's text files).
 */

type EngineCall = (actor: string, op: string, args: unknown) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;

export interface SlackConfig {
  signingSecret: string;
  botToken: string;
  workspaces: Record<string, SlackWorkspace>;
}

/** The Slack configuration, or null when the surface is off here. An invalid registry is an error, not "off". */
export function slackConfig(env: Env): SlackConfig | null {
  if (env.ALLOW_SYNTHETIC_GATES !== "true" || !env.SLACK_SIGNING_SECRET || !env.SLACK_BOT_TOKEN || !env.SLACK_WORKSPACES) return null;
  return { signingSecret: env.SLACK_SIGNING_SECRET, botToken: env.SLACK_BOT_TOKEN, workspaces: slackWorkspaces.parse(JSON.parse(env.SLACK_WORKSPACES)) };
}

/** An engine operation through the workspace's Durable Object; a refusal there is a refusal here. */
const invoker = (call: EngineCall, actor: string): EngineInvoke => async (op, args) => {
  const r = await call(actor, op, args);
  if (!r.ok) throw new EngineError(r.error);
  return r.result;
};

export function slackPoster(botToken: string, http = fixedHostFetch("slack.com", 1_000_000)): SlackDeps["post"] {
  return async (message) => {
    const res = await http("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { authorization: `Bearer ${botToken}`, "content-type": "application/json; charset=utf-8" },
      // Plain text with mrkdwn; links and mentions are already escaped by the surface.
      body: JSON.stringify({ ...message, unfurl_links: false, unfurl_media: false }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!body?.ok) throw new Error(`Slack refused the post: ${body?.error ?? res.status}`);
  };
}

/** chat.getPermalink: the message's link as Slack states it, or null. */
export function slackPermalink(botToken: string, http = fixedHostFetch("slack.com", 100_000)): NonNullable<SlackDeps["permalink"]> {
  return async (channel, ts) => {
    const url = `https://slack.com/api/chat.getPermalink?channel=${encodeURIComponent(channel)}&message_ts=${encodeURIComponent(ts)}`;
    const res = await http(url, { headers: { authorization: `Bearer ${botToken}` } }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { ok?: boolean; permalink?: string } | null;
    return body?.ok && typeof body.permalink === "string" ? body.permalink : null;
  };
}

export function slackDeps(config: SlackConfig, engineFor: (key: string) => EngineCall, defer?: SlackDeps["defer"]): SlackDeps {
  const files = fixedHostFetch("files.slack.com", 300_000);
  return {
    signingSecret: config.signingSecret,
    now: () => Date.now(),
    workspace(team) {
      const ws = config.workspaces[team];
      if (!ws) return null;
      const call = engineFor(`${ws.tenant}::engine::${ws.reader}`);
      return { channel: ws.channel, synthetic: ws.synthetic, invoke: (actor) => invoker(call, actor) };
    },
    post: slackPoster(config.botToken),
    permalink: slackPermalink(config.botToken),
    async download(url) {
      const res = await files(url, { headers: { authorization: `Bearer ${config.botToken}` } }).catch(() => null);
      return res?.ok ? res.text() : null;
    },
    ...(defer ? { defer } : {}),
  };
}

/** Every registered workspace's engine for the weekly post, acting as the scheduler. */
export function weeklyTargets(config: SlackConfig, engineFor: (key: string) => EngineCall) {
  return Object.values(config.workspaces).map((ws) => ({ channel: ws.channel, invoke: invoker(engineFor(`${ws.tenant}::engine::${ws.reader}`), "slack-weekly") }));
}
