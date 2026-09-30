import { digest } from "../domain/canonical";
import type { Grant, SourceRevision } from "../domain/contracts";
import { formatDec, mulDec, parseDec } from "../domain/decimal";
import { CrowboError } from "../domain/errors";
import type { Settings } from "../domain/settings";
import { micros, now } from "../domain/time";
import type { Ledger, PutOptions, SearchHit, Store } from "../services/ports";

/** Rebuildable search chunks; the system of record never lives here. */
export interface ChunkIndex {
  index(source: SourceRevision, grant: Grant, generation: number): Promise<void>;
  refreshIndex(source: SourceRevision, grant: Grant, generation: number): Promise<void>;
  deleteChunks(logicalId: string, generation: number): Promise<void>;
  search(reader: string, query: string, mode: "semantic" | "keyword", limit: number, groups: readonly string[]): Promise<SearchHit[]>;
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS records (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, logical_id TEXT NOT NULL DEFAULT '',
     revision_id TEXT NOT NULL DEFAULT '', state_hash TEXT NOT NULL, readers TEXT NOT NULL DEFAULT '[]',
     reader_groups TEXT NOT NULL DEFAULT '[]', expires_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS records_kind ON records (kind, id)`,
  `CREATE INDEX IF NOT EXISTS records_kind_key ON records (kind, logical_id)`,
  `CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, at TEXT, provider TEXT, operation TEXT, receipt TEXT, experiment_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS experiments (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, reader TEXT NOT NULL,
     max_requests INTEGER NOT NULL, max_models INTEGER NOT NULL, created_at TEXT NOT NULL)`,
];

type Sql = SqlStorage;

/**
 * The tenant's records in Durable Object SQLite. Writes run inside the object's single
 * thread, so an insert-only or compare-and-swap check and its write cannot interleave.
 */
export class SqlStore implements Store {
  constructor(
    private readonly sql: Sql,
    private readonly chunks: ChunkIndex,
  ) {}

  async get(id: string) {
    const row = this.sql.exec<{ body: string }>("SELECT body FROM records WHERE id = ?", id).toArray()[0];
    return row ? JSON.parse(row.body) : null;
  }

  async getMany(ids: readonly string[]) {
    const keys = [...new Set(ids)];
    if (keys.length > 120) throw new CrowboError("Record lookup exceeds the pilot limit");
    const out: Record<string, Record<string, any>> = {};
    for (const key of keys) {
      const row = this.sql.exec<{ body: string }>("SELECT body FROM records WHERE id = ?", key).toArray()[0];
      if (row) out[key] = JSON.parse(row.body);
    }
    return out;
  }

  async put(id: string, kind: string, body: Record<string, any>, options: PutOptions = {}) {
    const existing = this.sql.exec<{ state_hash: string }>("SELECT state_hash FROM records WHERE id = ?", id).toArray()[0];
    if (options.insertOnly && existing) throw new CrowboError("Source state changed concurrently; reload before resuming");
    if (options.expectedHash != null && existing?.state_hash !== options.expectedHash) {
      throw new CrowboError("Source state changed concurrently; reload before resuming");
    }
    this.sql.exec(
      `INSERT INTO records (id, kind, body, logical_id, revision_id, state_hash, readers, reader_groups, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, body = excluded.body, logical_id = excluded.logical_id,
         revision_id = excluded.revision_id, state_hash = excluded.state_hash, readers = excluded.readers,
         reader_groups = excluded.reader_groups, expires_at = excluded.expires_at`,
      id,
      kind,
      JSON.stringify(body),
      options.logicalId ?? "",
      options.revisionId ?? "",
      digest(body),
      JSON.stringify(options.readers ?? []),
      JSON.stringify(options.readerGroups ?? []),
      options.expiresAt ?? null,
    );
  }

  async heads(reader: string, groups: readonly string[]) {
    const at = micros(now());
    const rows = this.sql
      .exec<{ body: string; readers: string; reader_groups: string; expires_at: string | null }>(
        "SELECT body, readers, reader_groups, expires_at FROM records WHERE kind = 'head' ORDER BY id",
      )
      .toArray()
      .filter((row) => {
        const direct = (JSON.parse(row.readers) as string[]).includes(reader);
        const grouped = (JSON.parse(row.reader_groups) as string[]).some((g) => groups.includes(g));
        return (direct || grouped) && row.expires_at !== null && micros(row.expires_at as any) > at;
      });
    if (rows.length > 1000) throw new CrowboError("Source listing exceeds the pilot limit; completeness is unresolved");
    return rows.map((row) => JSON.parse(row.body));
  }

  async scan(kind: string, logical?: string) {
    const rows = logical === undefined
      ? this.sql.exec<{ body: string }>("SELECT body FROM records WHERE kind = ? ORDER BY id", kind).toArray()
      : this.sql.exec<{ body: string }>("SELECT body FROM records WHERE kind = ? AND logical_id = ? ORDER BY id", kind, logical).toArray();
    if (rows.length > 5000) throw new CrowboError("Record scan exceeds the pilot limit");
    return rows.map((row) => JSON.parse(row.body));
  }

  index(source: SourceRevision, grant: Grant, generation: number) {
    return this.chunks.index(source, grant, generation);
  }
  refreshIndex(source: SourceRevision, grant: Grant, generation: number) {
    return this.chunks.refreshIndex(source, grant, generation);
  }
  deleteChunks(logicalId: string, generation: number) {
    return this.chunks.deleteChunks(logicalId, generation);
  }
  search(reader: string, query: string, mode: "semantic" | "keyword", limit: number, groups: readonly string[]) {
    return this.chunks.search(reader, query, mode, limit, groups);
  }
}

/**
 * The bounded provider allowance, ported from the pilot's SQLite ledger. A reservation commits
 * before the call, so failed or unknown-outcome calls still count and survive restarts.
 */
export class SqlLedger implements Ledger {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly settings: Settings,
  ) {}

  private get sql() {
    return this.storage.sql;
  }

  async reserve(provider: string, operation: string): Promise<number> {
    const s = this.settings;
    return this.storage.transactionSync(() => {
      if (s.experiment_id !== null) {
        const status = this.experimentStatus();
        if (status.requests >= status.max_requests) throw new CrowboError("Experiment request allowance exhausted");
        if ((operation === "review" || operation === "assess") && status.model_calls >= status.max_models) {
          throw new CrowboError("Experiment model-call allowance exhausted");
        }
        return this.insert(provider, operation, s.experiment_id);
      }
      const count = this.sql.exec<{ n: number }>("SELECT count(*) AS n FROM calls").one().n;
      if (count >= s.max_provider_calls) throw new CrowboError("Pilot request allowance exhausted; review usage before increasing it");
      // Conservative application reservation, not a provider invoice or account-wide cap.
      // Python: int(Decimal(budget) * 100), exact.
      const cents = s.budget_usd === null ? 0 : Number(formatDec(mulDec(parseDec(s.budget_usd), parseDec("100"))).split(".")[0]);
      if (s.budget_usd === null || (count + 1) * 5 > cents) {
        throw new CrowboError("Pilot cost reservation exhausted; review provider billing before continuing");
      }
      return this.insert(provider, operation, null);
    });
  }

  private insert(provider: string, operation: string, experiment: string | null): number {
    return this.sql
      .exec<{ id: number }>("INSERT INTO calls (at, provider, operation, experiment_id) VALUES (?, ?, ?, ?) RETURNING id", now(), provider, operation, experiment)
      .one().id;
  }

  async receipt(call: number, values: Record<string, unknown>): Promise<void> {
    this.sql.exec("UPDATE calls SET receipt = ? WHERE id = ?", JSON.stringify(values), call);
  }

  createExperiment(maxRequests: number, maxModels: number) {
    const s = this.settings;
    if (s.experiment_id === null || !(1 <= maxModels && maxModels <= maxRequests && maxRequests <= 10000)) {
      throw new CrowboError("Select an experiment and valid request/model-call limits");
    }
    this.storage.transactionSync(() => {
      this.sql.exec("INSERT OR IGNORE INTO experiments VALUES (?, ?, ?, ?, ?, ?)", s.experiment_id, s.tenant, s.reader, maxRequests, maxModels, now());
      const stored = this.sql
        .exec<{ id: string; tenant: string; reader: string; max_requests: number; max_models: number }>(
          "SELECT id, tenant, reader, max_requests, max_models FROM experiments WHERE id = ?",
          s.experiment_id,
        )
        .one();
      if (
        stored.id !== s.experiment_id ||
        stored.tenant !== s.tenant ||
        stored.reader !== s.reader ||
        stored.max_requests !== maxRequests ||
        stored.max_models !== maxModels
      ) {
        throw new CrowboError("Experiment identity and allocation cannot be changed");
      }
    });
    return this.experimentStatus();
  }

  experimentStatus() {
    const s = this.settings;
    const row = this.sql
      .exec<{ max_requests: number; max_models: number; created_at: string }>(
        "SELECT max_requests, max_models, created_at FROM experiments WHERE id = ? AND tenant = ? AND reader = ?",
        s.experiment_id,
        s.tenant,
        s.reader,
      )
      .toArray()[0];
    if (!row) throw new CrowboError("Experiment unavailable; the operator must create it explicitly");
    const counts = this.sql
      .exec<{ requests: number; models: number }>(
        "SELECT count(*) AS requests, coalesce(sum(operation IN ('review', 'assess')), 0) AS models FROM calls WHERE experiment_id = ?",
        s.experiment_id,
      )
      .one();
    return {
      experiment_id: s.experiment_id,
      max_requests: row.max_requests,
      max_models: row.max_models,
      created_at: row.created_at,
      requests: counts.requests,
      model_calls: counts.models,
      billing: "Not a dollar estimate; consult provider usage and invoices.",
    };
  }
}
