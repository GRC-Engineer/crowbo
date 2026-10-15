import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import "../../src/engine/connectors";
import type { FetchJson } from "../../src/engine/model";
import { assertSandboxAccount, liveApi, targetFromEnv } from "./live";
import { connectorFor, PROVIDER_CONNECTOR, type Recording, recordedApi, recordingOf } from "./recording";
import { pruneToReads } from "./reads";
import { findLeaks, scrub } from "./scrub";
import { assertSandbox } from "./seed-plan";

/**
 * Record what one connector reads from a Crowbo sandbox, scrub it, check it, and write it to
 * test/fixtures/recorded/<provider>.json for the P2 criterion.
 *
 *   SANDBOX_DOMAINS=crowbo.ai OKTA_ORG=dev-123.okta.com OKTA_TOKEN=... bun scripts/rehearsal/record.ts okta
 *
 * Nothing is read unless the credentials are the sandbox's (assertSandboxAccount), and nothing is
 * written unless: every email in the raw responses is at a sandbox domain (so the token
 * cannot be a real company's), the scrubbed recording has no leaks, and it reads the same records.
 * Output names counts and paths only, never response content.
 */

const OUT = join(import.meta.dirname, "../../test/fixtures/recorded");

export async function recordProvider(provider: string, live: FetchJson, sandboxDomains: string[], now: Date): Promise<{ recording: Recording; records: number }> {
  const connector = PROVIDER_CONNECTOR[provider];
  const c = connector ? connectorFor(connector, provider) : null;
  if (!c) throw new Error(`No connector records ${provider}`);
  const { api, responses, links, reads } = recordingOf(live);
  const records = (await c.read(api)).length;
  assertSandbox(responses, sandboxDomains, "nothing written");
  // Keep only what the connector read: everything else in the provider's answer never reaches the repository.
  const raw: Recording = { connector, provider, recorded_at: now.toISOString(), responses: Object.fromEntries(Object.entries(responses).map(([p, body]) => [p, pruneToReads(body, reads[p])])), links };
  const recording = scrub(raw);
  const leaks = findLeaks(recording);
  if (leaks.length) throw new Error(`The scrubbed recording still leaks; nothing written:\n${leaks.join("\n")}`);
  const replayed = (await c.read(recordedApi(recording))).length;
  if (replayed !== records || records === 0) throw new Error(`Replay read ${replayed} records, the live read ${records}; nothing written`);
  return { recording, records };
}

if (import.meta.main) {
  const provider = process.argv[2] ?? "";
  try {
    const domains = (process.env.SANDBOX_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
    if (!domains.length) throw new Error("Set SANDBOX_DOMAINS to the sandbox's email domains, comma-separated");
    const target = targetFromEnv(provider, process.env);
    await assertSandboxAccount(provider, target, process.env, domains);
    const { recording, records } = await recordProvider(provider, liveApi(provider, target), domains, new Date());
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, `${provider}.json`);
    writeFileSync(file, `${JSON.stringify(recording, null, 2)}\n`);
    console.log(`${provider}: ${records} records from ${Object.keys(recording.responses).length} responses, scrubbed, written to ${file}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
