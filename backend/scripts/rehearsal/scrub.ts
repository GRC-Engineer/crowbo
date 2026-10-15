import { createHmac } from "node:crypto";
import type { Recording } from "./recording";
import { ROSTER, SEED_MARK } from "./roster";
import { type PathRule, type ProviderSchema, SCHEMAS, type ValueClass } from "./schema";

/**
 * Scrubbing a recording before it is written to the public repository, driven by the provider's
 * schema (schema.ts). Every field and every request path must be listed there; each value is kept
 * only as its class allows (a roster name, a listed status word, a timestamp, a count) and otherwise
 * replaced with a pseudonym. Identifiers and cursors are always replaced. Pseudonyms are an HMAC of the
 * value under a salt kept outside the repository, so the same account has the same pseudonym in every
 * recording and joins hold across them. Anything the schema does not list is refused, never kept.
 * findLeaks checks a recording against the same schema.
 */

export const SCRUBBED_DOMAIN = "northwind.example";

export class ScrubRefused extends Error {
  override name = "ScrubRefused";
}

/** Names Northwind's roster uses: groups, apps, labels, launches, issue titles, seed markers. */
const ROSTER_STRINGS = new Set<string>([
  ...ROSTER.groups.flatMap((g) => [g.name, g.app]), ...ROSTER.apps.map((a) => a.label),
  ...ROSTER.launches.flatMap((l) => [l.key, l.name, ...l.issues.flatMap((i) => [i.title, ...i.labels, `${SEED_MARK}-${i.key}`])]),
]);
const GROUP_LOCALS = new Set<string>(ROSTER.groups.map((g) => g.name));

const HASH = "[0-9a-f]{12}";
const SHAPES = {
  id: new RegExp(`^id-${HASH}$`),
  cursor: new RegExp(`^cursor-${HASH}$`),
  value: new RegExp(`^value-${HASH}$`),
  email: new RegExp(`^(person-${HASH}|${[...ROSTER.people, ...GROUP_LOCALS].join("|")})@northwind\\.example$`),
};
const ISO_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const SLACK_TS = /^\d{9,11}\.\d{6}$/;
const EMAIL = /^([^@\s]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/;

const schemaOf = (provider: string): ProviderSchema => {
  const s = SCHEMAS[provider];
  if (!s) throw new ScrubRefused(`No scrub schema for ${provider}`);
  return s;
};

/** Whether a leaf value is in the shape its class allows in a written recording. */
function kept(cls: ValueClass, v: unknown): boolean {
  if (v === null) return true;
  if (cls === "object") return typeof v === "object";
  if (typeof v === "string" && SHAPES.value.test(v)) return cls !== "id" && cls !== "cursor" && cls !== "email";
  if (cls === "id") return typeof v === "string" && SHAPES.id.test(v);
  if (cls === "cursor") return typeof v === "string" && SHAPES.cursor.test(v);
  if (cls === "email") return typeof v === "string" && SHAPES.email.test(v);
  if (cls === "time") return typeof v === "string" && ISO_TIME.test(v);
  if (cls === "bool") return typeof v === "boolean";
  if (cls === "count") return Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e6;
  if (cls === "roster") return typeof v === "string" && ROSTER_STRINGS.has(v);
  if (cls === "text") return typeof v === "string" && (ROSTER.slack as readonly string[]).includes(v);
  if (cls === "ts") return typeof v === "string" && SLACK_TS.test(v);
  return typeof v === "string" && cls.words.includes(v);
}

/** Split a path into its segments and query pairs, keeping each raw token. */
function parsePath(path: string) {
  const [pathname, query] = path.split(/\?(.*)/s, 2);
  const decode = (raw: string) => {
    try {
      return decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
      return raw;
    }
  };
  const pairs = query === undefined ? [] : query.split("&").map((pair) => {
    const [k, v = ""] = pair.split(/=(.*)/s, 2);
    return { name: decode(k), raw: v, value: decode(v) };
  });
  return { segments: pathname.split("/"), pairs, decode };
}

/** The rule a path matches, with its slot values, or null. */
function matchRule(rules: PathRule[], path: string) {
  const { segments, pairs, decode } = parsePath(path);
  for (const rule of rules) {
    const pattern = rule.path.split("/");
    if (pattern.length !== segments.length) continue;
    if (!pattern.every((p, i) => p === segments[i] || (/^\{\w+\}$/.test(p) && segments[i] !== ""))) continue;
    if (!pairs.every((q) => q.name in rule.query)) continue;
    return { rule, pattern, segments, pairs, decode };
  }
  return null;
}

export interface Scrubbed {
  recording: Recording;
  /** Each replaced value and its pseudonym, for checking the replay against the live read. */
  aliases: Map<string, string>;
}

export function scrub(r: Recording, salt: string): Scrubbed {
  if (salt.length < 32) throw new ScrubRefused("The pseudonym salt is missing or too short");
  const schema = schemaOf(r.provider);
  const aliases = new Map<string, string>();
  const pseudo = (kind: "id" | "cursor" | "value" | "person", v: string) => {
    const made = `${kind}-${createHmac("sha256", salt).update(`${kind}\0${v}`).digest("hex").slice(0, 12)}`;
    const out = kind === "person" ? `${made}@${SCRUBBED_DOMAIN}` : made;
    aliases.set(v, out);
    return out;
  };
  const leaf = (cls: ValueClass, v: unknown, where: string): unknown => {
    if (v === null) return null;
    if (cls === "object") throw new ScrubRefused(`${where} holds a ${typeof v} where the schema expects an object`);
    if (typeof v === "object") throw new ScrubRefused(`${where} holds an object where the schema expects a value`);
    const s = String(v);
    if (cls === "id") return pseudo("id", s);
    if (cls === "cursor") return pseudo("cursor", s);
    if (cls === "email") {
      const m = EMAIL.exec(s);
      const local = m?.[1].toLowerCase() ?? "";
      const synthetic = m && ((m[2].toLowerCase() === SCRUBBED_DOMAIN && (ROSTER.people as readonly string[]).includes(local)) || GROUP_LOCALS.has(local));
      if (!synthetic) return pseudo("person", s);
      const out = `${local}@${SCRUBBED_DOMAIN}`;
      if (out !== s) aliases.set(s, out);
      return out;
    }
    return kept(cls, v) ? v : pseudo("value", s);
  };
  const walk = (value: unknown, at: string): unknown => {
    // A null carries nothing: kept wherever it appears.
    if (value === null) return null;
    if (typeof value !== "object") {
      const cls = schema.fields[at];
      if (!cls) throw new ScrubRefused(`${at || "the response"} is not in the ${r.provider} schema`);
      return leaf(cls, value, at);
    }
    if (Array.isArray(value)) {
      const cls = at ? schema.fields[at] : "object";
      if (!cls) throw new ScrubRefused(`${at} is not in the ${r.provider} schema`);
      // A list of plain values (labels) takes the list's class; a list of objects is walked field by field.
      return value.map((v) => (v !== null && typeof v === "object" ? walk(v, `${at}[]`) : cls === "object" ? walk(v, `${at}[]`) : leaf(cls, v, `${at}[]`)));
    }
    if (at && !at.endsWith("[]") && schema.fields[at] !== "object") throw new ScrubRefused(`${at} is not an object in the ${r.provider} schema`);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => {
      const path = at ? `${at}.${k}` : k;
      if (!(path in schema.fields)) throw new ScrubRefused(`${path} is not in the ${r.provider} schema`);
      return [k, walk(v, path)];
    }));
  };
  // Bodies first, then paths: a path's id takes the pseudonym the same value got in a body.
  const bodies = Object.entries(r.responses).map(([p, body]) => [p, walk(body, "")] as const);
  const path = (p: string): string => {
    const m = matchRule(schema.paths, p);
    if (!m) throw new ScrubRefused(`A ${r.provider} request path is not in the schema`);
    const enc = (raw: string, plain: string, next: string) => (next === plain ? raw : encodeURIComponent(next));
    const segs = m.segments.map((raw, i) => (/^\{\w+\}$/.test(m.pattern[i]) ? enc(raw, m.decode(raw), pseudo("id", m.decode(raw))) : raw));
    const query = m.pairs.map(({ name, raw, value }) => {
      const spec = m.rule.query[name];
      const rawName = encodeURIComponent(name);
      if (typeof spec === "object" && "literal" in spec) {
        if (value !== spec.literal) throw new ScrubRefused(`The ${name} parameter of a ${r.provider} request is not the connector's own`);
        return `${rawName}=${raw}`;
      }
      if (typeof spec === "object" && "jql" in spec) {
        const project = /^project\s*=\s*(\S+)$/.exec(value);
        if (!project) throw new ScrubRefused("A Jira search is not the connector's own");
        return `${rawName}=${enc(raw, value, `project=${pseudo("id", project[1])}`)}`;
      }
      return `${rawName}=${enc(raw, value, String(leaf(spec, spec === "count" && /^\d{1,6}$/.test(value) ? Number(value) : value, name)))}`;
    });
    return query.length ? `${segs.join("/")}?${query.join("&")}` : segs.join("/");
  };
  const recording: Recording = {
    connector: r.connector,
    provider: r.provider,
    recorded_at: r.recorded_at,
    responses: Object.fromEntries(bodies.map(([p, body]) => [path(p), body])),
    ...(r.links ? { links: Object.fromEntries(Object.entries(r.links).map(([p, next]) => [path(p), next === null ? null : path(next)])) } : {}),
  };
  return { recording, aliases };
}

/**
 * What in a recording is outside its provider's schema, or not in the shape its class allows once
 * scrubbed. A written recording has none. Each finding names where, never the value.
 */
export function findLeaks(r: Recording): string[] {
  const schema = SCHEMAS[r.provider];
  if (!schema) return [`no scrub schema for ${r.provider}`];
  const out = new Set<string>();
  const walk = (value: unknown, at: string) => {
    if (value === null) return;
    if (Array.isArray(value)) {
      const cls = at ? schema.fields[at] : "object";
      if (!cls) return void out.add(`${at}: not in the schema`);
      for (const v of value) {
        if (v !== null && typeof v === "object") walk(v, `${at}[]`);
        else if (cls === "object") walk(v, `${at}[]`);
        else if (!kept(cls, v)) out.add(`${at}[]: not ${typeof cls === "string" ? cls : "a listed word"}`);
      }
      return;
    }
    const cls = schema.fields[at];
    if (typeof value === "object") {
      if (at && !at.endsWith("[]") && cls !== "object") out.add(`${at}: not an object in the schema`);
      for (const [k, v] of Object.entries(value)) {
        const path = at ? `${at}.${k}` : k;
        if (!(path in schema.fields)) out.add(`${at || "a response"}: a field not in the schema`);
        else walk(v, path);
      }
      return;
    }
    if (!cls) out.add(`${at || "a response"}: not in the schema`);
    else if (!kept(cls, value)) out.add(`${at}: not ${typeof cls === "string" ? cls : "a listed word"}`);
  };
  const checkPath = (p: string, where: string) => {
    const m = matchRule(schema.paths, p);
    if (!m) return void out.add(`${where}: not a path in the schema`);
    m.pattern.forEach((part, i) => {
      if (/^\{\w+\}$/.test(part) && !SHAPES.id.test(m.decode(m.segments[i]))) out.add(`${where}: a path id that is not a pseudonym`);
    });
    for (const { name, value } of m.pairs) {
      const spec = m.rule.query[name];
      const ok = typeof spec === "object" && "literal" in spec ? value === spec.literal
        : typeof spec === "object" && "jql" in spec ? new RegExp(`^project=id-${HASH}$`).test(value)
        : spec === "count" ? /^\d{1,6}$/.test(value)
        : kept(spec, value) && !SHAPES.value.test(value);
      if (!ok) out.add(`${where}: the ${name} parameter`);
    }
  };
  for (const [p, body] of Object.entries(r.responses)) {
    checkPath(p, "a response path");
    walk(body, "");
  }
  for (const next of Object.values(r.links ?? {})) if (next) checkPath(next, "a next link");
  return [...out];
}

/** The live records with every replaced value renamed as the scrub renamed it: what the replay must equal. */
export function renameRecords<T extends { id: string; text: string }>(records: T[], aliases: Map<string, string>): T[] {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const local = (s: string) => (EMAIL.test(s) ? s.split("@")[0].toLowerCase() : null);
  const forms = new Map<string, string>();
  for (const [from, to] of aliases) {
    forms.set(from, to);
    forms.set(slug(from), slug(to));
    const [lf, lt] = [local(from), local(to)];
    if (lf && lt) forms.set(lf, lt);
  }
  const phrases = [...aliases].filter(([from]) => /\s/.test(from)).sort((a, b) => b[0].length - a[0].length);
  const rename = (s: string) => {
    let out = s;
    for (const [from, to] of phrases) out = out.split(from).join(to);
    return out.split(/([\s:/]+)/).map((tok) => forms.get(tok) ?? tok).join("");
  };
  return records.map((r) => ({ ...r, id: rename(r.id), text: rename(r.text) }));
}
