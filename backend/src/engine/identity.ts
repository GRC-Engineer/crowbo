import { line } from "./connectors";
import type { Connector, FetchJson, SourceRecord } from "./model";

/**
 * The identity connector: one class, several providers. A provider reads its own API into one
 * snapshot (groups and their members, the apps a group administers and their owners, accounts and
 * their status); the connector turns the snapshot into records the same way whichever provider
 * read it. Scenarios and weights name the class, "identity", never the vendor; each record keeps its
 * provider, and citations show the provider's label.
 *
 * Only fields the provider's API returns are read. What a provider does not hold (Google Workspace
 * has no app owners) is simply absent, and stays missing until another source states it.
 */

export const IDENTITY = "identity";

export type AccountStatus = "active" | "suspended" | "deprovisioned";

export interface IdentitySnapshot {
  groups: { name: string; members: string[]; administers?: string }[];
  apps: { name: string; owner: string }[];
  /** Null when the provider's account list was not read. */
  accounts: null | { email: string; status: AccountStatus; last_login_at: string | null }[];
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

/** Okta Management API: groups and their users, apps with a business owner, users with status and last login. */
export const okta: IdentityProvider = {
  id: "okta", label: "Okta",
  async snapshot(api) {
    type Group = { id: string; profile: { name: string; app?: string } };
    const groups = ((await api("/api/v1/groups")) ?? []) as Group[];
    const apps = ((await api("/api/v1/apps")) ?? []) as { name: string; profile: { businessOwner?: string } }[];
    const users = (await api("/api/v1/users")) as null | { status: string; lastLogin: string | null; profile: { login: string } }[];
    const status = (s: string): AccountStatus => (s === "ACTIVE" ? "active" : s === "DEPROVISIONED" ? "deprovisioned" : "suspended");
    return {
      groups: await Promise.all(groups.map(async (g) => ({
        name: g.profile.name, administers: g.profile.app,
        members: (((await api(`/api/v1/groups/${g.id}/users`)) ?? []) as { profile: { login: string } }[]).map((u) => u.profile.login),
      }))),
      apps: apps.filter((a) => a.profile.businessOwner).map((a) => ({ name: a.name, owner: a.profile.businessOwner! })),
      accounts: users && users.map((u) => ({ email: u.profile.login, status: status(u.status), last_login_at: u.lastLogin })),
    };
  },
};

/** Google Workspace Admin SDK Directory API: groups and members, super admins, users with suspended and archived flags. */
export const googleWorkspace: IdentityProvider = {
  id: "google-workspace", label: "Google Workspace",
  async snapshot(api) {
    type User = { primaryEmail: string; suspended?: boolean; archived?: boolean; isAdmin?: boolean; lastLoginTime?: string };
    const users = (await api("/admin/directory/v1/users?customer=my_customer")) as null | { users: User[]; etag?: string };
    const groups = ((await api("/admin/directory/v1/groups?customer=my_customer")) as null | { groups: { id: string; email: string }[] })?.groups ?? [];
    const out: IdentitySnapshot = { groups: [], apps: [], accounts: null };
    for (const g of groups) {
      const members = ((await api(`/admin/directory/v1/groups/${g.id}/members`)) as null | { members: { email: string; status?: string }[] })?.members ?? [];
      out.groups.push({ name: slug(g.email.split("@")[0]), members: members.filter((m) => m.status !== "SUSPENDED").map((m) => m.email) });
    }
    if (users) {
      const admins = users.users.filter((u) => u.isAdmin).map((u) => u.primaryEmail);
      if (admins.length) out.groups.push({ name: "workspace-super-admins", members: admins, administers: "google-workspace" });
      // The Directory API reports a user who never signed in with a 1970 timestamp.
      out.accounts = users.users.map((u) => ({
        email: u.primaryEmail, last_login_at: u.lastLoginTime && !u.lastLoginTime.startsWith("1970") ? u.lastLoginTime : null,
        status: u.archived ? "deprovisioned" : u.suspended ? "suspended" : "active",
      }));
    }
    return out;
  },
};

export const IDENTITY_PROVIDERS = { okta, "google-workspace": googleWorkspace } as const;

/** The identity connector for one provider: the same records whichever provider read the snapshot. */
export function identityConnector(provider: IdentityProvider): Connector {
  // Live state: the engine stamps each record with the time it was read, so the snapshot carries no dates.
  const base = { connector: IDENTITY, rail: "security" as const, readers: GRC, revision: 1, format: "lines" as const, provider: provider.id, observed_at: "" };
  const id = (kind: string) => `${IDENTITY}:${provider.id}/${kind}`;
  return {
    id: IDENTITY, label: provider.label, rail: "security", every_minutes: 60, live_state: true,
    async read(api) {
      const s = await provider.snapshot(api);
      const out: SourceRecord[] = [];
      for (const g of s.groups) {
        const group = `group:${g.name}`;
        const lines = [...(g.administers ? line(group, "grants_admin_on", `app:${g.administers}`) : []), ...g.members.flatMap((m) => line(person(m), "member_of", group))];
        out.push({ ...base, id: id(`group/${g.name}`), text: lines.join("\n") });
      }
      for (const a of s.apps) out.push({ ...base, id: id(`app/${a.name}`), text: line(`app:${a.name}`, "business_owner", person(a.owner)).join("\n") });
      if (s.accounts) {
        const lines = s.accounts.flatMap((u) => [
          ...line(person(u.email), "account_status", u.status),
          ...(u.last_login_at ? line(person(u.email), "last_login", day(u.last_login_at)) : []),
        ]);
        out.push({ ...base, id: id("accounts"), text: lines.join("\n") });
      }
      return out;
    },
  };
}
