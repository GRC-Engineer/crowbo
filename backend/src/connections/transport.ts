import type { FetchJson } from "../engine/model";
import { nextPath } from "../engine/paging";
import { type FetchLike, fixedHostFetch } from "../providers/http";

/**
 * A connector's API over HTTP with one tenant's connection. Every request goes to the provider's one
 * host (pinned: no redirects, no other destination, capped bodies) with the connection's bearer token.
 * page() follows the Link header's rel="next" on the same host, so Link-paged lists (Okta) can be read
 * completely. A 401 or 403 fails closed: the connection is revoked, the page reads as missing, the
 * listing is partial and every scenario on it goes unresolved.
 */

export interface TransportDeps {
  host: string;
  /** A usable access token, or null when the connection cannot be used. */
  token: () => Promise<string | null>;
  revoke: (reason: string) => void;
  used: () => void;
  http?: FetchLike;
}

/** The URL of rel="next" in a Link header, or null when there is none. */
export function linkNext(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = /<([^>]{1,2000})>\s*;(.*)$/.exec(part.trim());
    if (m && /(?:^|;)\s*rel="?next"?\s*(?:;|$)/i.test(m[2])) return m[1];
  }
  return null;
}

export function connectionFetch(deps: TransportDeps): FetchJson {
  const http = deps.http ?? fixedHostFetch(deps.host, 8_000_000);
  async function request(path: string): Promise<{ body: unknown; link: string | null } | null> {
    if (!path.startsWith("/")) return null;
    const token = await deps.token();
    if (!token) return null;
    const res = await http(`https://${deps.host}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (res.status === 401 || res.status === 403) {
      deps.revoke(`the provider answered ${res.status}`);
      return null;
    }
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    if (body === null) return null;
    deps.used();
    return { body, link: res.headers.get("link") };
  }
  return Object.assign(async (path: string) => (await request(path))?.body ?? null, {
    page: async (path: string) => {
      const r = await request(path);
      if (!r) return null;
      const next = linkNext(r.link);
      if (next === null) return { body: r.body, next: null };
      // Only a next link on the same host is followed; anything else leaves the list incomplete.
      const sameHost = next.startsWith("/") || (() => {
        try {
          return new URL(next).host === deps.host;
        } catch {
          return false;
        }
      })();
      return { body: r.body, next: sameHost ? nextPath(next) ?? "" : "" };
    },
  });
}
