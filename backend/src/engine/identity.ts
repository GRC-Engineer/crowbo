import { line } from "./connectors";
import type { Completeness, Connector, FetchJson, SourceRecord } from "./model";
import { collect, completeness, linked, type Listing } from "./paging";

/**
 * The identity connector: one class, several providers. A provider reads its own API into one
 * snapshot (groups and their members, the apps a group administers and their owners, accounts with
 * their status and the apps each person administers); the connector turns the snapshot into records
 * the same way whichever provider read it. Scenarios and weights name the class, "identity", never
 * the vendor; each record keeps its provider, and citations show the provider's label.
 *
 * Every list is read page by page and says whether it was read completely (completeness on each
 * record); a join over a list read in part stays unresolved. Only fields the provider's API returns
 * are read: what a provider does not hold (Google Workspace has no app owners) stays missing.
 */

export const IDENTITY = "identity";

export type AccountStatus = "active" | "suspended" | "deprovisioned";

export interface IdentitySnapshot {
  groups: { name: string; members: Listing<string>; administers?: string }[];
  /** Whether the list of groups itself was read completely. */
  groupsComplete: boolean;
  apps: Listing<{ name: string; owner: string }>;
  /** Null when the provider's account list was not read. */
  accounts: null | Listing<{ email: string; status: AccountStatus; last_login_at: string | null; admin_of: string[] }>;
}

export interface IdentityProvider {
  id: string;
  label: string;
  snapshot(api: FetchJson): Promise<IdentitySnapshot>;
}

const person = (email: string) => `person:${email.split("@")[0].toLowerCase()}`;
const day = (iso: string) => iso.slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
const GRC = ["grc-lead"];

/**
 * Okta's lifecycle states: only SUSPENDED and DEPROVISIONED accounts cannot sign in. LOCKED_OUT,
 * PASSWORD_EXPIRED, RECOVERY, STAGED and PROVISIONED are live accounts and count as active.
 */
export function oktaStatus(s: string): AccountStatus {
  return s === "DEPROVISIONED" ? "deprovisioned" : s === "SUSPENDED" ? "suspended" : "active";
}

/** Okta's users endpoint omits deprovisioned users unless asked; this filter lists them. */
export const OKTA_DEPROVISIONED = "/api/v1/users?filter=status%20eq%20%22DEPROVISIONED%22";

/** Okta Management API, paged by Link header: groups and their users, apps with a business owner, users. */
export const okta: IdentityProvider = {
  id: "okta", label: "Okta",
  async snapshot(api) {
    type Group = { id: string; profile: { name: string; app?: string } };
    type User = { status: string; lastLogin: string | null; profile: { login: string } };
    const groups = await linked<Group>(api, "/api/v1/groups", (g) => g.id);
    const apps = await linked<{ name: string; profile: { businessOwner?: string } }>(api, "/api/v1/apps", (a) => a.name);
    const live = await linked<User>(api, "/api/v1/users", (u) => u.profile.login);
    const gone = await linked<User>(api, OKTA_DEPROVISIONED, (u) => u.profile.login);
    const users = [...live.items, ...gone.items.filter((g) => !live.items.some((u) => u.profile.login === g.profile.login))];
    const out: IdentitySnapshot = {
      groups: [],
      groupsComplete: groups.complete,
      apps: { complete: apps.complete, items: apps.items.filter((a) => a.profile.businessOwner).map((a) => ({ name: a.name, owner: a.profile.businessOwner! })) },
      accounts: live.items.length || gone.items.length
        ? { complete: live.complete && gone.complete, items: users.map((u) => ({ email: u.profile.login, status: oktaStatus(u.status), last_login_at: u.lastLogin, admin_of: [] })) }
        : null,
    };
    for (const g of groups.items) {
      const members = await linked<{ profile: { login: string } }>(api, `/api/v1/groups/${g.id}/users`, (u) => u.profile.login);
      out.groups.push({ name: g.profile.name, administers: g.profile.app, members: { complete: members.complete, items: members.items.map((u) => u.profile.login) } });
    }
    return out;
  },
};

/** Google Workspace Admin SDK Directory API, paged by nextPageToken: groups and members, users with their admin flag. */
export const googleWorkspace: IdentityProvider = {
  id: "google-workspace", label: "Google Workspace",
  async snapshot(api) {
    type User = { primaryEmail: string; suspended?: boolean; archived?: boolean; isAdmin?: boolean; lastLoginTime?: string };
    const tokenPaged = <T>(base: string, field: string, key: (item: T) => string) => collect<T>(base, async (path) => {
      const r = (await api(path)) as null | (Record<string, unknown> & { nextPageToken?: string });
      if (!r) return null;
      return { items: (r[field] as T[] | undefined) ?? [], next: r.nextPageToken ? `${base}&pageToken=${encodeURIComponent(r.nextPageToken)}` : null };
    }, key);
    const users = await tokenPaged<User>("/admin/directory/v1/users?customer=my_customer", "users", (u) => u.primaryEmail);
    const groups = await tokenPaged<{ id: string; email: string }>("/admin/directory/v1/groups?customer=my_customer", "groups", (g) => g.id);
    const out: IdentitySnapshot = { groups: [], groupsComplete: groups.complete, apps: { items: [], complete: true }, accounts: null };
    for (const g of groups.items) {
      const members = await tokenPaged<{ email: string; status?: string }>(`/admin/directory/v1/groups/${g.id}/members?maxResults=200`, "members", (m) => m.email);
      out.groups.push({ name: slug(g.email.split("@")[0]), members: { complete: members.complete, items: members.items.filter((m) => m.status !== "SUSPENDED").map((m) => m.email) } });
    }
    if (users.items.length || users.complete) {
      out.accounts = {
        complete: users.complete,
        // The Directory API reports a user who never signed in with a 1970 timestamp.
        items: users.items.map((u) => ({
          email: u.primaryEmail, last_login_at: u.lastLoginTime && !u.lastLoginTime.startsWith("1970") ? u.lastLoginTime : null,
          status: u.archived ? "deprovisioned" : u.suspended ? "suspended" : "active",
          // A super admin administers the Workspace itself; nothing depends on a group name.
          admin_of: u.isAdmin ? ["google-workspace"] : [],
        })),
      };
    }
    return out;
  },
};

export const IDENTITY_PROVIDERS = { okta, "google-workspace": googleWorkspace } as const;

/** The identity connector for one provider: the same records whichever provider read the snapshot. */
export function identityConnector(provider: IdentityProvider): Connector {
  // Live state: the engine stamps each record with the time it was read, so the snapshot carries no dates.
  const record = (kind: string, lines: string[], c: Completeness): SourceRecord => ({
    id: `${IDENTITY}:${provider.id}/${kind}`, connector: IDENTITY, rail: "security", readers: GRC, revision: 1, format: "lines",
    provider: provider.id, observed_at: "", text: lines.join("\n"), completeness: c,
  });
  return {
    id: IDENTITY, label: provider.label, rail: "security", every_minutes: 60, live_state: true,
    async read(api) {
      const s = await provider.snapshot(api);
      const out: SourceRecord[] = [];
      for (const g of s.groups) {
        const group = `group:${g.name}`;
        const lines = [...(g.administers ? line(group, "grants_admin_on", `app:${g.administers}`) : []), ...g.members.items.flatMap((m) => line(person(m), "member_of", group))];
        out.push(record(`group/${g.name}`, lines, completeness(g.members, "members")));
      }
      // The group list itself: a join over admin-granting groups needs to know it saw them all.
      out.push(record("groups", line("listing:identity.groups", "read", s.groupsComplete ? "complete" : "partial"), { read: s.groups.length, total: s.groupsComplete ? s.groups.length : null, of: "groups" }));
      for (const a of s.apps.items) out.push(record(`app/${a.name}`, line(`app:${a.name}`, "business_owner", person(a.owner)), completeness(s.apps, "apps")));
      if (s.accounts) {
        const lines = s.accounts.items.flatMap((u) => [
          ...line(person(u.email), "account_status", u.status),
          ...(u.last_login_at ? line(person(u.email), "last_login", day(u.last_login_at)) : []),
          ...u.admin_of.flatMap((app) => line(person(u.email), "admin_of", `app:${app}`)),
        ]);
        out.push(record("accounts", lines, completeness(s.accounts, "accounts")));
      }
      return out;
    },
  };
}
