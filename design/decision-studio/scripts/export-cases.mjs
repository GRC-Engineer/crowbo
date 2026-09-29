import { readFile, writeFile } from "node:fs/promises";
import { demoCases } from "../src/question-demo-model.ts";
import { workflowCases } from "../src/workflow-cases.ts";
import {
  accessAdvice,
  basisLabels,
  versionSources,
  availableFollowups,
  revisionReasons,
} from "../src/access-review-model.ts";

const families = [
  {
    id: "finding-review",
    question: "What finding or review actually needs a decision?",
    limit: "Workflow status is not verified treatment or approval.",
  },
  {
    id: "people-identity",
    question: "Which immutable account belongs to which custodian?",
    limit: "Names and employment do not establish permissions.",
  },
  {
    id: "effective-permissions",
    question:
      "What can the exact account or service do, including inherited grants?",
    limit: "A role catalogue is not a test of effective rights.",
  },
  {
    id: "activity-monitoring",
    question:
      "What happened in the observed window and what coverage is missing?",
    limit: "No observed event is not proof of no activity or no need.",
  },
  {
    id: "code-build-inventory",
    question: "Which change produced which artifact?",
    limit: "A merge or component match is not production treatment.",
  },
  {
    id: "deployment-verification",
    question: "What ran, and what exact outcome was independently checked?",
    limit:
      "Implementation does not establish effective treatment or authority.",
  },
  {
    id: "policy-runbook-exception",
    question: "What requirement, boundary, approval and validity apply?",
    limit: "A request or runbook does not implement or authorise a safeguard.",
  },
  {
    id: "work-tracking",
    question: "Who owns the treatment and which dependencies remain?",
    limit: "A done ticket does not prove verification or delivery authority.",
  },
  {
    id: "prior-records",
    question: "Which earlier incident or review makes a check relevant?",
    limit: "Past similarity does not predict the new outcome.",
  },
  {
    id: "owner-context",
    question:
      "Which attributed work or delivery constraint affects the choice?",
    limit:
      "A date or statement does not grant approval or make an obligation mandatory.",
  },
];
const coverage = {
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
const access = {
  id: "access",
  specVersion: "1.0.0",
  label: demoCases.access.label,
  question: demoCases.access.question,
  scope: demoCases.access.scope,
  initialStage: "daily",
  stages: Object.keys(accessAdvice).map((basis) => ({
    id: basis,
    label: basisLabels[basis],
    advice: accessAdvice[basis],
    change:
      basis === "daily" ? "Initial selected basis." : revisionReasons[basis],
    sources: versionSources({ number: 1, basis }),
    options: availableFollowups(basis).map((prompt) =>
      prompt.action.type === "challenge"
        ? "recovery-known"
        : prompt.action.status,
    ),
  })),
};
const cases = [workflowCases.remediation, access, workflowCases.exceptions];
const checkOnly = process.argv.includes("--check");
for (const entry of cases) {
  const sourceRecords = new Map();
  const ref = (source) => {
    const key = `${source.id}@${source.revision}`;
    const previous = sourceRecords.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(source))
      throw new Error(`Conflicting source revision: ${key}`);
    sourceRecords.set(key, source);
    return key;
  };
  const stages = entry.stages.map(({ sources, ...stage }) => ({
    ...stage,
    sourceRefs: sources.map(ref),
  }));
  const packet = {
    schemaVersion: "crowbo.synthetic-workflow.v1",
    provenance: {
      author: "Codex synthetic development fixture",
      humanReview: "Not yet qualified",
      status:
        "Candidate authored advice; not a backend run or evaluation answer key",
      data: "Fictional Acme records. No customer material.",
      influence: "Authored categories only; no measured weights or confidence.",
    },
    id: entry.id,
    specVersion: entry.specVersion,
    question: entry.question,
    scope: entry.scope,
    initialStage: entry.id === "access" ? "daily" : "open",
    alternatives:
      entry.id === "access"
        ? demoCases.access.alternatives
        : entry.alternatives,
    challenge:
      entry.id === "access" ? demoCases.access.challenge : entry.challenge,
    stages,
    irrelevantOverlay:
      entry.id === "access"
        ? null
        : {
            sourceRef: ref(entry.irrelevant),
            behavior:
              "Append this source to the selected stage; preserve its advice and all conditions. Explicit reassessment only. Do not append twice.",
          },
    sourceRecords: Object.fromEntries(sourceRecords),
    sourceFamilies: families.map((family) => ({
      ...family,
      coverage: coverage[entry.id][family.id],
    })),
    replayBoundary:
      "Use this packet for development replay only. Backend run receipts and differences must be retained separately; the frontend does not call backend tools.",
  };
  const path = new URL(`../fixtures/${entry.id}.v1.json`, import.meta.url);
  const expected = JSON.stringify(packet, null, 2) + "\n";
  if (checkOnly) {
    if ((await readFile(path, "utf8")) !== expected)
      throw new Error(`${entry.id} packet drifted. Run npm run cases:export.`);
  } else await writeFile(path, expected);
}
console.log(
  checkOnly
    ? "Three shared case packets match their authored sources."
    : "Exported three versioned synthetic case packets.",
);
