import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import "../../src/engine/connectors";
import type { FetchJson, SourceRecord } from "../../src/engine/model";
import { assertSandboxAccount, liveApi, sandboxAccounts, targetFromEnv } from "./live";
import { connectorFor, PROVIDER_CONNECTOR, type Recording, recordedApi, recordingOf } from "./recording";
import { pruneToReads } from "./reads";
import { findLeaks, renameRecords, scrub } from "./scrub";
import { assertSandbox } from "./seed-plan";

/**
 * Record what one connector reads from a Crowbo sandbox, scrub it, check it, and write it to
 * test/fixtures/recorded/<provider>.json for the P2 criterion.
 *
 *   bun scripts/rehearsal/record.ts okta        (credentials and SANDBOX_* in the environment: docs/REHEARSAL.md)
 *
 * Nothing is read unless the credentials are the named sandbox account's (assertSandboxAccount).
 * Nothing is written unless every email read is at a sandbox domain, the scrubbed recording passes
 * the schema check (findLeaks), and its replay gives exactly the live records, renamed as scrubbed.
 * Output names counts and paths only, never response content.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const OUT = join(import.meta.dirname, "../../test/fixtures/recorded");

/** A path with symlinks resolved, as far as it exists; the parts not yet created are appended as given. */
function realPath(p: string): string {
  const tail: string[] = [];
  let dir = resolve(p);
  while (!existsSync(dir)) {
    tail.unshift(basename(dir));
    dir = dirname(dir);
  }
  return join(realpathSync(dir), ...tail);
}

/** Whether a path is outside a directory: ".." itself or a "../" start, never a name that only begins with "..". */
export function outside(dir: string, path: string): boolean {
  const rel = relative(realPath(dir), realPath(path));
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/** The pseudonym salt: a local file outside the repository, created once, so pseudonyms are stable across recordings. */
export function loadSalt(path = process.env.REHEARSAL_SALT_FILE ?? join(homedir(), ".config/crowbo/rehearsal.salt"), repo = ROOT): string {
  const abs = realPath(path);
  if (!outside(repo, abs)) throw new Error("The pseudonym salt must live outside the repository");
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true, mode: 0o700 });
    writeFileSync(abs, Buffer.from(randomBytes(32)).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(abs, "utf8").trim();
}

const comparable = (records: SourceRecord[]) => JSON.stringify(records.map((r) => ({ id: r.id, text: r.text, completeness: r.completeness })).sort((a, b) => a.id.localeCompare(b.id)));

export async function recordProvider(provider: string, live: FetchJson, sandboxDomains: string[], now: Date, salt: string): Promise<{ recording: Recording; records: number }> {
  const connector = Object.hasOwn(PROVIDER_CONNECTOR, provider) ? PROVIDER_CONNECTOR[provider] : undefined;
  const c = connector ? connectorFor(connector, provider) : null;
  if (!connector || !c) throw new Error(`No connector records ${provider}`);
  const { api, responses, links, reads } = recordingOf(live);
  const liveRecords = await c.read(api);
  if (!liveRecords.length) throw new Error(`${provider}: the connector read nothing; nothing written`);
  assertSandbox(responses, sandboxDomains, "nothing written");
  // Keep only what the connector read: everything else in the provider's answer never reaches the repository.
  const raw: Recording = { connector, provider, recorded_at: now.toISOString(), responses: Object.fromEntries(Object.entries(responses).map(([p, body]) => [p, pruneToReads(body, reads[p])])), links };
  const { recording, aliases } = scrub(raw, salt);
  const leaks = findLeaks(recording);
  if (leaks.length) throw new Error(`The scrubbed recording is outside the schema; nothing written:\n${leaks.join("\n")}`);
  const replayed = await c.read(recordedApi(recording));
  if (comparable(replayed) !== comparable(renameRecords(liveRecords, aliases))) throw new Error(`${provider}: the replay does not give the live records renamed as scrubbed; nothing written`);
  return { recording, records: liveRecords.length };
}

if (import.meta.main) {
  const provider = process.argv[2] ?? "";
  try {
    const domains = (process.env.SANDBOX_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
    if (!domains.length) throw new Error("Set SANDBOX_DOMAINS to the sandbox's email domains, comma-separated");
    const target = targetFromEnv(provider, process.env);
    await assertSandboxAccount(provider, target, process.env, sandboxAccounts(process.env));
    const { recording, records } = await recordProvider(provider, liveApi(provider, target), domains, new Date(), loadSalt());
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, `${provider}.json`);
    writeFileSync(file, `${JSON.stringify(recording, null, 2)}\n`);
    console.log(`${provider}: ${records} records from ${Object.keys(recording.responses).length} responses, scrubbed, written to ${file}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
