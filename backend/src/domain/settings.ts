import { z } from "zod";
import { digest } from "./canonical";
import { type Instant, HOUR, instant, micros } from "./time";

export const groupMembership = z
  .strictObject({
    tenant: z.string().min(1).max(100),
    reader: z.string().min(1).max(100),
    groups: z.array(z.string().min(1).max(200)).max(100),
    checked_at: instant,
    expires_at: instant,
  })
  .refine((m) => {
    const lease = micros(m.expires_at) - micros(m.checked_at);
    return lease > 0n && lease <= HOUR;
  }, "group membership requires a positive lease of at most one hour");
export type GroupMembership = z.infer<typeof groupMembership>;

/**
 * Who is calling and what they may route data through. In the Python pilot this was a
 * private settings file bound at process start; in the Worker it is resolved per request
 * from the caller's credential, so one deployment serves several operators and tenants.
 */
export const settings = z
  .strictObject({
    tenant: z.string().min(1).max(100),
    reader: z.string().min(1).max(100),
    membership: groupMembership.nullable().default(null),
    source_scopes: z.array(z.string()),
    cloudflare_account: z.string().regex(/^[a-f0-9]{32}$/),
    gateway: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).default("default"),
    max_provider_calls: z.number().int().min(1).max(1750).default(250),
    budget_usd: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .refine((v) => Number(v) >= 0.05 && Number(v) <= 87.5, "budget out of range")
      .nullable()
      .default(null),
    query_processors: z.array(z.string()).default([]),
    experiment_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).nullable().default(null),
  })
  .superRefine((s, ctx) => {
    if (s.experiment_id === null && s.budget_usd === null) {
      ctx.addIssue({ code: "custom", message: "legacy settings require a cost reservation or an explicit experiment" });
    }
    if (s.membership && (s.membership.tenant !== s.tenant || s.membership.reader !== s.reader)) {
      ctx.addIssue({ code: "custom", message: "group membership must belong to the configured tenant and reader" });
    }
  });
export type Settings = z.infer<typeof settings>;

export function activeGroups(s: Settings, at: Instant): string[] {
  const m = s.membership;
  if (m && m.tenant === s.tenant && m.reader === s.reader && micros(m.checked_at) <= micros(at) && micros(at) < micros(m.expires_at)) {
    return m.groups;
  }
  return [];
}

export function namespacePrefix(s: Pick<Settings, "tenant">): string {
  return "crowbo-pilot-" + digest(s.tenant).slice(0, 20);
}
