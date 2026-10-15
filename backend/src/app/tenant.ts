import { DurableObject } from "cloudflare:workers";
import { namespacePrefix, type Settings } from "../domain/settings";
import { NoSearchIndex, TurbopufferChunks } from "../providers/turbopuffer";
import { SCHEMA, SqlLedger, SqlStore } from "../storage/sql-store";
import type { Env } from "./env";
import { type Context, run } from "./operations";
import { demoOptions } from "../engine/demo";
import { Engine } from "../engine/engine";
import { NORTHWIND } from "../engine/fixture";
import { isEngineOp, runEngine, type Surface } from "../engine/port";
import { SqlEngineStore } from "../engine/store";
import { parseKeyring } from "../connections/crypto";
import { MANIFESTS } from "../connections/manifests";
import { SqlConnectionStore } from "../connections/store";
import { ConnectionError, ConnectionVault } from "../connections/vault";
import { fixedHostFetch } from "../providers/http";
import type { ConnectOp } from "./connect";

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
   * This tenant's connections. The tenant name is fixed on first use, so a call naming another tenant
   * cannot reach these secrets; each secret is sealed under that tenant's derived key.
   */
  async connections(tenant: string, op: ConnectOp): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    try {
      const sql = this.ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS connection_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      const bound = sql.exec<{ value: string }>("SELECT value FROM connection_meta WHERE key = 'tenant'").toArray()[0]?.value;
      if (bound && bound !== tenant) return { ok: false, error: "This object belongs to another tenant" };
      if (!bound) sql.exec("INSERT INTO connection_meta (key, value) VALUES ('tenant', ?)", tenant);
      const kek = await secret(this.env.CONNECTIONS_KEK);
      if (!kek) return { ok: false, error: "Connections are not configured" };
      const vault = new ConnectionVault(tenant, new SqlConnectionStore(this.ctx.storage), parseKeyring(kek));
      const clients = JSON.parse((await secret(this.env.CONNECT_CLIENTS)) ?? "{}") as Record<string, { id: string; secret: string }>;
      const client = (p: string) => {
        const c = clients[p];
        if (!c) throw new ConnectionError(`No app is registered for ${MANIFESTS[p]?.label ?? p}`);
        return c;
      };
      switch (op.op) {
        case "start":
          return { ok: true, result: await vault.startConsent(op.provider, client(op.provider).id, op.redirectUri) };
        case "callback": {
          const m = MANIFESTS[op.provider];
          if (m.flow.kind !== "authorization_code") return { ok: false, error: `${m.label} has no consent redirect` };
          const c = await vault.completeConsent(op.provider, op.nonce, op.code, { ...client(op.provider), redirectUri: op.redirectUri }, fixedHostFetch(new URL(m.flow.token).host, 100_000));
          return { ok: true, result: { provider: c.provider, scopes: c.scopes, missing_scopes: vault.missingScopes(op.provider) } };
        }
        case "okta_setup":
          return { ok: true, result: await vault.setupOkta(op.host, op.clientId) };
        case "paste": {
          const c = await vault.storePasted(op.provider, { client_id: op.clientId, secret: op.secret });
          return { ok: true, result: { provider: c.provider, rotation_due: c.rotation_due } };
        }
        case "rekey":
          return { ok: true, result: await vault.rekey() };
        case "status":
          return { ok: true, result: { connections: new SqlConnectionStore(this.ctx.storage).list(), report: vault.report() } };
      }
    } catch (error) {
      if (error instanceof ConnectionError) return { ok: false, error: error.message };
      return { ok: false, error: "The connection could not be completed" };
    }
  }

  /**
   * The demo engine for this tenant, opened on the tenant's own SQLite and kept warm in the object.
   * Staging only. Engine errors (validation, unknown topic) are returned as messages; anything else
   * is reported generically, like the operations boundary.
   */
  async engineCall(actor: string, op: string, args: unknown, surface: Surface = "mcp"): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
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
      return { ok: true, result: JSON.parse(JSON.stringify(await runEngine(engine, actor, op, args, surface))) };
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
