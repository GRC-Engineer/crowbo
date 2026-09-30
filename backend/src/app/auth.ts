import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { settings as settingsSchema, type Settings } from "../domain/settings";
import { addMicros, HOUR, MINUTE, now } from "../domain/time";

/**
 * Operator credentials. The administrator-controlled `CROWBO_OPERATORS` secret maps the SHA-256
 * of each bearer token to that operator's settings, teams and roles. Team membership comes only
 * from this configuration and is minted with a fresh lease of at most one hour per request, so
 * an operator can never add themselves to a team.
 */
const operatorConfig = z.strictObject({
  tenant: z.string().min(1).max(100),
  reader: z.string().min(1).max(100),
  teams: z.array(z.string().min(1).max(200)).max(100).default([]),
  roles: z.array(z.enum(["operator", "criteria_approver", "ingestor"])).default(["operator"]),
  source_scopes: z.array(z.string()),
  query_processors: z.array(z.string()).default([]),
  experiment_id: z.string().nullable().default(null),
  budget_usd: z.string().nullable().default(null),
  max_provider_calls: z.number().int().optional(),
});
export type OperatorConfig = z.infer<typeof operatorConfig>;

export const operatorsSchema = z.record(z.string().regex(/^[a-f0-9]{64}$/), operatorConfig);

export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function parseOperators(raw: string | undefined): Record<string, OperatorConfig> {
  if (!raw) return {};
  return operatorsSchema.parse(JSON.parse(raw));
}

/** Find the operator for a bearer token, comparing hashes in constant time. */
export function authenticate(header: string | null, operators: Record<string, OperatorConfig>): OperatorConfig | null {
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{24,512})$/.exec(header ?? "");
  if (!match) return null;
  const presented = Buffer.from(tokenHash(match[1]), "hex");
  let found: OperatorConfig | null = null;
  for (const [hash, config] of Object.entries(operators)) {
    const known = Buffer.from(hash, "hex");
    if (known.length === presented.length && timingSafeEqual(known, presented)) found = config;
  }
  return found;
}

export function callerFor(config: OperatorConfig, account: string, gateway: string): { settings: Settings; roles: string[] } {
  const at = now();
  return {
    roles: config.roles,
    settings: settingsSchema.parse({
      tenant: config.tenant,
      reader: config.reader,
      source_scopes: config.source_scopes,
      query_processors: config.query_processors,
      experiment_id: config.experiment_id,
      budget_usd: config.budget_usd,
      ...(config.max_provider_calls ? { max_provider_calls: config.max_provider_calls } : {}),
      cloudflare_account: account,
      gateway,
      membership: config.teams.length
        ? { tenant: config.tenant, reader: config.reader, groups: config.teams, checked_at: addMicros(at, -MINUTE), expires_at: addMicros(at, HOUR - MINUTE) }
        : null,
    }),
  };
}
