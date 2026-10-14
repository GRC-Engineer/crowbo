import { DurableObject } from "cloudflare:workers";
import { namespacePrefix, type Settings } from "../domain/settings";
import { NoSearchIndex, TurbopufferChunks } from "../providers/turbopuffer";
import { SCHEMA, SqlLedger, SqlStore } from "../storage/sql-store";
import type { Env } from "./env";
import { type Context, run } from "./operations";
import { demoOptions } from "../engine/demo";
import { Engine } from "../engine/engine";
import { NORTHWIND } from "../engine/fixture";
import { isEngineOp, runEngine } from "../engine/port";
import { SqlEngineStore } from "../engine/store";

/** Read a key that is either a plain secret or a Secrets Store binding. Missing means null. */
async function secret(value: string | SecretsStoreSecret | undefined): Promise<string | null> {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return await value.get();
  } catch {
    return null;
  }
}

export type CallerPayload = { settings: Settings; roles: string[] };

/**
 * One tenant's system of record: SQLite inside a Durable Object pinned to the EU jurisdiction.
 * Every operation runs next to its data, so the integrity re-reads the services perform are
 * local reads, and one object serialises each tenant's writes.
 */
export class TenantStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      for (const statement of SCHEMA) ctx.storage.sql.exec(statement);
    });
  }

  private engine: Promise<Engine> | null = null;

  /**
   * The demo engine for this tenant, opened on the tenant's own SQLite and kept warm in the object.
   * Staging only. Engine errors (validation, unknown topic) are returned as messages; anything else
   * is reported generically, like the operations boundary.
   */
  async engineCall(actor: string, op: string, args: unknown): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    if (this.env.ALLOW_SYNTHETIC_GATES !== "true") return { ok: false, error: "The demo engine runs only where synthetic data is allowed" };
    if (!isEngineOp(op)) return { ok: false, error: "Unknown engine operation" };
    try {
      if (op === "reset") {
        if ((args as { confirm?: unknown } | null)?.confirm !== true) return { ok: false, error: "Pass confirm: true to reset this copy" };
        this.engine = null;
        for (const table of ["engine_records", "engine_weights", "engine_memory", "engine_meta"]) this.ctx.storage.sql.exec(`DROP TABLE IF EXISTS ${table}`);
        return { ok: true, result: { reset: true } };
      }
      // A failed open is not cached: the next call tries again instead of failing forever.
      this.engine ??= Engine.open(structuredClone(NORTHWIND), demoOptions(), new SqlEngineStore(this.ctx.storage.sql)).catch((error) => {
        this.engine = null;
        throw error;
      });
      const engine = await this.engine;
      return { ok: true, result: JSON.parse(JSON.stringify(await runEngine(engine, actor, op, args))) };
    } catch (error) {
      // Only the engine's own messages cross the boundary; storage or runtime errors are reported generically.
      if (error instanceof Error && error.name === "EngineError") return { ok: false, error: error.message.slice(0, 500) };
      if (error instanceof Error && error.name === "ZodError") return { ok: false, error: "Invalid input for this engine operation" };
      return { ok: false, error: "The engine could not complete this operation" };
    }
  }

  async operate(caller: CallerPayload, name: string, args: unknown) {
    const settings = caller.settings;
    const ledger = new SqlLedger(this.ctx.storage, settings);
    const searchKey = await secret(this.env.TURBOPUFFER_API_KEY);
    const chunks = searchKey
      ? new TurbopufferChunks(searchKey, namespacePrefix(settings), ledger)
      : new NoSearchIndex();
    const context: Context = {
      caller,
      store: new SqlStore(this.ctx.storage.sql, chunks),
      ledger,
      ai: { account: settings.cloudflare_account, gateway: settings.gateway, token: this.env.CLOUDFLARE_API_TOKEN ?? null },
      slackToken: this.env.SLACK_API_TOKEN ?? null,
      allowSyntheticGates: this.env.ALLOW_SYNTHETIC_GATES === "true",
    };
    return run(context, name, args);
  }
}
