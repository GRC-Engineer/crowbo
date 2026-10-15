import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeApiRoute, FetchJson } from "../../src/engine/model";

/**
 * The provider API specs pinned in backend/contracts, and what a connector read from them. A connector
 * runs against its fixture through a recording API: every request path and every response field it
 * touches is recorded, including fields it looked for and did not find. Each is then looked up in the
 * provider's spec.
 */

const ROOT = join(import.meta.dirname, "../../contracts");

export interface Source {
  label: string;
  file: string;
  format: "openapi" | "google-discovery" | "graphql";
  committed: boolean;
}

export const SOURCES = JSON.parse(readFileSync(join(ROOT, "sources.json"), "utf8")) as Record<string, Source>;

/** The spec's path on disk; a YAML spec is read through the JSON copy the fetch script writes. */
export function specFile(id: string): string {
  const s = SOURCES[id];
  const path = join(s.committed ? ROOT : join(ROOT, ".cache"), s.file);
  return path.endsWith(".yaml") ? `${path}.json` : path;
}

export const missingSpecs = () => Object.keys(SOURCES).filter((id) => !existsSync(specFile(id)));

// ---- Recording ----

/** Fields that the runtime, not the connector, asks for: awaiting a value, JSON.stringify. */
const RUNTIME = new Set(["then", "toJSON"]);

function watch(value: unknown, at: string, seen: Set<string>): unknown {
  if (value === null || typeof value !== "object") return value;
  return new Proxy(value, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver);
      if (typeof key === "symbol" || RUNTIME.has(key)) return v;
      if (Array.isArray(target)) return /^\d+$/.test(key) ? watch(v, `${at}[]`, seen) : v;
      const path = at ? `${at}.${key}` : key;
      seen.add(path);
      return watch(v, path, seen);
    },
  });
}

/** An API over fixture routes that records, per request path, the response fields read. */
export function recordingApi(routes: FakeApiRoute[]): { api: FetchJson; reads: Map<string, Set<string>> } {
  const reads = new Map<string, Set<string>>();
  const respond = (path: string) => {
    const seen = reads.get(path) ?? new Set<string>();
    reads.set(path, seen);
    const versions = routes.find((r) => r.path === path)?.versions;
    return versions ? watch(structuredClone(versions[versions.length - 1].body), "", seen) : null;
  };
  const api: FetchJson = async (path) => respond(path);
  api.page = async (path) => {
    const body = respond(path);
    return body === null ? null : { body, next: null };
  };
  return { api, reads };
}

// ---- Looking a read up in a spec ----

export type Verdict =
  | { field: string; status: "defined" }
  /** The schema allows any key here (a map or an extensible profile); the spec cannot confirm the name. */
  | { field: string; status: "open"; at: string; key: string }
  | { field: string; status: "undefined"; at: string };

export interface Endpoint {
  /** The spec's path template. */
  template: string;
  /** Query parameters the request used that the operation does not declare. */
  undeclared: string[];
  /** The OAuth scopes the spec says the operation accepts. */
  scopes: string[];
  check(field: string): Verdict;
}

type Json = Record<string, unknown>;
const segments = (field: string) => field.replace(/\[\]/g, ".[]").split(".").filter(Boolean);
const templateRe = (t: string) => new RegExp(`^${t.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{\+?[^}]+\\?\}/g, "[^/]+")}$`);
const queryKeys = (path: string) => [...new URL(path, "https://x").searchParams.keys()];
const pathname = (path: string) => new URL(path, "https://x").pathname;

/** A JSON-schema walker over a resolver: $ref, allOf, oneOf, anyOf, discriminator mappings, items, properties. */
function schemaWalker(resolve: (ref: string) => unknown) {
  /** Every schema a value may match here; each is visited once, so a subtype's allOf back to its base ends. */
  const expand = (schema: unknown, out: Json[] = [], seen = new Set<unknown>()): Json[] => {
    if (!schema || typeof schema !== "object" || seen.has(schema)) return out;
    seen.add(schema);
    const s = schema as Json;
    if (typeof s.$ref === "string") return expand(resolve(s.$ref), out, seen);
    out.push(s);
    for (const k of ["allOf", "oneOf", "anyOf"]) for (const part of (s[k] as unknown[] | undefined) ?? []) expand(part, out, seen);
    const mapping = (s.discriminator as { mapping?: Record<string, string> } | undefined)?.mapping;
    for (const ref of Object.values(mapping ?? {})) expand(resolve(ref), out, seen);
    return out;
  };
  return (root: unknown, field: string): Verdict => {
    let current = expand(root);
    const parts = segments(field);
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      const at = parts.slice(0, i).join(".").replace(/\.\[\]/g, "[]");
      const next: Json[] = [];
      let open = false;
      for (const s of current) {
        if (key === "[]") {
          const items = s.items;
          for (const it of Array.isArray(items) ? items : items ? [items] : []) expand(it, next);
          continue;
        }
        const prop = (s.properties as Json | undefined)?.[key];
        if (prop) expand(prop, next);
        else if (s.additionalProperties && typeof s.additionalProperties === "object" && Object.keys(s.additionalProperties).length) expand(s.additionalProperties, next);
        else if (s.additionalProperties === true || (s.additionalProperties && typeof s.additionalProperties === "object")) open = true;
      }
      if (!next.length) return open ? { field, status: "open", at, key } : { field, status: "undefined", at };
      current = next;
    }
    return { field, status: "defined" };
  };
}

function pointer(doc: Json, ref: string): unknown {
  return ref.slice(2).split("/").map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~")).reduce<unknown>((o, k) => (o as Json | undefined)?.[k], doc);
}

/** OpenAPI 3 or Swagger 2 (with its basePath). */
function openapi(doc: Json): (path: string) => Endpoint | null {
  const walk = schemaWalker((ref) => pointer(doc, ref));
  const base = (doc.basePath as string | undefined) ?? "";
  const paths = Object.entries(doc.paths as Record<string, Json>)
    .map(([template, item]) => ({ template, item, re: templateRe(base + template), params: (template.match(/\{/g) ?? []).length }))
    .sort((a, b) => a.params - b.params);
  return (path) => {
    const hit = paths.find((p) => p.re.test(pathname(path)));
    const op = hit?.item.get as Json | undefined;
    if (!hit || !op) return null;
    const params = [...((hit.item.parameters as unknown[]) ?? []), ...((op.parameters as unknown[]) ?? [])]
      .map((p) => ((p as Json).$ref ? pointer(doc, (p as Json).$ref as string) : p) as Json)
      .filter((p) => p.in === "query")
      .map((p) => p.name as string);
    const ok = (op.responses as Json)["200"] as Json;
    const schema = (ok.content as Json | undefined)?.["application/json"] ? ((ok.content as Json)["application/json"] as Json).schema : ok.schema;
    const security = ((op.security as Record<string, string[]>[] | undefined) ?? []).flatMap((s) => Object.values(s).flat());
    const atlassian = ((op["x-atlassian-oauth2-scopes"] as { state: string; scopes: string[] }[] | undefined) ?? []).filter((s) => s.state === "Current").flatMap((s) => s.scopes);
    return { template: hit.template, undeclared: queryKeys(path).filter((k) => !params.includes(k)), scopes: [...new Set([...security, ...atlassian])], check: (field) => walk(schema, field) };
  };
}

/** A Google API discovery document. */
function discovery(doc: Json): (path: string) => Endpoint | null {
  const schemas = doc.schemas as Json;
  const walk = schemaWalker((ref) => schemas[ref]);
  const methods: Json[] = [];
  const collect = (resources: Json | undefined) => {
    for (const r of Object.values(resources ?? {}) as Json[]) {
      methods.push(...(Object.values((r.methods as Json | undefined) ?? {}) as Json[]));
      collect(r.resources as Json | undefined);
    }
  };
  collect(doc.resources as Json);
  return (path) => {
    const m = methods.filter((x) => x.httpMethod === "GET").find((x) => templateRe(`/${doc.servicePath as string}${x.path as string}`).test(pathname(path)));
    if (!m) return null;
    const params = Object.entries(m.parameters as Record<string, Json>).filter(([, p]) => p.location === "query").map(([k]) => k);
    return { template: m.path as string, undeclared: queryKeys(path).filter((k) => !params.includes(k)), scopes: (m.scopes as string[]) ?? [], check: (field) => walk(m.response, field) };
  };
}

/** A GraphQL schema (SDL) reduced to type -> field -> named type, enough to walk a selection. */
export function graphqlTypes(sdl: string): Map<string, Map<string, string>> {
  const bare = sdl.replace(/"""[\s\S]*?"""/g, "").replace(/"(?:[^"\\\n]|\\.)*"/g, "").replace(/#[^\n]*/g, "");
  const types = new Map<string, Map<string, string>>();
  for (const m of bare.matchAll(/\b(?:type|interface)\s+(\w+)[^{]*\{([^}]*)\}/g)) {
    let body = m[2];
    for (let prev = ""; prev !== body; ) [prev, body] = [body, body.replace(/\([^()]*\)/g, "")];
    const fields = types.get(m[1]) ?? new Map<string, string>();
    for (const f of body.matchAll(/^\s*(\w+)\s*:\s*([[\]\w!]+)/gm)) fields.set(f[1], f[2].replace(/[[\]!]/g, ""));
    types.set(m[1], fields);
  }
  return types;
}

/** The arguments a GraphQL field accepts, read from the SDL. */
export function graphqlArgs(sdl: string, type: string, field: string): string[] {
  const bare = sdl.replace(/"""[\s\S]*?"""/g, "").replace(/"(?:[^"\\\n]|\\.)*"/g, "").replace(/#[^\n]*/g, "");
  const body = new RegExp(`\\btype\\s+${type}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(bare)?.[1] ?? "";
  const args = new RegExp(`\\n\\s*${field}\\s*\\(([^)]*)\\)`).exec(body)?.[1] ?? "";
  return [...args.matchAll(/(\w+)\s*:/g)].map((a) => a[1]);
}

function graphql(sdl: string): (path: string) => Endpoint | null {
  const types = graphqlTypes(sdl);
  return () => ({
    template: "POST /graphql",
    undeclared: [],
    scopes: [],
    check(field) {
      const parts = segments(field);
      if (parts[0] !== "data") return { field, status: "undefined", at: "" };
      let type = "Query";
      for (let i = 1; i < parts.length; i++) {
        if (parts[i] === "[]") continue;
        const next = types.get(type)?.get(parts[i]);
        if (!next) return { field, status: "undefined", at: parts.slice(0, i).join(".").replace(/\.\[\]/g, "[]") };
        type = next;
      }
      return { field, status: "defined" };
    },
  });
}

/** A field read inside a schema the spec defines by name, for values the operation types only as a map. */
export function schemaCheck(id: string, schema: string, field: string): Verdict {
  const doc = JSON.parse(readFileSync(specFile(id), "utf8")) as Json;
  return schemaWalker((ref) => pointer(doc, ref))({ $ref: `#/components/schemas/${schema}` }, field);
}

export function loadSpec(id: string): (path: string) => Endpoint | null {
  const s = SOURCES[id];
  const text = readFileSync(specFile(id), "utf8");
  if (s.format === "graphql") return graphql(text);
  const doc = JSON.parse(text) as Json;
  return s.format === "google-discovery" ? discovery(doc) : openapi(doc);
}
