import { createHash } from "node:crypto";

/**
 * How a provider spec is pinned (backend/contracts/SOURCES.md). A versioned release (Okta, Linear,
 * Slack) is pinned whole, by its bytes. A document its provider revises often (Google's discovery
 * document, Jira's snapshot) is pinned by the subset the connectors use: the methods or paths they
 * request, with their parameters, and every schema those reach. A change elsewhere in the document
 * does not fail the build; a change to anything Crowbo reads does, and names the part that changed.
 */
export interface PinnedSource {
  label: string;
  url: string;
  sha256: string;
  /** "subset": hashed over the parts listed in `subset` (canonical JSON), not the whole document. */
  hash?: "subset";
  /** Google: the method paths requested. OpenAPI: the paths requested, and schemas checked by name. */
  subset?: { methods?: string[]; paths?: string[]; schemas?: string[] };
  /** A short hash per part of the subset, to name what changed when the pin no longer matches. */
  parts?: Record<string, string>;
  /** The document's own revision when pinned (Google's revision, Jira's info.version). */
  revision?: string;
  file: string;
  format: "openapi" | "google-discovery" | "graphql";
  committed: boolean;
}

type Json = Record<string, unknown>;

/** Keys sorted; a list of plain values sorted too, since a provider may serve them in any order. */
const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) {
    const items = v.map(canonical);
    return items.every((x) => x === null || typeof x !== "object") ? [...items].sort((a, b) => String(a).localeCompare(String(b))) : items;
  }
  return v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Json)[k])])) : v;
};
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");

/** Every $ref inside a value, by the name it points to. */
function refs(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const v of value) refs(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "$ref" && typeof v === "string") out.add(v);
      else refs(v, out);
    }
  }
  return out;
}

/** The parts of a document the connectors use, by name, with every schema they reach. */
export function subsetOf(s: PinnedSource, doc: Json): Record<string, unknown> {
  const parts: Record<string, unknown> = {};
  if (s.format === "google-discovery") {
    parts.service = { rootUrl: doc.rootUrl, servicePath: doc.servicePath };
    const want = new Set(s.subset?.methods ?? []);
    const walk = (resources: unknown) => {
      for (const r of Object.values((resources as Json | undefined) ?? {}) as Json[]) {
        for (const m of Object.values((r.methods as Json | undefined) ?? {}) as Json[]) if (m.httpMethod === "GET" && want.has(m.path as string)) parts[`method:${m.path}`] = m;
        walk(r.resources);
      }
    };
    walk(doc.resources);
    for (const m of want) if (!parts[`method:${m}`]) parts[`method:${m}`] = null;
    const schemas = doc.schemas as Json;
    const queue = [...refs(Object.entries(parts).filter(([k]) => k.startsWith("method:")).map(([, v]) => v)), ...(s.subset?.schemas ?? [])];
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      if (`schema:${name}` in parts) continue;
      parts[`schema:${name}`] = schemas[name] ?? null;
      queue.push(...refs(schemas[name]));
    }
    return parts;
  }
  const paths = doc.paths as Record<string, Json>;
  for (const p of s.subset?.paths ?? []) parts[`path:${p}`] = paths[p] ? { parameters: paths[p].parameters ?? null, get: paths[p].get ?? null } : null;
  const resolve = (ref: string) => ref.slice(2).split("/").reduce<unknown>((o, k) => (o as Json | undefined)?.[k.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
  const queue = [...refs(Object.values(parts)), ...(s.subset?.schemas ?? []).map((n) => `#/components/schemas/${n}`)];
  for (let ref = queue.shift(); ref !== undefined; ref = queue.shift()) {
    const name = ref.replace(/^#\/components\//, "");
    if (name in parts) continue;
    const target = resolve(ref);
    parts[name] = target ?? null;
    queue.push(...refs(target));
  }
  return parts;
}

const parse = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as Json;

/** The SHA-256 a spec is pinned by: over its bytes, or over the subset the connectors use. */
export function digest(s: PinnedSource, bytes: Uint8Array): string {
  return s.hash === "subset" ? sha(subsetOf(s, parse(bytes))) : createHash("sha256").update(bytes).digest("hex");
}

/** A short hash for each part of a subset-pinned spec. */
export function partsOf(s: PinnedSource, bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(subsetOf(s, parse(bytes))).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sha(v).slice(0, 12)]));
}

/** The document's own revision, for the record beside the pin. */
export function revisionOf(s: PinnedSource, bytes: Uint8Array): string | undefined {
  if (s.hash !== "subset") return undefined;
  const doc = parse(bytes);
  return s.format === "google-discovery" ? String(doc.revision ?? "") : String((doc.info as Json | undefined)?.version ?? "");
}

/** The parts that changed, were added or were removed since the pin, by name only. */
export function changedParts(pinned: Record<string, string> | undefined, now: Record<string, string>): string[] {
  const before = pinned ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(now)])].filter((k) => before[k] !== now[k]).sort();
}
