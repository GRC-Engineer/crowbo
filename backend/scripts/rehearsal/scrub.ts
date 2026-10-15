import type { Recording } from "./recording";

/**
 * Scrubbing a recording before it is written to the public repository. Every account identifier,
 * paging cursor, person's name, email address, URL host and token-shaped string is replaced with a
 * stable pseudonym, applied the same way to the response bodies and to the paths they are keyed by,
 * so the joins a connector makes (a group's id in its members' path) still hold. findLeaks is the
 * check: a scrubbed recording must contain none of these. The synthetic Northwind people keep their
 * names at northwind.example; anyone else, such as the sandbox's admin, becomes person-<n>.
 */

export const SCRUBBED_DOMAIN = "northwind.example";
const SCRUBBED_ORIGIN = "https://example.invalid";

/** Keys whose values identify an account, a workspace or an object in the provider. */
const ID_KEYS = new Set(["id", "accountId", "customerId", "teamId", "team", "team_id", "user", "user_id", "bot_id", "app_id", "channel", "orgId", "etag", "cloudId", "realmId", "externalId"]);
/** Keys whose values are paging cursors, which can encode identifiers. */
const CURSOR_KEYS = new Set(["nextPageToken", "endCursor", "startCursor", "cursor", "next_cursor", "nextPage", "after"]);
/** Keys whose values are a person's name. */
const NAME_KEYS = new Set(["displayName", "firstName", "lastName", "fullName", "givenName", "familyName", "real_name", "nickName", "middleName", "honorificPrefix"]);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_ORIGIN = /https?:\/\/[A-Za-z0-9.-]+(?::\d+)?/g;
/** Token and credential shapes of the providers in the kit, and generic bearer material. */
const TOKEN_SHAPES: [string, RegExp][] = [
  ["slack token", /xox[abposre]-[A-Za-z0-9-]{6,}/],
  ["slack app token", /xapp-[A-Za-z0-9-]{6,}/],
  ["jwt", /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ["google token", /ya29\.[A-Za-z0-9_-]{10,}/],
  ["linear key", /lin_(?:api|oauth)_[A-Za-z0-9]{10,}/],
  ["atlassian token", /ATATT[A-Za-z0-9_=-]{10,}/],
  ["okta api token", /\b00[A-Za-z0-9_-]{40}\b/],
  ["github token", /gh[pousr]_[A-Za-z0-9]{20,}/],
  ["bearer", /\b(?:Bearer|SSWS|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/],
];
/** Slack mentions carry user ids inside message text. */
const MENTION = /<[@#!]([A-Z0-9]{6,})(?:\|[^>]*)?>/g;

type Walk = (value: string, key: string | null) => void;

function walk(value: unknown, visit: Walk, key: string | null = null) {
  if (typeof value === "string") visit(value, key);
  else if (Array.isArray(value)) for (const v of value) walk(v, visit, key);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, visit, k);
}

function mapStrings(value: unknown, f: (s: string) => string): unknown {
  if (typeof value === "string") return f(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, f)]));
  return value;
}

/** Scrub a recording; `people` are the synthetic local parts that may stay as they are. */
export function scrub(r: Recording, people: readonly string[]): Recording {
  const map = new Map<string, string>();
  const counters = { id: 0, cursor: 0, person: 0, name: 0 };
  const keep = new Set(people.map((p) => p.toLowerCase()));
  const alias = (original: string, make: () => string) => {
    if (original && !map.has(original)) map.set(original, make());
  };
  const email = (e: string) => {
    const local = e.split("@")[0].toLowerCase();
    alias(e, () => (keep.has(local) ? `${local}@${SCRUBBED_DOMAIN}` : `person-${++counters.person}@${SCRUBBED_DOMAIN}`));
  };
  const collect: Walk = (s, key) => {
    if (key && ID_KEYS.has(key)) alias(s, () => `id-${++counters.id}`);
    if (key && CURSOR_KEYS.has(key)) alias(s, () => `cursor-${++counters.cursor}`);
    if (key && NAME_KEYS.has(key)) alias(s, () => `Person ${++counters.name}`);
    for (const m of s.matchAll(EMAIL)) email(m[0]);
    for (const m of s.matchAll(MENTION)) alias(m[1], () => `id-${++counters.id}`);
  };
  for (const [path, body] of Object.entries(r.responses)) {
    walk(body, collect);
    // Cursors and ids also reach paths through query parameters a connector built from them.
    for (const [k, v] of new URL(path, SCRUBBED_ORIGIN).searchParams) if (CURSOR_KEYS.has(k) || k === "pageToken") alias(v, () => `cursor-${++counters.cursor}`);
  }
  for (const next of Object.values(r.links ?? {})) {
    if (next) for (const [k, v] of new URL(next, SCRUBBED_ORIGIN).searchParams) if (CURSOR_KEYS.has(k)) alias(v, () => `cursor-${++counters.cursor}`);
  }
  // Identifiers are replaced only as a whole value, a whole path segment or a whole query value, never
  // as a substring: a short numeric id must not rewrite a date or a count that happens to contain it.
  const decode = (part: string) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  };
  const inUrl = (s: string) => s.replace(/([/=?&])([^/=?&#]+)/g, (m, sep: string, part: string) => {
    const to = map.get(decode(part));
    return to ? sep + encodeURIComponent(to) : m;
  });
  const replace = (s: string) => {
    let out = map.get(s) ?? s;
    if (out.startsWith("/") || /^https?:\/\//.test(out)) out = inUrl(out);
    out = out.replace(EMAIL, (e) => map.get(e) ?? e).replace(MENTION, (m, id: string) => m.replace(id, map.get(id) ?? id));
    out = out.replace(URL_ORIGIN, SCRUBBED_ORIGIN);
    for (const [, shape] of TOKEN_SHAPES) out = out.replace(new RegExp(shape.source, "g"), "[redacted]");
    return out;
  };
  return {
    connector: r.connector,
    provider: r.provider,
    recorded_at: r.recorded_at,
    responses: Object.fromEntries(Object.entries(r.responses).map(([path, body]) => [replace(path), mapStrings(body, replace)])),
    ...(r.links ? { links: Object.fromEntries(Object.entries(r.links).map(([path, next]) => [replace(path), next === null ? null : replace(next)])) } : {}),
  };
}

/**
 * What in a recording could identify a real account or authenticate to one. A scrubbed recording has
 * none; each finding names its kind and where, never the value.
 */
export function findLeaks(r: Recording): string[] {
  const out: string[] = [];
  const check = (where: string) => (s: string, key: string | null) => {
    for (const [kind, shape] of TOKEN_SHAPES) if (shape.test(s)) out.push(`${where}: ${kind}`);
    for (const m of s.matchAll(EMAIL)) if (!m[0].toLowerCase().endsWith(`@${SCRUBBED_DOMAIN}`)) out.push(`${where}: email outside ${SCRUBBED_DOMAIN}`);
    for (const m of s.matchAll(URL_ORIGIN)) if (m[0] !== SCRUBBED_ORIGIN) out.push(`${where}: URL host`);
    for (const m of s.matchAll(MENTION)) if (!/^id-\d+$/.test(m[1])) out.push(`${where}: Slack mention id`);
    if (key && ID_KEYS.has(key) && !/^id-\d+$/.test(s)) out.push(`${where}.${key}: account identifier`);
    if (key && CURSOR_KEYS.has(key) && !/^cursor-\d+$/.test(s)) out.push(`${where}.${key}: paging cursor`);
    if (key && NAME_KEYS.has(key) && !/^Person \d+$/.test(s)) out.push(`${where}.${key}: person's name`);
  };
  for (const [path, body] of Object.entries(r.responses)) {
    check("path")(path, null);
    walk(body, check(path));
  }
  for (const [path, next] of Object.entries(r.links ?? {})) if (next) check(`link of ${path}`)(next, null);
  return [...new Set(out)];
}
