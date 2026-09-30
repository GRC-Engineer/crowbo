// A node:sqlite stand-in for the Durable Object storage API that SqlStore and SqlLedger use:
// `sql.exec(query, ...bindings)` returning a cursor, and `transactionSync(fn)`. Each instance is
// one connection to a database file, so two instances over one file behave like two processes.
// Only the subset the storage module relies on is implemented.
import { createRequire } from "node:module";
import { SCHEMA } from "../../src/storage/sql-store";

type Row = Record<string, SqlStorageValue>;
type Statement = { all(...params: unknown[]): Row[] };
type Database = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };

// Loaded through require so the bundler never tries to resolve the (recent) builtin itself.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

class Cursor<T extends Row> {
  constructor(private readonly rows: T[]) {}
  toArray(): T[] {
    return [...this.rows];
  }
  one(): T {
    if (this.rows.length !== 1) throw new Error(`Expected exactly one result from SQL query, but got ${this.rows.length}.`);
    return this.rows[0];
  }
  [Symbol.iterator]() {
    return this.rows[Symbol.iterator]();
  }
}

export class SqliteStorage {
  readonly db: Database;
  private depth = 0;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout = 10000");
    for (const statement of SCHEMA) this.db.exec(statement);
  }

  readonly sql = {
    exec: <T extends Row = Row>(query: string, ...bindings: unknown[]) =>
      new Cursor<T>(this.db.prepare(query).all(...bindings).map((row) => ({ ...row }) as T)),
  };

  /** Durable Object semantics: commit when `fn` returns, roll back when it throws. */
  transactionSync<T>(fn: () => T): T {
    const outer = this.depth === 0;
    const savepoint = `sp${this.depth}`;
    this.db.exec(outer ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
    this.depth++;
    try {
      const result = fn();
      this.db.exec(outer ? "COMMIT" : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      this.db.exec(outer ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      throw error;
    } finally {
      this.depth--;
    }
  }

  /** The object as the storage module's parameter type. */
  get storage(): DurableObjectStorage {
    return this as unknown as DurableObjectStorage;
  }

  close() {
    this.db.close();
  }
}
