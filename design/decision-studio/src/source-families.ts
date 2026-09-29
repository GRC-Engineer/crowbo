import type { CaseId } from "./question-demo-model.ts";

// The ten questions a decision can ask of its records. Each case names the
// records that answer a family, or says why the family is not used.
// scripts/export-cases.mjs writes the same data into the case packets.
export const sourceFamilies = [
  {
    id: "finding-review",
    name: "Finding or review",
    question: "What finding or review actually needs a decision?",
    limit: "Workflow status is not verified treatment or approval.",
  },
  {
    id: "people-identity",
    name: "People and identity",
    question: "Which immutable account belongs to which custodian?",
    limit: "Names and employment do not establish permissions.",
  },
  {
    id: "effective-permissions",
    name: "Effective permissions",
    question:
      "What can the exact account or service do, including inherited grants?",
    limit: "A role catalogue is not a test of effective rights.",
  },
  {
    id: "activity-monitoring",
    name: "Activity and monitoring",
    question:
      "What happened in the observed window and what coverage is missing?",
    limit: "No observed event is not proof of no activity or no need.",
  },
  {
    id: "code-build-inventory",
    name: "Code, build and inventory",
    question: "Which change produced which artifact?",
    limit: "A merge or component match is not production treatment.",
  },
  {
    id: "deployment-verification",
    name: "Deployment and verification",
    question: "What ran, and what exact outcome was independently checked?",
    limit:
      "Implementation does not establish effective treatment or authority.",
  },
  {
    id: "policy-runbook-exception",
    name: "Policy, runbook and exception",
    question: "What requirement, boundary, approval and validity apply?",
    limit: "A request or runbook does not implement or authorise a safeguard.",
  },
  {
    id: "work-tracking",
    name: "Work tracking",
    question: "Who owns the treatment and which dependencies remain?",
    limit: "A done ticket does not prove verification or delivery authority.",
  },
  {
    id: "prior-records",
    name: "Prior records",
    question: "Which earlier incident or review makes a check relevant?",
    limit: "Past similarity does not predict the new outcome.",
  },
  {
    id: "owner-context",
    name: "Owner context",
    question:
      "Which attributed work or delivery constraint affects the choice?",
    limit:
      "A date or statement does not grant approval or make an obligation mandatory.",
  },
] as const;
export type FamilyId = (typeof sourceFamilies)[number]["id"];

export const familyCoverage: Record<
  CaseId,
  Record<FamilyId, string[] | string>
> = {
  remediation: {
    "finding-review": ["finding"],
    "people-identity":
      "Not used: service/artifact case, no person-account join needed.",
    "effective-permissions": "Not used: no access change evaluated.",
    "activity-monitoring": ["verification", "verification-failed"],
    "code-build-inventory": ["patch", "inventory"],
    "deployment-verification": ["deployment", "verification", "rollback"],
    "policy-runbook-exception": ["change-policy"],
    "work-tracking": ["treatment"],
    "prior-records": ["incident"],
    "owner-context": ["capacity", "launch-room"],
  },
  access: {
    "finding-review": ["review"],
    "people-identity": ["directory"],
    "effective-permissions": ["permissions", "roles", "daily-test"],
    "activity-monitoring": ["activity"],
    "code-build-inventory":
      "Not used: no software artifact treatment in this account review.",
    "deployment-verification": [
      "recovery-tested",
      "daily-test",
      "access-outcome",
    ],
    "policy-runbook-exception": ["policy", "recovery-unverified"],
    "work-tracking": ["review", "recovery-unavailable"],
    "prior-records": ["review"],
    "owner-context": ["owner", "calendar", "annual-task", "access-room"],
  },
  exceptions: {
    "finding-review": ["logging-gap"],
    "people-identity":
      "Not used: attributed approval is synthetic development material; no authenticated people integration.",
    "effective-permissions": "Not used: no account entitlement decision.",
    "activity-monitoring": ["logging-gap", "safeguard-test", "feed-stopped"],
    "code-build-inventory":
      "Not used: proposed app fix has no build or delivery receipt. Missing outcome remains unresolved.",
    "deployment-verification": ["safeguard-test", "daily-review"],
    "policy-runbook-exception": [
      "logging-policy",
      "safeguard-plan",
      "exception-request",
      "exception-approval",
      "validity-check",
    ],
    "work-tracking": ["logging-issue"],
    "prior-records": ["logging-incident"],
    "owner-context": ["logging-owner", "review-room"],
  },
};

// Lanes for the reading step: one per family that has a record in this set.
// A record that answers two families is shown once, in the first of them.
// `later` holds records that a prepared update would add; a lane that has
// only those is still drawn, so the reader sees where new records arrive.
export function familyLanes<T extends { id: string }>(
  caseId: CaseId,
  sources: T[],
  later: T[] = [],
): {
  id: FamilyId;
  name: string;
  question: string;
  records: T[];
  later: T[];
}[] {
  const placed = new Set<string>();
  const place = (list: T[], covered: string[] | string) => {
    const records = Array.isArray(covered)
      ? list.filter(
          (source) => covered.includes(source.id) && !placed.has(source.id),
        )
      : [];
    for (const record of records) placed.add(record.id);
    return records;
  };
  const lanes = sourceFamilies.map((family) => ({
    id: family.id,
    name: family.name,
    question: family.question,
    records: place(sources, familyCoverage[caseId][family.id]),
    later: [] as T[],
  }));
  const rest = sources.filter((source) => !placed.has(source.id));
  lanes.find((lane) => lane.id === "owner-context")?.records.push(...rest);
  for (const lane of lanes)
    lane.later = place(later, familyCoverage[caseId][lane.id]);
  return lanes.filter(
    (lane) => lane.records.length > 0 || lane.later.length > 0,
  );
}
