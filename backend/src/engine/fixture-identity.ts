import { NORTHWIND } from "./fixture";
import { OKTA_DEPROVISIONED } from "./identity";
import type { CompanyFixture, FakeApiRoute } from "./model";

/**
 * Northwind with its identity scenarios, for the identity connector's two providers. The same
 * invented people appear in Okta's API shape and in Google Workspace's, so a test can read either
 * provider and expect the same exposure: unused privileged access (the billing case), standing admin
 * access nobody has reviewed, and leavers whose accounts are still active. The default demo
 * (NORTHWIND) is unchanged.
 *
 * The company grants the GRC lead read access to HR terminations here; without that grant the
 * leavers scenario stays unresolved, because the join cannot see who left.
 */

const DOMAIN = "northwind.example";
const email = (name: string) => `${name}@${DOMAIN}`;
const ids = Array.from({ length: 40 }, (_, i) => `u${String(i + 1).padStart(2, "0")}`);
const SINCE = "2025-01-01T00:00:00Z";
const staff = ["priya", "alex", "dana", ...ids];
/** u37 left on 30 Sep and is still active; u41 left on 31 Aug and was deprovisioned. */
const deprovisioned = new Set(["u41"]);
const admins = ["alex", "u02"];

const route = (path: string, body: unknown): FakeApiRoute => ({ path, versions: [{ from: SINCE, body }] });

const base = structuredClone(NORTHWIND);
const set = (path: string, body: unknown) => {
  base.api = base.api.filter((r) => r.path !== path);
  base.api.push(route(path, body));
};

// Okta: the admin group for Google Workspace, its app with an owner, and every user's status.
const oktaGroups = base.api.find((r) => r.path === "/api/v1/groups")!.versions.map((v) => ({
  ...v, body: [...(v.body as unknown[]), { id: "00g-wsadmin", lastMembershipUpdated: "2026-10-12T09:00:00Z", profile: { name: "workspace-super-admins", app: "google-workspace" } }],
}));
base.api = base.api.filter((r) => r.path !== "/api/v1/groups");
base.api.push({ path: "/api/v1/groups", versions: oktaGroups });
set("/api/v1/groups/00g-wsadmin/users", admins.map((a) => ({ id: `00u-${a}`, status: "ACTIVE", profile: { login: email(a) } })));
const oktaApps = base.api.find((r) => r.path === "/api/v1/apps")!.versions[0].body as unknown[];
set("/api/v1/apps", [...oktaApps, { id: "0oa-gws", name: "google-workspace", lastUpdated: "2026-08-01T10:00:00Z", profile: { businessOwner: email("dana") } }]);
// Okta lists deprovisioned users only through the status filter; u02 is locked out, which is still a live account.
set("/api/v1/users", staff.map((u) => ({ id: `00u-${u}`, status: u === "u02" ? "LOCKED_OUT" : "ACTIVE", lastLogin: "2026-10-10T08:00:00Z", profile: { login: email(u) } })));
set(OKTA_DEPROVISIONED, [...deprovisioned].map((u) => ({ id: `00u-${u}`, status: "DEPROVISIONED", lastLogin: "2026-08-30T08:00:00Z", profile: { login: email(u) } })));

// Google Workspace: the same people, groups and admins in the Directory API's shape.
set("/admin/directory/v1/users?customer=my_customer", {
  users: [...staff, "u41"].map((u) => ({ primaryEmail: email(u), suspended: false, archived: deprovisioned.has(u), isAdmin: admins.includes(u), lastLoginTime: "2026-10-10T08:00:00.000Z" })),
});
set("/admin/directory/v1/groups?customer=my_customer", { groups: [{ id: "03gbilling", email: `billing-admins@${DOMAIN}` }] });
set("/admin/directory/v1/groups/03gbilling/members?maxResults=200", { members: ids.map((u) => ({ email: email(u), role: "MEMBER", status: "ACTIVE" })) });

// HR: u41's termination, alongside u37's in the default fixture.
const workers = base.api.find((r) => r.path === "/ccx/api/v1/workers")!.versions[0].body as { asOf: string; data: unknown[] };
set("/ccx/api/v1/workers", { ...workers, total: workers.data.length + 1, data: [...workers.data, { email: email("u41"), org: "Sales", isManager: false, terminated: "2026-08-31" }] });

// The controls register records when the standing admins were last reviewed.
const controls = base.api.find((r) => r.path.startsWith("/v4/spreadsheets/controls-register"))!;
const register = controls.versions[0].body as { modifiedTime: string; values: string[][] };
controls.versions = [{ ...controls.versions[0], body: { ...register, values: [...register.values, ["C-09", "app:google-workspace", "last_reviewed_at", "2026-03-01"]] } }];

export const NORTHWIND_IDENTITY: CompanyFixture = {
  ...base,
  grants: [{ record: "workday:terminations", readers: ["grc-lead"] }],
  scenarios: [
    ...base.scenarios,
    {
      id: "standing-admin-unreviewed", title: "Standing admin access that nobody has reviewed is misused",
      frequency_per_year: { low: 0.1, high: 0.4 }, loss_per_event: { low: 100_000, high: 600_000 },
      basis: "Invented expert range for the demo",
      gap: { subject: "app:google-workspace", predicate: "review_overdue", op: "eq", value: true },
    },
    {
      id: "leaver-access", title: "Someone who left still signs in",
      frequency_per_year: { low: 0.2, high: 0.5 }, loss_per_event: { low: 50_000, high: 400_000 },
      basis: "Invented expert range for the demo",
      gap: { subject: "directory:accounts", predicate: "leavers_active", op: "gt", value: 0 },
    },
  ],
  actions: [
    ...base.actions,
    {
      id: "review-standing-admins", title: "Review the standing admins on Google Workspace and remove who no longer needs it", mode: "fix",
      control: "control:privileged-access-review", system: "app:google-workspace",
      reduces: [{ scenario: "standing-admin-unreviewed", fraction: { low: 0.5, high: 0.8 } }],
      requires: [], conditions: ["The system owner signs the review"],
      effort: { security_hours: { low: 3, high: 5 }, engineering_hours: { low: 1, high: 2 }, cash: { low: 0, high: 0 } },
      expect: { subject: "app:google-workspace", predicate: "review_overdue", op: "eq", value: false },
      basis: "Invented estimate",
    },
    {
      id: "disable-leaver-accounts", title: "Disable the accounts still active for people who left ({directory:accounts leavers_active} found)", mode: "fix",
      control: "control:leaver-deprovisioning", system: "app:google-workspace",
      reduces: [{ scenario: "leaver-access", fraction: { low: 0.8, high: 0.95 } }],
      requires: [], conditions: ["Confirm each person's last day with HR"],
      effort: { security_hours: { low: 1, high: 2 }, engineering_hours: { low: 0, high: 1 }, cash: { low: 0, high: 0 } },
      expect: { subject: "directory:accounts", predicate: "leavers_active", op: "eq", value: 0 },
      basis: "Invented estimate",
    },
  ],
  topics: [
    ...base.topics,
    {
      id: "standing-admin", question: "Who has standing admin, and when was it last reviewed?", keywords: ["standing", "super admin", "privileged", "reviewed"],
      subject: "app:google-workspace", scenario: "standing-admin-unreviewed", actions: ["review-standing-admins"],
      finding: [{ predicate: "review_overdue" }], notify: "#grc",
    },
    {
      id: "leavers", question: "Who left but can still sign in?", keywords: ["left", "leaver", "leavers", "offboard", "terminated"],
      subject: "directory:accounts", scenario: "leaver-access", actions: ["disable-leaver-accounts"],
      finding: [{ predicate: "leavers_active" }], notify: "#it",
    },
  ],
};
