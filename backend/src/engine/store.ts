import type { MemoryEntry, SourceRecord, SourceWeight } from "./model";

/**
 * The engine's primary state: what was read, what the company configured, and what was decided.
 * Facts, the graph and the decision are recomputed from it on load, so nothing derived can drift.
 * Writes happen before the in-memory engine changes ("persist first, cache second").
 */
export interface EngineState {
  records: SourceRecord[];
  weights: SourceWeight[];
  memory: MemoryEntry[];
  readAt: Record<string, string>;
  /** The demo clock (ISO datetime). Real deployments use the wall clock. */
  now: string;
}

export interface EngineStore {
  load(): EngineState | null;
  saveRecord(record: SourceRecord): void;
  saveWeight(weight: SourceWeight): void;
  appendMemory(entry: MemoryEntry): void;
  saveReadAt(connector: string, at: string): void;
  saveNow(now: string): void;
}

/** In-process store for tests and the local MCP server. */
export class MemoryEngineStore implements EngineStore {
  private state: EngineState | null;
  constructor(initial: EngineState | null = null) {
    this.state = initial ? structuredClone(initial) : null;
  }
  private s(): EngineState {
    return (this.state ??= { records: [], weights: [], memory: [], readAt: {}, now: "" });
  }
  load() {
    return this.state ? structuredClone(this.state) : null;
  }
  saveRecord(record: SourceRecord) {
    const s = this.s();
    s.records = [...s.records.filter((r) => r.id !== record.id), structuredClone(record)];
  }
  saveWeight(weight: SourceWeight) {
    const s = this.s();
    s.weights = [...s.weights.filter((w) => w.connector !== weight.connector), { ...weight }];
  }
  appendMemory(entry: MemoryEntry) {
    this.s().memory.push(structuredClone(entry));
  }
  saveReadAt(connector: string, at: string) {
    this.s().readAt[connector] = at;
  }
  saveNow(now: string) {
    this.s().now = now;
  }
}

export const ENGINE_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS engine_records (id TEXT PRIMARY KEY, body TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS engine_weights (connector TEXT PRIMARY KEY, body TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS engine_memory (seq INTEGER PRIMARY KEY, body TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS engine_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

/** The tenant Durable Object's SQLite. Memory is insert-only: a sequence number is never rewritten. */
export class SqlEngineStore implements EngineStore {
  constructor(private sql: SqlStorage) {
    for (const statement of ENGINE_SCHEMA) sql.exec(statement);
  }
  load(): EngineState | null {
    const now = this.sql.exec<{ value: string }>("SELECT value FROM engine_meta WHERE key = 'now'").toArray()[0]?.value;
    if (!now) return null;
    const rows = <T>(q: string) => this.sql.exec<{ body: string }>(q).toArray().map((r) => JSON.parse(r.body) as T);
    const readAt = Object.fromEntries(
      this.sql.exec<{ key: string; value: string }>("SELECT key, value FROM engine_meta WHERE key LIKE 'read:%'").toArray().map((r) => [r.key.slice(5), r.value]),
    );
    return {
      records: rows<SourceRecord>("SELECT body FROM engine_records ORDER BY id"),
      weights: rows<SourceWeight>("SELECT body FROM engine_weights ORDER BY connector"),
      memory: rows<MemoryEntry>("SELECT body FROM engine_memory ORDER BY seq"),
      readAt, now,
    };
  }
  saveRecord(record: SourceRecord) {
    this.sql.exec("INSERT INTO engine_records (id, body) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET body = excluded.body", record.id, JSON.stringify(record));
  }
  saveWeight(weight: SourceWeight) {
    this.sql.exec("INSERT INTO engine_weights (connector, body) VALUES (?, ?) ON CONFLICT (connector) DO UPDATE SET body = excluded.body", weight.connector, JSON.stringify(weight));
  }
  appendMemory(entry: MemoryEntry) {
    this.sql.exec("INSERT INTO engine_memory (seq, body) VALUES (?, ?)", entry.seq, JSON.stringify(entry));
  }
  saveReadAt(connector: string, at: string) {
    this.sql.exec("INSERT INTO engine_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", `read:${connector}`, at);
  }
  saveNow(now: string) {
    this.sql.exec("INSERT INTO engine_meta (key, value) VALUES ('now', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", now);
  }
}
