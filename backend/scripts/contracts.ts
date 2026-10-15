import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Provider API specs, pinned by SHA-256 (backend/contracts/SOURCES.md). Specs that can be committed
 * are committed; the rest are fetched into the git-ignored cache and checked against the pinned hash.
 * Google serves its discovery document with keys in varying order, so a source marked
 * "hash": "canonical-json" is hashed with its object keys sorted; the content, not the bytes, is pinned.
 * A spec that no longer matches is kept beside the cache as <file>.new and the run fails: review the
 * change, update the connectors if needed, then re-pin the hash in sources.json.
 *
 *   bun scripts/contracts.ts          fetch what is missing, and verify every pinned spec
 *   bun scripts/contracts.ts --check  verify only; fetch nothing
 */

const ROOT = join(import.meta.dirname, "../contracts");
const CACHE = join(ROOT, ".cache");
type Source = { label: string; url: string; sha256: string; hash?: "canonical-json"; file: string; format: string; committed: boolean };
const sources = JSON.parse(readFileSync(join(ROOT, "sources.json"), "utf8")) as Record<string, Source>;
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;
const digest = (s: Source, b: Uint8Array) =>
  createHash("sha256").update(s.hash === "canonical-json" ? JSON.stringify(canonical(JSON.parse(new TextDecoder().decode(b)))) : b).digest("hex");
const check = process.argv.includes("--check");

let failed = 0;
for (const [id, s] of Object.entries(sources)) {
  const path = join(s.committed ? ROOT : CACHE, s.file);
  if (!existsSync(path)) {
    if (s.committed || check) {
      console.error(`${id}: missing ${path}`);
      failed++;
      continue;
    }
    const res = await fetch(s.url, { redirect: "error" });
    if (!res.ok) {
      console.error(`${id}: ${s.url} answered ${res.status}`);
      failed++;
      continue;
    }
    const body = new Uint8Array(await res.arrayBuffer());
    mkdirSync(dirname(path), { recursive: true });
    const fetched = digest(s, body);
    if (fetched !== s.sha256) {
      writeFileSync(`${path}.new`, body);
      console.error(`${id}: upstream changed (sha256 ${fetched}, pinned ${s.sha256}); saved ${path}.new for review`);
      failed++;
      continue;
    }
    writeFileSync(`${path}.part`, body);
    renameSync(`${path}.part`, path);
  }
  const got = digest(s, readFileSync(path));
  if (got !== s.sha256) {
    console.error(`${id}: ${path} has sha256 ${got}, pinned ${s.sha256}`);
    failed++;
    continue;
  }
  // The contract test runs under Node, which has no YAML parser: keep a JSON copy beside the pinned YAML.
  if (s.file.endsWith(".yaml") && !existsSync(`${path}.json`)) writeFileSync(`${path}.json`, JSON.stringify(Bun.YAML.parse(readFileSync(path, "utf8"))));
  console.log(`${id}: ${s.label} verified`);
}
process.exit(failed ? 1 : 0);
