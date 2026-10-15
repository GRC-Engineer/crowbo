/**
 * The scope manifest per provider (ADR 0003): each scope Crowbo asks for, why, and the scenarios
 * that read it. This file is the security review answer, and the authorize request is built from it,
 * so the consent screen cannot ask for more than it lists. A scope no scenario reads is removed.
 *
 * Endpoints and scope names follow each provider's public documentation as known on 16 October
 * 2026; the dress rehearsal on Crowbo's own sandbox accounts confirms them (verified: false until then).
 */

export type Flow =
  /** The customer's admin consents on the provider's screen; Crowbo receives a code. */
  | { kind: "authorization_code"; authorize: string; token: string; pkce: boolean; extra?: Record<string, string>; scopeSeparator: " " | "," }
  /** Okta service app: Crowbo signs a JWT with the tenant's private key; the admin registered the public key. */
  | { kind: "private_key_jwt"; tokenPath: string }
  /** The admin creates an app in the provider and pastes its client id and secret (an exception). */
  | { kind: "client_credentials"; token: string }
  /** The provider offers only an API key (the one ADR exception, Drata). */
  | { kind: "api_key" };

export interface ScopeLine {
  scope: string;
  why: string;
  /** A scope that lets Crowbo write; every other scope is read-only. */
  write?: true;
  /** Scenario ids from the fixtures and profile that read through this scope. */
  scenarios: string[];
}

export interface Manifest {
  provider: string;
  label: string;
  /** The connector class this provider feeds. */
  connector: "identity" | "tickets" | "grc-platform" | "slack";
  /** The API hosts reads may go to; nothing else is fetched with this connection's token. */
  hosts: string[];
  flow: Flow;
  scopes: ScopeLine[];
  /** Days within which a pasted secret must be rotated; null for OAuth. */
  rotate_within_days: number | null;
  verified: boolean;
}

const identity = ["billing-exposure", "standing-admin-unreviewed", "leaver-access"];

export const MANIFESTS: Record<string, Manifest> = {
  okta: {
    provider: "okta", label: "Okta", connector: "identity", hosts: ["{tenant}.okta.com"],
    flow: { kind: "private_key_jwt", tokenPath: "/oauth2/v1/token" },
    scopes: [
      { scope: "okta.users.read", why: "Accounts, their status and last sign-in", scenarios: ["leaver-access", "billing-exposure"] },
      { scope: "okta.groups.read", why: "Groups and their members, and which groups administer an app", scenarios: identity },
      { scope: "okta.apps.read", why: "Each app's business owner, who decides", scenarios: ["billing-exposure", "standing-admin-unreviewed"] },
    ],
    rotate_within_days: null, verified: false,
  },
  "google-workspace": {
    provider: "google-workspace", label: "Google Workspace", connector: "identity", hosts: ["admin.googleapis.com"],
    flow: {
      kind: "authorization_code", authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
      pkce: true, scopeSeparator: " ", extra: { access_type: "offline", prompt: "consent" },
    },
    scopes: [
      { scope: "https://www.googleapis.com/auth/admin.directory.user.readonly", why: "Accounts, suspension and the admin flag", scenarios: ["leaver-access", "standing-admin-unreviewed"] },
      { scope: "https://www.googleapis.com/auth/admin.directory.group.readonly", why: "Groups and their members", scenarios: ["billing-exposure"] },
    ],
    rotate_within_days: null, verified: false,
  },
  linear: {
    provider: "linear", label: "Linear", connector: "tickets", hosts: ["api.linear.app"],
    flow: { kind: "authorization_code", authorize: "https://linear.app/oauth/authorize", token: "https://api.linear.app/oauth/token", pkce: true, scopeSeparator: "," },
    scopes: [{ scope: "read", why: "Projects (launches), their dates, leads and issues", scenarios: ["launch-without-review", "billing-exposure"] }],
    rotate_within_days: null, verified: false,
  },
  jira: {
    provider: "jira", label: "Jira", connector: "tickets", hosts: ["api.atlassian.com"],
    flow: {
      kind: "authorization_code", authorize: "https://auth.atlassian.com/authorize", token: "https://auth.atlassian.com/oauth/token",
      // Atlassian's 3LO is not documented with PKCE here; the rehearsal checks.
      pkce: false, scopeSeparator: " ", extra: { audience: "api.atlassian.com", prompt: "consent" },
    },
    scopes: [
      { scope: "read:jira-work", why: "Projects, versions (launches) and issues", scenarios: ["launch-without-review", "billing-exposure"] },
      { scope: "read:jira-user", why: "The assignee and project lead behind an issue", scenarios: ["launch-without-review"] },
      { scope: "offline_access", why: "A refresh token, so reads continue without the admin signing in again", scenarios: ["launch-without-review"] },
    ],
    rotate_within_days: null, verified: false,
  },
  slack: {
    provider: "slack", label: "Slack", connector: "slack", hosts: ["slack.com", "files.slack.com"],
    flow: { kind: "authorization_code", authorize: "https://slack.com/oauth/v2/authorize", token: "https://slack.com/api/oauth.v2.access", pkce: false, scopeSeparator: "," },
    scopes: [
      { scope: "app_mentions:read", why: "A question asked by mentioning Crowbo", scenarios: ["*"] },
      // The one deliberate write scope: Crowbo posts its own replies and the weekly list, and nothing else.
      { scope: "chat:write", why: "Write, deliberately: the reply in the thread and the weekly post; Crowbo never writes anywhere else", scenarios: ["*"], write: true },
      { scope: "im:history", why: "An export sent by direct message", scenarios: ["*"] },
      { scope: "files:read", why: "The text files of that export", scenarios: ["*"] },
    ],
    rotate_within_days: null, verified: false,
  },
  vanta: {
    provider: "vanta", label: "Vanta", connector: "grc-platform", hosts: ["api.vanta.com"],
    flow: { kind: "client_credentials", token: "https://api.vanta.com/oauth/token" },
    scopes: [{ scope: "vanta-api.all:read", why: "Controls, vendors and exceptions, read-only", scenarios: ["vendor-review-gap", "exception-drift", "unlinked-effort"] }],
    rotate_within_days: 90, verified: false,
  },
  drata: {
    provider: "drata", label: "Drata", connector: "grc-platform", hosts: ["public-api.drata.com"],
    flow: { kind: "api_key" },
    scopes: [{ scope: "read-only API key", why: "Controls, vendors and exceptions; Drata offers no OAuth for these reads", scenarios: ["vendor-review-gap", "exception-drift", "unlinked-effort"] }],
    rotate_within_days: 90, verified: false,
  },
};

export const manifest = (provider: string): Manifest => {
  const m = MANIFESTS[provider];
  if (!m) throw new Error(`No manifest for ${provider}`);
  return m;
};

/** The authorize URL for a consent flow, with exactly the manifest's scopes. */
export function authorizeUrl(provider: string, p: { clientId: string; redirectUri: string; state: string; codeChallenge?: string }): string {
  const m = manifest(provider);
  if (m.flow.kind !== "authorization_code") throw new Error(`${m.label} has no consent redirect`);
  const u = new URL(m.flow.authorize);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", p.state);
  u.searchParams.set("scope", m.scopes.map((s) => s.scope).join(m.flow.scopeSeparator));
  if (m.flow.pkce) {
    if (!p.codeChallenge) throw new Error(`${m.label} requires PKCE`);
    u.searchParams.set("code_challenge", p.codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(m.flow.extra ?? {})) u.searchParams.set(k, v);
  return u.toString();
}
