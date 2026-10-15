import { NORTHWIND } from "./fixture";
import type { CompanyFixture, FakeApiRoute } from "./model";

/**
 * Northwind with its GRC platform, for the connector's two providers (Vanta, Drata). The same
 * controls, vendors and exceptions appear in each provider's API shape, so a test can read either
 * and expect the same exposure: S5 (a vendor with customer data unreviewed for a year), S6 (an
 * exception past its review date or signed by someone who left) and S7 (a control taking recurring
 * hours with no linked risk, obligation or commitment: the drop). The default demo is unchanged.
 *
 * The GRC lead may read HR terminations here, by the company's grant; without it S6 checks review
 * dates only and says the signers were not checked.
 */

const DOMAIN = "northwind.example";
const email = (name: string) => `${name}@${DOMAIN}`;
const SINCE = "2025-01-01T00:00:00Z";
const route = (path: string, body: unknown): FakeApiRoute => ({ path, versions: [{ from: SINCE, body }] });

/** The platform's content, once: providers below put it in their own shapes. */
export const GRC_CONTENT = {
  controls: [
    { key: "quarterly-access-screenshots", owner: "dana", automated: false, tests: null, evidence: "2026-10-01", hours: 24, risks: [], obligations: [], commitments: [] },
    { key: "billing-admin-access", owner: "alex", automated: true, tests: { passing: 18, total: 20 }, evidence: "2026-10-12", hours: 2, risks: ["billing-misuse"], obligations: ["soc2-cc6-1"], commitments: [] },
    { key: "vendor-review", owner: "dana", automated: false, tests: null, evidence: "2026-06-30", hours: 6, risks: [], obligations: [], commitments: ["msa-security-schedule"] },
  ],
  vendors: [
    { key: "payroll-provider", data: ["employee-pii"], reviewed: "2026-05-01" },
    { key: "support-desk", data: ["customer-pii"], reviewed: null },
    { key: "analytics", data: ["customer-pii"], reviewed: "2025-06-01" },
    { key: "email-delivery", data: ["customer-pii"], reviewed: "2026-02-15" },
  ],
  exceptions: [
    { key: "EX-1", control: "billing-admin-access", signer: "u37", review_by: "2027-01-31" },
    { key: "EX-2", control: "vendor-review", signer: "dana", review_by: "2026-09-30" },
    { key: "EX-3", control: "quarterly-access-screenshots", signer: "priya", review_by: "2027-03-01" },
  ],
};
const C = GRC_CONTENT;

const base = structuredClone(NORTHWIND);
const set = (path: string, body: unknown) => {
  base.api = base.api.filter((r) => r.path !== path);
  base.api.push(route(path, body));
};
const vantaPage = (data: unknown[]) => ({ results: { data, pageInfo: { hasNextPage: false } } });

set("/v1/controls", vantaPage(C.controls.map((c) => ({
  id: c.key, owner: { emailAddress: email(c.owner) }, isAutomated: c.automated, testSummary: c.tests, lastEvidenceAt: `${c.evidence}T09:00:00Z`,
  hoursPerQuarter: c.hours, linkedRisks: c.risks, linkedRequirements: c.obligations, linkedCommitments: c.commitments,
}))));
set("/v1/vendors", vantaPage(C.vendors.map((v) => ({ id: v.key, dataClasses: v.data, lastSecurityReviewAt: v.reviewed && `${v.reviewed}T00:00:00Z` }))));
set("/v1/exceptions", vantaPage(C.exceptions.map((e) => ({ id: e.key, controlId: e.control, approver: { emailAddress: email(e.signer) }, expiresAt: e.review_by }))));

set("/public/controls", { total: C.controls.length, data: C.controls.map((c) => ({
  code: c.key, owners: [{ email: email(c.owner) }], monitored: c.automated, monitors: c.tests, evidenceUpdatedAt: `${c.evidence}T09:00:00Z`,
  effortHoursPerQuarter: c.hours, risks: c.risks.map((code) => ({ code })), requirements: c.obligations.map((code) => ({ code })), commitments: c.commitments.map((code) => ({ code })),
})) });
set("/public/vendors", { total: C.vendors.length, data: C.vendors.map((v) => ({ name: v.key, dataTypes: v.data, reviewedAt: v.reviewed })) });
set("/public/exceptions", { total: C.exceptions.length, data: C.exceptions.map((e) => ({ code: e.key, control: { code: e.control }, signedBy: { email: email(e.signer) }, reviewDate: e.review_by })) });

// The company's data classification, in the controls register; and the GRC platform's owner in Okta.
const controls = base.api.find((r) => r.path.startsWith("/v4/spreadsheets/controls-register"))!;
const register = controls.versions[0].body as { modifiedTime: string; values: string[][] };
controls.versions = [{ ...controls.versions[0], body: { ...register, values: [...register.values, ["D-01", "data:customer-pii", "customer_data", "true"], ["D-03", "data:employee-pii", "customer_data", "false"]] } }];
const apps = base.api.find((r) => r.path === "/api/v1/apps")!.versions[0].body as unknown[];
set("/api/v1/apps", [...apps, { id: "0oa-grc", name: "bookmark", label: "grc-platform", lastUpdated: "2026-08-01T10:00:00Z", profile: { businessOwner: email("dana") } }]);

export const NORTHWIND_GRC: CompanyFixture = {
  ...base,
  grants: [{ record: "workday:terminations", readers: ["grc-lead"] }],
  weights: [...base.weights, { connector: "grc-platform", weight: 4, max_age_days: 7, set_by: "grc-lead", reason: "The compliance platform the auditor uses; read-only" }],
  scenarios: [
    ...base.scenarios,
    {
      id: "vendor-review-gap", title: "A vendor handling customer data has a breach we did not review for",
      frequency_per_year: { low: 0.1, high: 0.3 }, loss_per_event: { low: 100_000, high: 800_000 }, basis: "Invented expert range for the demo",
      gap: { subject: "vendors:all", predicate: "unreviewed_customer_data_vendors", op: "gt", value: 0 },
    },
    {
      id: "exception-drift", title: "An exception outlives its reason or its signer",
      frequency_per_year: { low: 0.1, high: 0.3 }, loss_per_event: { low: 50_000, high: 300_000 }, basis: "Invented expert range for the demo",
      gap: { subject: "exceptions:all", predicate: "exceptions_needing_review", op: "gt", value: 0 },
    },
    {
      id: "unlinked-effort", title: "Hours go to controls that protect nothing anyone has named",
      frequency_per_year: { low: 0.01, high: 0.05 }, loss_per_event: { low: 10_000, high: 50_000 }, basis: "Invented expert range for the demo",
      gap: { subject: "controls:all", predicate: "unlinked_effort_controls", op: "gt", value: 0 },
    },
  ],
  actions: [
    ...base.actions,
    {
      id: "review-customer-data-vendors", title: "Review the vendors handling customer data with no review in a year ({vendors:all unreviewed_customer_data_vendors} found)", mode: "fix",
      control: "control:vendor-review", system: "app:grc-platform",
      reduces: [{ scenario: "vendor-review-gap", fraction: { low: 0.4, high: 0.7 } }], requires: [], conditions: ["Start with the vendors never reviewed"],
      effort: { security_hours: { low: 6, high: 10 }, engineering_hours: { low: 0, high: 0 }, cash: { low: 0, high: 0 } },
      expect: { subject: "vendors:all", predicate: "unreviewed_customer_data_vendors", op: "eq", value: 0 }, basis: "Invented estimate",
    },
    {
      id: "re-sign-exceptions", title: "Re-sign or close the exceptions past review or signed by someone who left ({exceptions:all exceptions_needing_review} found)", mode: "fix",
      control: "control:exception-management", system: "app:grc-platform",
      reduces: [{ scenario: "exception-drift", fraction: { low: 0.6, high: 0.9 } }], requires: [], conditions: ["A current owner signs each one, or it is closed"],
      effort: { security_hours: { low: 2, high: 4 }, engineering_hours: { low: 0, high: 0 }, cash: { low: 0, high: 0 } },
      expect: { subject: "exceptions:all", predicate: "exceptions_needing_review", op: "eq", value: 0 }, basis: "Invented estimate",
    },
    {
      id: "drop-unlinked-controls", title: "Stop the work on controls tied to no risk, obligation or commitment ({controls:all unlinked_effort_controls} found)", mode: "drop",
      control: "control:unlinked-controls", system: "app:grc-platform",
      reduces: [{ scenario: "unlinked-effort", fraction: { low: -0.01, high: 0 } }],
      requires: [{ subject: "controls:all", predicate: "unlinked_effort_controls", op: "gt", value: 0 }], conditions: ["Confirm with each control's owner that nothing depends on it"],
      effort: { security_hours: { low: 1, high: 2 }, engineering_hours: { low: 0, high: 0 }, cash: { low: 0, high: 0 } },
      frees: { security_hours: { low: 80, high: 96 }, engineering_hours: { low: 0, high: 0 } }, basis: "Invented estimate: 24 hours a quarter",
    },
  ],
  topics: [
    ...base.topics,
    {
      id: "control-assurance", question: "How well is billing admin access assured?", keywords: ["assured", "assurance", "coverage", "tests"],
      subject: "control:billing-admin-access", scenario: "billing-exposure", actions: [],
      finding: [{ predicate: "assurance_class" }, { predicate: "coverage" }, { predicate: "evidence_collected_at" }], notify: "#grc",
    },
    {
      id: "vendors", question: "Which vendors with customer data have not been reviewed?", keywords: ["vendor", "vendors", "supplier", "third party"],
      subject: "vendors:all", scenario: "vendor-review-gap", actions: ["review-customer-data-vendors"], finding: [{ predicate: "unreviewed_customer_data_vendors" }], notify: "#grc",
    },
    {
      id: "exceptions", question: "Which exceptions need re-signing?", keywords: ["exception", "exceptions", "waiver", "risk acceptance"],
      subject: "exceptions:all", scenario: "exception-drift", actions: ["re-sign-exceptions"], finding: [{ predicate: "exceptions_needing_review" }], notify: "#grc",
    },
    {
      id: "unlinked-controls", question: "Which control work can we stop?", keywords: ["stop", "unlinked", "drop", "busywork"],
      subject: "controls:all", scenario: "unlinked-effort", actions: ["drop-unlinked-controls"], finding: [{ predicate: "unlinked_effort_controls" }], notify: "#grc",
    },
  ],
};
