import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { TenantStore } from "./tenant";

export interface Env {
  TENANT: DurableObjectNamespace<TenantStore>;
  /** Account whose Workers AI / AI Gateway routes serve Jev and reasoning. */
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY?: string;
  /** JSON: sha256(token) -> operator config. Administrator-controlled secret. */
  CROWBO_OPERATORS?: string;
  CLOUDFLARE_API_TOKEN?: string;
  /** A plain secret locally, or a Secrets Store binding on staging (shared across Workers). */
  TURBOPUFFER_API_KEY?: string | SecretsStoreSecret;
  SLACK_API_TOKEN?: string;
  /** The Slack surface (staging only): Slack's signing secret, the app's bot token, and the workspace registry (JSON, see surfaces/slack-events.ts). */
  /** Connections (ADR 0003): the key-encryption keyring, the provider apps' client keys, and the public base URL for callbacks. */
  CONNECTIONS_KEK?: string | SecretsStoreSecret;
  CONNECT_CLIENTS?: string | SecretsStoreSecret;
  CONNECT_REDIRECT_BASE?: string;
  /** Per tenant, the identities a consent may come from: "google:<domain>", "linear:<workspace>", "jira:<site host>", "slack:<team id>". */
  CONNECT_TENANT_IDENTITIES?: string | SecretsStoreSecret;
  SLACK_SIGNING_SECRET?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_WORKSPACES?: string;
  /** "true" only outside production: lets synthetic fixture gates activate criteria. */
  ALLOW_SYNTHETIC_GATES?: string;
  /** OAuth grants and clients for Claude connectors. Bound only where OAuth is enabled (staging). */
  OAUTH_KV?: KVNamespace;
  /** Injected by the OAuth provider into its default handler. */
  OAUTH_PROVIDER?: OAuthHelpers;
  /** Local development only: "none" disables the EU jurisdiction, which workerd cannot emulate. */
  DO_JURISDICTION?: string;
}
