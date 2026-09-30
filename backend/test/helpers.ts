// Port of tests/conftest.py: an in-memory store for failure injection, a fake Jev and the
// shared fixtures. The store double does not establish hosted database behaviour.
import { digest } from "../src/domain/canonical";
import {
  type Assessment,
  assessment,
  type Grant,
  grant as grantSchema,
  head as headSchema,
  permits,
  revisionId,
  type SourceInput,
  sourceBatch,
  sourceInput,
  type SourceRevision,
} from "../src/domain/contracts";
import { CrowboError } from "../src/domain/errors";
import { CRITERIA_HASH, CRITERIA_VERSION } from "../src/domain/questions";
import { type Settings, settings as settingsSchema } from "../src/domain/settings";
import { addMicros, DAY, HOUR, MINUTE, now } from "../src/domain/time";
import { Evidence } from "../src/services/evidence";
import type { Assessor, Ledger, PutOptions, SearchHit, Store } from "../src/services/ports";

export const clone = <T>(value: T): T => structuredClone(value);

export function answers() {
  return {
    ...Object.fromEntries(
      ["obligation_stated", "deadline_stated", "consequence_stated", "owner_nondeferral_stated"].map((key) => [key, { type: "noul", noul: 0.01 }]),
    ),
    commitment_evidence: {
      type: "choice",
      choice: "insufficient",
      confidence: 0.99,
      probabilities: { sufficient: 0.0, insufficient: 1.0, conflicting: 0.0 },
    },
  };
}

export class MemoryStore implements Store {
  rows = new Map<string, Record<string, any>>();
  indexed: string[] = [];
  hits: SearchHit[] = [];
  failIndex = false;
  writes = 0;

  async get(id: string) {
    const row = this.rows.get(id);
    return row ? clone(row) : null;
  }

  async getMany(ids: readonly string[]) {
    const out: Record<string, Record<string, any>> = {};
    for (const id of ids) if (this.rows.has(id)) out[id] = clone(this.rows.get(id)!);
    return out;
  }

  async put(id: string, _kind: string, body: Record<string, any>, options: PutOptions = {}) {
    const old = this.rows.get(id);
    if ((options.insertOnly && old !== undefined) || (options.expectedHash != null && digest(old ?? null) !== options.expectedHash)) {
      throw new CrowboError("Concurrent update");
    }
    this.rows.set(id, clone(body));
    this.writes++;
  }

  async heads(reader: string, groups: readonly string[]) {
    const out = [];
    for (const row of this.rows.values()) {
      if ("grant" in row && "logical_id" in row) {
        const h = headSchema.parse(row);
        if (!h.withdrawn && permits(h.grant, reader, now(), null, groups)) out.push(clone(row));
      }
    }
    return out;
  }

  async index(source: SourceRevision, _grant: Grant, _generation: number) {
    if (this.failIndex) throw new CrowboError("Simulated embedding failure");
    this.indexed.push(revisionId(source));
  }

  async refreshIndex() {
    if (this.failIndex) throw new CrowboError("Simulated permission update failure");
  }

  async deleteChunks(logicalId: string, generation: number) {
    this.hits = this.hits.filter((hit) => hit.logical_id !== logicalId || (hit.generation ?? 0) > generation);
  }

  async search(_reader: string, _query: string, _mode: string, limit: number) {
    return this.hits.slice(0, limit);
  }
}

export class FakeJev implements Assessor {
  calls = 0;
  fail = false;

  async assess(source: SourceRevision): Promise<Assessment> {
    this.calls++;
    if (this.fail) throw new CrowboError("Simulated Jev failure");
    return assessment.parse({
      source_revision: revisionId(source),
      criteria_version: CRITERIA_VERSION,
      criteria_hash: CRITERIA_HASH,
      returned_model: "jev-test",
      answers: answers(),
      input_tokens: 1,
      output_tokens: 1,
      elapsed_seconds: 0.01,
      assessed_at: now(),
    });
  }
}

/** Records reservations like the SQLite ledger, without limits. */
export class MemoryLedger implements Ledger {
  calls: { provider: string; operation: string; receipt?: Record<string, unknown> }[] = [];
  async reserve(provider: string, operation: string) {
    this.calls.push({ provider, operation });
    return this.calls.length;
  }
  async receipt(call: number, values: Record<string, unknown>) {
    this.calls[call - 1].receipt = values;
  }
}

export function makeSettings(overrides: Partial<Record<keyof Settings, unknown>> = {}): Settings {
  return settingsSchema.parse({
    tenant: "synthetic",
    reader: "operator",
    source_scopes: ["fixture:public"],
    cloudflare_account: "0".repeat(32),
    budget_usd: "10.00",
    query_processors: ["turbopuffer", "voyage"],
    ...overrides,
  });
}

export function makeItem(): SourceInput {
  const at = now();
  return sourceInput.parse({
    source: {
      tenant: "synthetic",
      connector: "fixture",
      workspace: "public",
      native_id: "issue-1",
      source_url: "https://example.org/issues/1",
      title: "Synthetic access review",
      text: "An invented development example. Owner requests an access review; no obligation is stated.",
      updated_at: addMicros(at, -2n * DAY),
      observed_at: at,
      basis: "synthetic",
      kind: "issue",
    },
    grant: {
      readers: ["operator"],
      processors: ["turbopuffer", "jev", "voyage"],
      checked_at: addMicros(at, -5n * MINUTE),
      expires_at: addMicros(at, HOUR),
    },
  });
}

export function batch(...items: SourceInput[]) {
  return sourceBatch.parse({ scope: "Synthetic test only", coverage: "partial", limitations: ["No real evidence"], records: items });
}

export function makeEngine(settings: Settings = makeSettings()) {
  const store = new MemoryStore();
  const jev = new FakeJev();
  return { engine: new Evidence(settings, store, jev), store, jev, settings };
}

/** Python's `model_copy(update=...)` for JSON-form values, re-validated like `model_validate`. */
export function withSource(item: SourceInput, update: Partial<Record<string, unknown>>): SourceInput {
  return sourceInput.parse({ source: { ...item.source, ...update }, grant: item.grant });
}
export function withGrant(item: SourceInput, update: Partial<Record<string, unknown>>): SourceInput {
  return sourceInput.parse({ source: item.source, grant: grantSchema.parse({ ...item.grant, ...update }) });
}

export { addMicros, DAY, HOUR, MINUTE, now };
