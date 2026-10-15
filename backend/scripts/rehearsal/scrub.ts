import type { Recording } from "./recording";
import { ROSTER, SEED_MARK } from "./roster";

/**
 * Scrubbing a recording before it is written to the public repository. It fails closed: a value stays
 * only if it is on the allowlist below (Northwind's synthetic names and emails, timestamps, issue keys,
 * status words, counts, the connector's own path words); every other value becomes a stable
 * pseudonym, the same in the response bodies and in the paths they are keyed by, so the joins a
 * connector makes (a group's id in its members' path) still hold. findLeaks checks the same allowlist:
 * a scrubbed recording passes; anything it does not recognise is a leak. The recorder first cuts each
 * response down to the fields the connector read (reads.ts), so little is left to scrub.
 */

export const SCRUBBED_DOMAIN = "northwind.example";

/** Keys whose values are a person's name, an account or object id, or a paging cursor: pseudonymised by kind. */
const NAME_KEYS = new Set(["displayName", "firstName", "lastName", "fullName", "givenName", "familyName", "real_name", "name_full"]);
const CURSOR_KEYS = new Set(["nextPageToken", "endCursor", "startCursor", "cursor", "next_cursor", "nextPage", "after", "pageToken"]);
const ID_KEY = /^(id|slugId|user|team|channel|accountId|customerId)$|(Id|_id)$/;
/** Keys whose values are a provider's status words. */
const ENUM_KEYS = new Set(["status", "type", "key", "state", "role", "signOnMode"]);
const RESOLUTIONS = new Set(["Done", "Won't Do", "Cancelled", "Canceled", "Declined", "Duplicate", "Fixed"]);

/** Strings Northwind's roster and the connectors' own requests use: safe anywhere. */
const ROSTER_STRINGS = new Set<string>([
  ...ROSTER.people, ...ROSTER.groups.flatMap((g) => [g.name, g.app]), ...ROSTER.apps.map((a) => a.label),
  ...ROSTER.launches.flatMap((l) => [l.key, l.name, ...l.issues.flatMap((i) => [i.key, i.title, ...i.labels, `${SEED_MARK}-${i.key}`, `[${SEED_MARK}:${i.key}] ${i.title}`])]),
  ...ROSTER.slack, SEED_MARK, "C0GRC", "NW", "my_customer",
]);

const PSEUDONYM = /^(id|cursor|value)-\d+$|^Person \d+$|^person-\d+@northwind\.example$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const ISSUE_KEY = /^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/;
const SLACK_TS = /^\d{9,11}\.\d{6}$/;
/** A path word: letters, dots and underscores, as in /api/v1/groups or conversations.history. */
const PATH_WORD = /^([A-Za-z_.]+|v\d{1,2}|\d{1,4})$/;
/** A query value the connectors build themselves: jql, fields lists, Okta's status filter. */
const QUERY_TEXT = /^[A-Za-z_ =",.()-]+$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
/** Token and credential shapes, redacted wherever they appear even inside an allowed value. */
const TOKEN_SHAPES = [/xox[abposre]-[A-Za-z0-9-]{6,}/g, /xapp-[A-Za-z0-9-]{6,}/g, /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, /ya29\.[A-Za-z0-9_-]{10,}/g, /lin_(?:api|oauth)_[A-Za-z0-9]{10,}/g, /ATATT[A-Za-z0-9_=-]{10,}/g, /gh[pousr]_[A-Za-z0-9]{20,}/g];

/** Whether a leaf value may stay as it is, given the key it sits under. */
function safe(value: string, key: string | null): boolean {
  if (PSEUDONYM.test(value) || ROSTER_STRINGS.has(value) || ISO_TIME.test(value) || ISSUE_KEY.test(value)) return true;
  if (EMAIL.test(value)) return value.toLowerCase().endsWith(`@${SCRUBBED_DOMAIN}`) && ROSTER_STRINGS.has(value.split("@")[0].toLowerCase());
  if (key && ENUM_KEYS.has(key)) return /^[A-Za-z][A-Za-z_-]{1,31}$/.test(value);
  if (key === "name" && RESOLUTIONS.has(value)) return true;
  if (key === "ts") return SLACK_TS.test(value);
  return false;
}

/** Whether a path segment, query name or query value may stay as it is. */
const safeInPath = (part: string) => PSEUDONYM.test(part) || ROSTER_STRINGS.has(part) || PATH_WORD.test(part) || QUERY_TEXT.test(part);

function mapLeaves(value: unknown, f: (v: string | number, key: string | null) => unknown, key: string | null = null): unknown {
  if (typeof value === "string" || typeof value === "number") return f(value, key);
  if (Array.isArray(value)) return value.map((v) => mapLeaves(v, f, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapLeaves(v, f, k)]));
  return value;
}

const decode = (raw: string) => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
};

/**
 * Rewrite a path part by part: each segment, query name and query value is decoded, passed to f, and
 * re-encoded only if f changed it, so the untouched parts keep their exact bytes and the replay finds
 * the path the connector will ask for. f also learns which query name a value belongs to.
 */
function eachPart(path: string, f: (part: string, name: string | null) => string): string {
  const [pathname, query] = path.split(/\?(.*)/s, 2);
  const keep = (raw: string, name: string | null) => {
    const plain = decode(raw);
    const next = f(plain, name);
    return next === plain ? raw : encodeURIComponent(next);
  };
  const segs = pathname.split("/").map((seg) => (seg ? keep(seg, "") : seg)).join("/");
  if (query === undefined) return segs;
  const q = query.split("&").map((pair) => {
    const [k, v] = pair.split(/=(.*)/s, 2);
    const name = decode(k);
    return v === undefined ? keep(k, null) : `${keep(k, null)}=${keep(v, name)}`;
  });
  return `${segs}?${q.join("&")}`;
}

export function scrub(r: Recording): Recording {
  const map = new Map<string, string>();
  const n = { id: 0, cursor: 0, value: 0, person: 0, name: 0 };
  const alias = (original: string, key: string | null): string => {
    const known = map.get(original);
    if (known) return known;
    // The recorder has already refused any email outside the sandbox's domains: a roster name there is Northwind's.
    const local = original.split("@")[0].toLowerCase();
    const made = EMAIL.test(original) ? (ROSTER_STRINGS.has(local) ? `${local}@${SCRUBBED_DOMAIN}` : `person-${++n.person}@${SCRUBBED_DOMAIN}`)
      : key && NAME_KEYS.has(key) ? `Person ${++n.name}`
      : key && CURSOR_KEYS.has(key) ? `cursor-${++n.cursor}`
      : key && ID_KEY.test(key) ? `id-${++n.id}`
      : `value-${++n.value}`;
    map.set(original, made);
    return made;
  };
  const leaf = (v: string | number, key: string | null): unknown => {
    if (typeof v === "number") return key && ID_KEY.test(key) ? alias(String(v), key) : v;
    let s = v;
    for (const shape of TOKEN_SHAPES) s = s.replace(shape, "[redacted]");
    // An id key is always pseudonymised, even when its value happens to look like a roster word.
    return key && (ID_KEY.test(key) || CURSOR_KEYS.has(key)) ? alias(s, key) : safe(s, key) ? s : alias(s, key);
  };
  // Bodies first, so an id met in a body keeps its id- pseudonym when it reappears in a path.
  const bodies = Object.entries(r.responses).map(([path, body]) => [path, mapLeaves(body, leaf)] as const);
  // In a path, a part met in a body keeps that pseudonym; an unknown segment is an id, an unknown query value a cursor or an id.
  const path = (p: string) => eachPart(p, (part, name) => (map.has(part) ? map.get(part)! : safeInPath(part) ? part : alias(part, name && CURSOR_KEYS.has(name) ? name : "id")));
  return {
    connector: r.connector,
    provider: r.provider,
    recorded_at: r.recorded_at,
    responses: Object.fromEntries(bodies.map(([p, body]) => [path(p), body])),
    ...(r.links ? { links: Object.fromEntries(Object.entries(r.links).map(([p, next]) => [path(p), next === null ? null : path(next)])) } : {}),
  };
}

/**
 * What in a recording is not on the allowlist: anything that could identify a real account or
 * authenticate to one. A scrubbed recording has none. Each finding names where, never the value.
 */
export function findLeaks(r: Recording): string[] {
  const out = new Set<string>();
  const walk = (value: unknown, where: string, key: string | null) => {
    if (typeof value === "string") {
      if (!safe(value, key)) out.add(`${where}: unrecognised value`);
    } else if (typeof value === "number") {
      if (key && ID_KEY.test(key)) out.add(`${where}: numeric identifier`);
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, `${where}[]`, key));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (!/^[A-Za-z_]+$/.test(k)) out.add(`${where}: unrecognised key`);
        walk(v, `${where}.${/^[A-Za-z_]+$/.test(k) ? k : "?"}`, k);
      }
    }
  };
  const checkPath = (p: string, where: string) => eachPart(p, (part) => {
    if (!safeInPath(part)) out.add(`${where}: unrecognised path part`);
    return part;
  });
  for (const [p, body] of Object.entries(r.responses)) {
    checkPath(p, "a response path");
    walk(body, "a response", null);
  }
  for (const next of Object.values(r.links ?? {})) if (next) checkPath(next, "a next link");
  return [...out];
}
