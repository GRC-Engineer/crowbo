import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { changedParts, digest, type PinnedSource, partsOf, revisionOf } from "./contract-hash";

/**
 * Provider API specs, pinned by SHA-256 (backend/contracts/SOURCES.md). Specs that can be committed
 * are committed; the rest are fetched into the git-ignored cache and checked against the pin.
 * Versioned releases are pinned whole; Google's and Jira's often-revised documents are pinned by the
 * subset the connectors use (contract-hash.ts). A spec that no longer matches is kept beside the cache
 * as <file>.new and the run fails, naming the parts that changed: review them, update the connectors
 * if needed, then re-pin.
 *
 *   bun scripts/contracts.ts                 fetch what is missing, and verify every pinned spec
 *   bun scripts/contracts.ts --check         verify only; fetch nothing
 *   bun scripts/contracts.ts --repin <id>    pin <id> to its cached copy (or <file>.new), for review in the diff
 */

const ROOT = join(import.meta.dirname, "../contracts");
const CACHE = join(ROOT, ".cache");
const SOURCES = join(ROOT, "sources.json");
const sources = JSON.parse(readFileSync(SOURCES, "utf8")) as Record<string, PinnedSource>;
const check = process.argv.includes("--check");
const repin = process.argv.includes("--repin") ? process.argv[process.argv.indexOf("--repin") + 1] : null;

/** Why bytes do not match a pin: the digest, and for a subset pin the parts that changed and the revision. */
function mismatch(s: PinnedSource, bytes: Uint8Array): string | null {
  const got = digest(s, bytes);
  if (got === s.sha256) return null;
  if (s.hash !== "subset") return `sha256 ${got}, pinned ${s.sha256}`;
  return `the parts Crowbo reads changed (${changedParts(s.parts, partsOf(s, bytes)).join(", ") || "unnamed"}); revision ${revisionOf(s, bytes)}, pinned at ${s.revision}`;
}

if (repin) {
  const s = sources[repin];
  if (!s) throw new Error(`No source ${repin}`);
  const base = join(s.committed ? ROOT : CACHE, s.file);
  const from = existsSync(`${base}.new`) ? `${base}.new` : base;
  const bytes = readFileSync(from);
  const parts = s.hash === "subset" ? partsOf(s, bytes) : undefined;
  if (parts) console.log(`${repin}: changed parts: ${changedParts(s.parts, parts).join(", ") || "none"}`);
  sources[repin] = { ...s, sha256: digest(s, bytes), ...(parts ? { parts, revision: revisionOf(s, bytes) } : {}) };
  writeFileSync(SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
  if (from !== base) renameSync(from, base);
  console.log(`${repin}: pinned to ${from}; review the diff of sources.json before committing`);
  process.exit(0);
}

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
    const why = mismatch(s, body);
    if (why) {
      writeFileSync(`${path}.new`, body);
      console.error(`${id}: upstream changed: ${why}; saved ${path}.new for review`);
      failed++;
      continue;
    }
    writeFileSync(`${path}.part`, body);
    renameSync(`${path}.part`, path);
  }
  const why = mismatch(s, readFileSync(path));
  if (why) {
    console.error(`${id}: ${path} does not match its pin: ${why}`);
    failed++;
    continue;
  }
  // The contract test runs under Node, which has no YAML parser: keep a JSON copy beside the pinned YAML.
  if (s.file.endsWith(".yaml") && !existsSync(`${path}.json`)) writeFileSync(`${path}.json`, JSON.stringify(Bun.YAML.parse(readFileSync(path, "utf8"))));
  const revision = s.hash === "subset" ? revisionOf(s, readFileSync(path)) : undefined;
  console.log(`${id}: ${s.label} verified${revision && revision !== s.revision ? ` (revision now ${revision}; the parts Crowbo reads are unchanged)` : ""}`);
}
process.exit(failed ? 1 : 0);
