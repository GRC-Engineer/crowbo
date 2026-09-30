import { DurableObject } from "cloudflare:workers";
import { namespacePrefix, type Settings } from "../domain/settings";
import { NoSearchIndex, TurbopufferChunks } from "../providers/turbopuffer";
import { SCHEMA, SqlLedger, SqlStore } from "../storage/sql-store";
import type { Env } from "./env";
import { type Context, run } from "./operations";

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

  async operate(caller: CallerPayload, name: string, args: unknown) {
    const settings = caller.settings;
    const ledger = new SqlLedger(this.ctx.storage, settings);
    const chunks = this.env.TURBOPUFFER_API_KEY
      ? new TurbopufferChunks(this.env.TURBOPUFFER_API_KEY, namespacePrefix(settings), ledger)
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
