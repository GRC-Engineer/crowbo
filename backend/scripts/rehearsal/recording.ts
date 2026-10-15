import { slack } from "../../src/engine/connectors";
import { GRC_PROVIDERS, grcPlatformConnector } from "../../src/engine/grc-platform";
import { IDENTITY_PROVIDERS, identityConnector } from "../../src/engine/identity";
import type { Connector, FetchJson } from "../../src/engine/model";
import { TICKETS_PROVIDERS, ticketsConnector } from "../../src/engine/tickets";
import { trackReads } from "./reads";

/**
 * A recording: what one connector read from one provider's real API, keyed by the path the connector
 * asked for, with the next-page path a Link header named. Recordings are scrubbed before they are
 * written (scrub.ts) and live in test/fixtures/recorded/<provider>.json; the P2 criterion replays them.
 */
export interface Recording {
  connector: string;
  provider: string;
  recorded_at: string;
  responses: Record<string, unknown>;
  /** The next page a Link header pointed to, as a path; absent or null when there was none. */
  links?: Record<string, string | null>;
}

/** The connector for a connector class and provider, as the engine would build it. */
export function connectorFor(connector: string, provider: string): Connector | null {
  if (connector === "identity" && provider in IDENTITY_PROVIDERS) return identityConnector(IDENTITY_PROVIDERS[provider as keyof typeof IDENTITY_PROVIDERS]);
  if (connector === "tickets" && provider in TICKETS_PROVIDERS) return ticketsConnector(TICKETS_PROVIDERS[provider as keyof typeof TICKETS_PROVIDERS]);
  if (connector === "grc-platform" && provider in GRC_PROVIDERS) return grcPlatformConnector(GRC_PROVIDERS[provider as keyof typeof GRC_PROVIDERS]);
  if (connector === "slack" && provider === "slack") return slack;
  return null;
}

/** The connector class each recordable provider feeds. */
export const PROVIDER_CONNECTOR: Record<string, string> = {
  okta: "identity", "google-workspace": "identity", linear: "tickets", jira: "tickets", slack: "slack",
};

/** An API that answers from a recording: a path not recorded reads as missing. */
export function recordedApi(r: Pick<Recording, "responses" | "links">): FetchJson {
  const has = (path: string) => Object.hasOwn(r.responses, path);
  const api: FetchJson = async (path) => (has(path) ? r.responses[path] : null);
  api.page = async (path) => (has(path) ? { body: r.responses[path], next: r.links?.[path] ?? null } : null);
  return api;
}

/**
 * Wrap a live API so every response the connector reads is kept, keyed by the path it asked for,
 * with the fields it read from each (reads.ts).
 */
export function recordingOf(live: FetchJson): { api: FetchJson; responses: Record<string, unknown>; links: Record<string, string | null>; reads: Record<string, Set<string>> } {
  const responses: Record<string, unknown> = {};
  const links: Record<string, string | null> = {};
  const reads: Record<string, Set<string>> = {};
  const keep = (path: string, body: unknown) => {
    responses[path] = body;
    reads[path] ??= new Set();
    return trackReads(body, reads[path]);
  };
  const api: FetchJson = async (path) => {
    const body = await live(path);
    return body === null ? null : keep(path, body);
  };
  if (live.page) {
    const page = live.page;
    api.page = async (path) => {
      const r = await page(path);
      if (!r) return null;
      links[path] = r.next;
      return { body: keep(path, r.body), next: r.next };
    };
  }
  return { api, responses, links, reads };
}
