import type { TenantStore } from "./tenant";

export interface Env {
  TENANT: DurableObjectNamespace<TenantStore>;
  /** Account whose Workers AI / AI Gateway routes serve Jev and reasoning. */
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY?: string;
  /** JSON: sha256(token) -> operator config. Administrator-controlled secret. */
  CROWBO_OPERATORS?: string;
  CLOUDFLARE_API_TOKEN?: string;
  TURBOPUFFER_API_KEY?: string;
  SLACK_API_TOKEN?: string;
  /** "true" only outside production: lets synthetic fixture gates activate criteria. */
  ALLOW_SYNTHETIC_GATES?: string;
  /** Local development only: "none" disables the EU jurisdiction, which workerd cannot emulate. */
  DO_JURISDICTION?: string;
}
