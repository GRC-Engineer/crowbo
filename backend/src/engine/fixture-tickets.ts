import { NORTHWIND } from "./fixture";
import type { CompanyFixture, FakeApiRoute } from "./model";
import { jiraIssueSearch } from "./tickets";

/**
 * Northwind with an upcoming launch that handles customer data and has no security review, for the
 * tickets connector's two providers. The same launches appear in Linear's API shape and in Jira's,
 * so a test can read either provider and expect the same exposure (scenario S10). The default demo
 * (NORTHWIND) is unchanged.
 *
 * Which data classes count as customer data comes from the company's own register, not from the
 * label names: the controls register gains a data classification.
 */

const DOMAIN = "northwind.example";
const email = (name: string) => `${name}@${DOMAIN}`;
const SINCE = "2025-01-01T00:00:00Z";
const route = (path: string, body: unknown): FakeApiRoute => ({ path, versions: [{ from: SINCE, body }] });

const base = structuredClone(NORTHWIND);
const set = (path: string, body: unknown) => {
  base.api = base.api.filter((r) => r.path !== path);
  base.api.push(route(path, body));
};

const checkout = [
  { labels: ["feature:checkout-redesign", "data:customer-pii"], assignee: "alex" },
  { labels: ["feature:saved-cards", "data:payment-card"], assignee: "alex" },
];

// Linear: the checkout launch beside audit prep, with its lead and issues.
const projects = base.api.find((r) => r.path === "/graphql?query=projects")!;
const body = projects.versions[0].body as { data: { projects: { nodes: unknown[] } } };
body.data.projects.nodes.push({
  slugId: "checkout-v2", name: "Checkout v2", startDate: "2026-11-10", updatedAt: "2026-10-12T16:00:00Z", lead: { email: email("priya") },
  issues: { nodes: checkout.map((i, n) => ({ identifier: `ENG-${n + 7}`, state: { type: "started" }, assignee: { email: email(i.assignee) }, labels: { nodes: i.labels.map((name) => ({ name })) } })), pageInfo: { hasNextPage: false } },
});

// Jira: the same launches as unreleased versions of one project, and the same issues.
set("/rest/api/3/project/search", { values: [{ key: "NW", lead: { emailAddress: email("priya") } }] });
set("/rest/api/3/project/NW/versions", [
  { name: "audit-prep", releaseDate: "2026-11-24", released: false },
  { name: "checkout-v2", releaseDate: "2026-11-10", released: false },
  { name: "spring-cleanup", releaseDate: "2026-04-01", released: true },
]);
const issue = (labels: string[], assignee: string, version: string, done = false) => ({
  fields: { labels, status: { statusCategory: { key: done ? "done" : "indeterminate" } }, assignee: { emailAddress: email(assignee) }, fixVersions: [{ name: version }] },
});
set(jiraIssueSearch("NW"), {
  isLast: true,
  issues: [issue(["control:billing-admin-access"], "alex", "audit-prep"), ...checkout.map((i) => issue(i.labels, i.assignee, "checkout-v2"))],
});

// The company's data classification, in the controls register; and the checkout app's owner in Okta.
const controls = base.api.find((r) => r.path.startsWith("/v4/spreadsheets/controls-register"))!;
const register = controls.versions[0].body as { modifiedTime: string; values: string[][] };
controls.versions = [{ ...controls.versions[0], body: { ...register, values: [...register.values, ["D-01", "data:customer-pii", "customer_data", "true"], ["D-02", "data:payment-card", "customer_data", "true"]] } }];
const apps = base.api.find((r) => r.path === "/api/v1/apps")!.versions[0].body as unknown[];
set("/api/v1/apps", [...apps, { id: "0oa-checkout", name: "checkout", lastUpdated: "2026-08-01T10:00:00Z", profile: { businessOwner: email("priya") } }]);

export const NORTHWIND_TICKETS: CompanyFixture = {
  ...base,
  scenarios: [
    ...base.scenarios,
    {
      id: "launch-without-review", title: "A launch that handles customer data ships without a security review",
      frequency_per_year: { low: 0.2, high: 0.6 }, loss_per_event: { low: 80_000, high: 700_000 },
      basis: "Invented expert range for the demo",
      gap: { subject: "launch:checkout-v2", predicate: "unreviewed_customer_data", op: "eq", value: true },
    },
  ],
  actions: [
    ...base.actions,
    {
      id: "review-before-launch", title: "Run the security review of Checkout v2 before it launches", mode: "fix",
      control: "control:security-review", system: "app:checkout",
      reduces: [{ scenario: "launch-without-review", fraction: { low: 0.5, high: 0.8 } }],
      requires: [], conditions: ["Review how checkout-redesign and saved-cards handle customer and card data"],
      effort: { security_hours: { low: 4, high: 8 }, engineering_hours: { low: 2, high: 4 }, cash: { low: 0, high: 0 } },
      expect: { subject: "launch:checkout-v2", predicate: "unreviewed_customer_data", op: "eq", value: false },
      basis: "Invented estimate",
    },
  ],
  topics: [
    ...base.topics,
    {
      id: "launch-review", question: "Which launches handle customer data without a security review?", keywords: ["launch", "release", "security review", "customer data"],
      subject: "launch:checkout-v2", scenario: "launch-without-review", actions: ["review-before-launch"],
      finding: [{ predicate: "unreviewed_customer_data" }, { predicate: "security_review" }, { predicate: "start_date" }], notify: "#eng",
    },
  ],
};
