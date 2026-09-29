import type { DemoCase, DemoSource, Recommendation } from "./source-model.ts";
export type WorkflowId = "remediation" | "exceptions";
export type WorkflowStage = {
  id: string;
  label: string;
  sources: DemoSource[];
  advice: Recommendation;
  change: string;
  status: string;
  options: string[];
  focus: string[];
};
export type WorkflowCase = DemoCase & {
  id: WorkflowId;
  specVersion: string;
  initial: WorkflowStage;
  stages: WorkflowStage[];
  irrelevant: DemoSource;
};

const records = {
  finding: {
    id: "finding",
    label: "Authentication finding",
    provider: "linear",
    feather: "mesh",
    influence: "deciding",
    claim: "The production gateway accepts an invalid session.",
    quote:
      "SEC-142: A controlled check on gateway 2.8.0 accepted a session without the required signature check on /session/restore. Treatment: deploy 2.8.1 and repeat that check on all serving replicas.",
    why: "Establishes a specific exposure and a verifiable treatment.",
    limit:
      "Fictional finding, not a real advisory. Other endpoints and environments were not tested.",
    period: "28 September 2026",
    revision: "finding / r1",
    record: {
      subject: "SEC-142 · gateway 2.8.0",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "security-check-142",
      links: [
        {
          label: "Affected production artifact",
          targetId: "inventory",
          identity: "gw-prod-eu → artifact gw:2.8.0",
        },
        {
          label: "Treatment issue",
          targetId: "treatment",
          identity: "SEC-142 → REM-142",
        },
      ],
    },
  },
  treatment: {
    id: "treatment",
    label: "Completed ticket",
    provider: "linear",
    feather: "column",
    influence: "deciding",
    claim: "The ticket says done; production is still affected.",
    quote:
      'REM-142 is marked Done because PR-87 merged. Closure note: "fixed in main". No deployment or retest receipt is attached.',
    why: "Conflicts with the production artifact record. Workflow status does not close the exposure.",
    limit:
      "The closure note repeats PR-87; it is not independent verification.",
    period: "28 September 2026",
    revision: "treatment / r1",
    record: {
      subject: "REM-142 → SEC-142",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "github-pr-87",
      links: [
        {
          label: "Original merged patch",
          targetId: "patch",
          identity: "REM-142 → PR-87",
        },
        {
          label: "Affected artifact",
          targetId: "inventory",
          identity: "gw-prod-eu",
        },
      ],
    },
  },
  patch: {
    id: "patch",
    label: "Merged patch",
    provider: "github",
    feather: "merge",
    influence: "supporting",
    claim: "The fix exists in the release artifact.",
    quote:
      "PR-87 merged as commit c87a. Build B-281 maps c87a to artifact gw:2.8.1. Unit signature checks pass. The customer sign-in configuration is not covered.",
    why: "Connects the intended fix to an identifiable build.",
    limit:
      "Merge and unit tests establish neither deployment nor relevant end-to-end verification.",
    period: "28 September 2026",
    revision: "patch / r1",
    record: {
      subject: "PR-87 · c87a · B-281",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "github-pr-87",
      links: [
        {
          label: "Production artifact",
          targetId: "inventory",
          identity: "B-281 → gw:2.8.1; compare gw-prod-eu",
        },
        {
          label: "Relevant regression",
          targetId: "incident",
          identity: "customer configuration acme-eu",
        },
      ],
    },
  },
  inventory: {
    id: "inventory",
    label: "Production artifact",
    provider: "aws",
    feather: "object",
    influence: "deciding",
    claim: "All three serving replicas still run 2.8.0.",
    quote:
      "Deployment inventory: gw-prod-eu replicas a, b and c serve gw:2.8.0. The release catalogue contains gw:2.8.1 but no production receipt.",
    why: "The affected version is still serving traffic despite the completed ticket.",
    limit: "Snapshot of one environment; not a full organisation inventory.",
    period: "28 September 2026",
    revision: "inventory / r1",
    record: {
      subject: "gw-prod-eu / replicas a,b,c",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "deployment-inventory",
      links: [
        {
          label: "Finding for this version",
          targetId: "finding",
          identity: "gw:2.8.0 → SEC-142",
        },
        {
          label: "Expected build",
          targetId: "patch",
          identity: "gw:2.8.1 → B-281",
        },
        {
          label: "Production deployment receipt",
          targetId: null,
          identity: "gw-prod-eu / B-281 / not supplied",
        },
      ],
    },
  },
  incident: {
    id: "incident",
    label: "Earlier sign-in incident",
    provider: "linear",
    feather: "loop",
    influence: "supporting",
    claim: "The prior rollout broke one customer configuration.",
    quote:
      "INC-38: A previous session parser change rejected acme-eu sign-in. Rollback restored service. The launch uses this same configuration.",
    why: "Defines a relevant regression check before rollout.",
    limit:
      "Similarity warrants testing; it does not predict this patch will fail.",
    period: "12 August 2026",
    revision: "incident / r1",
    record: {
      subject: "INC-38 · acme-eu",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked: "Prepared observation: 12 August 2026. No current refresh.",
      origin: "incident-38",
      links: [
        {
          label: "Patch to test",
          targetId: "patch",
          identity: "acme-eu configuration",
        },
      ],
    },
  },
  "change-policy": {
    id: "change-policy",
    label: "Release conditions",
    provider: "notion",
    feather: "spine",
    influence: "constraint",
    claim: "Deployment needs an approved window and a rollback path.",
    quote:
      "CHG-4: Gateway releases need the service owner’s approval, a demonstrated rollback path and post-deployment verification bound to the release artifact.",
    why: "These are conditions, not weights other inputs can outweigh.",
    limit:
      "This policy is not approval for PR-87. The approval record is absent.",
    period: "28 September 2026",
    revision: "change-policy / v2",
    record: {
      subject: "CHG-4 v2",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "policy-change-4",
      links: [
        {
          label: "Change approval",
          targetId: null,
          identity: "CHG-87 / no approval record",
        },
      ],
    },
  },
  capacity: {
    id: "capacity",
    label: "Launch context",
    provider: "slack",
    feather: "braid",
    influence: "context",
    claim: "There is time for a controlled check before Friday.",
    quote:
      "Nora, service owner: I can test on Wednesday. Friday’s customer launch uses acme-eu. Keep rollback available.",
    why: "Makes a controlled rollout feasible without treating the deadline as permission.",
    limit:
      "Attributed availability is not an approved change window or accepted risk.",
    period: "28 September 2026",
    revision: "capacity / r1",
    record: {
      subject: "Nora · gw-prod-eu",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "owner-statement-nora",
      links: [
        {
          label: "Regression to exercise",
          targetId: "incident",
          identity: "acme-eu",
        },
        {
          label: "Delivery work",
          targetId: "treatment",
          identity: "REM-142",
        },
      ],
    },
  },
  deployment: {
    id: "deployment",
    label: "Deployment receipt",
    provider: "aws",
    feather: "object",
    influence: "deciding",
    claim: "The patched artifact is now on all serving replicas.",
    quote:
      "D-281: At 10:10, gw-prod-eu a,b,c changed to gw:2.8.1 / B-281 / c87a. The receipt names CHG-87, but its approval record is not supplied. No post-deployment security check is attached.",
    why: "Resolves deployment identity. Verification and change-authority evidence remain separate.",
    limit:
      "A receipt proves the observed deployment, not approval, correctness or closure.",
    period: "30 September 2026 · 10:10",
    revision: "deployment / r1",
    record: {
      subject: "D-281 · B-281",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked:
        "Prepared observation: 30 September 2026 · 10:10. No current refresh.",
      origin: "deployment-281",
      links: [
        {
          label: "Release build",
          targetId: "patch",
          identity: "B-281 → c87a",
        },
        {
          label: "Security finding",
          targetId: "finding",
          identity: "SEC-142",
        },
        {
          label: "Referenced approval",
          targetId: null,
          identity: "CHG-87 / not supplied",
        },
      ],
    },
  },
  verification: {
    id: "verification",
    label: "Scoped security check",
    provider: "datadog",
    feather: "loop",
    influence: "deciding",
    claim: "The signature check passes on the deployed artifact.",
    quote:
      "V-281: At 10:25, replicas a,b,c reported gw:2.8.1. Invalid signatures were denied on /session/restore; valid acme-eu sign-in succeeded. Suri, security reviewer, recorded the probes and responses.",
    why: "Supports proposed closure for SEC-142 in this exact scope.",
    limit:
      "Does not cover other endpoints or future rollbacks. Closure still needs the accountable reviewer; this test cannot supply missing change approval.",
    period: "30 September 2026 · 10:25",
    revision: "verification / r1",
    record: {
      subject: "V-281 → D-281",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked:
        "Prepared observation: 30 September 2026 · 10:25. No current refresh.",
      origin: "security-retest-281",
      links: [
        {
          label: "Observed deployment",
          targetId: "deployment",
          identity: "V-281 → D-281 / B-281",
        },
        {
          label: "Closure scope",
          targetId: "finding",
          identity: "SEC-142 /session/restore",
        },
      ],
    },
  },
  "verification-failed": {
    id: "verification-failed",
    label: "Failed sign-in check",
    provider: "datadog",
    feather: "loop",
    influence: "deciding",
    claim: "The security check passes, but customer sign-in fails.",
    quote:
      "Alternative V-281-F: On B-281 in gw-prod-eu, invalid signatures are denied; valid acme-eu sessions fail. Rollback has been requested, not observed.",
    why: "The treatment breaks required work. Resolve or roll back under the release process and retain the security exposure if reverting.",
    limit:
      "A rollback request is not a rollback receipt. The old artifact would remain affected.",
    period: "30 September 2026 · 10:25",
    revision: "verification-failed / r1",
    record: {
      subject: "V-281-F → D-281",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked:
        "Prepared observation: 30 September 2026 · 10:25. No current refresh.",
      origin: "security-retest-281-f",
      links: [
        {
          label: "Deployed artifact",
          targetId: "deployment",
          identity: "B-281",
        },
        {
          label: "Earlier matching symptom",
          targetId: "incident",
          identity: "acme-eu",
        },
      ],
    },
  },
  rollback: {
    id: "rollback",
    label: "Rollback observed",
    provider: "aws",
    feather: "object",
    influence: "deciding",
    claim: "Service recovered; the affected version is back.",
    quote:
      "D-280-R: All gw-prod-eu replicas again serve gw:2.8.0. Valid sign-in succeeds. The signature-bypass finding still applies; no successful security retest is supplied.",
    why: "Reopens the treatment question instead of treating service recovery as security closure.",
    limit: "Operational recovery is not mitigation of SEC-142.",
    period: "30 September 2026 · 11:00",
    revision: "rollback / r1",
    record: {
      subject: "D-280-R · gw:2.8.0",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked:
        "Prepared observation: 30 September 2026 · 11:00. No current refresh.",
      origin: "rollback-280",
      links: [
        {
          label: "Original exposure",
          targetId: "finding",
          identity: "gw:2.8.0 → SEC-142",
        },
      ],
    },
  },
  "logging-policy": {
    id: "logging-policy",
    label: "Logging requirement",
    provider: "notion",
    feather: "spine",
    influence: "constraint",
    claim: "Admin changes must reach the protected audit sink.",
    quote:
      "LOG-7 v3: Capture actor, action, target and time for privileged billing-admin changes. Forward to the protected sink. A deviation needs a scoped, time-bounded approval by the security owner.",
    why: "Establishes the applicable requirement and exception authority.",
    limit: "The requirement does not prove delivery or approve a deviation.",
    period: "28 September 2026",
    revision: "logging-policy / v3",
    record: {
      subject: "LOG-7 v3",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "logging-policy-7",
      links: [
        {
          label: "Observed gap",
          targetId: "logging-gap",
          identity: "billing-admin prod-eu",
        },
        {
          label: "Exception request",
          targetId: "exception-request",
          identity: "LOG-7 → EX-19",
        },
      ],
    },
  },
  "logging-gap": {
    id: "logging-gap",
    label: "Coverage check",
    provider: "datadog",
    feather: "series",
    influence: "deciding",
    claim: "Privilege-change events are missing.",
    quote:
      "CHK-19: Test privilege changes on billing-admin prod-eu emit app-local events but do not reach the protected sink. Export actions do reach it.",
    why: "Identifies the exact missing coverage. The existing feed is only partial.",
    limit:
      "One sampled action set on 28 September. Unchecked actions remain unknown.",
    period: "28 September 2026",
    revision: "logging-gap / r1",
    record: {
      subject: "CHK-19 · billing-admin prod-eu",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "sink-check-19",
      links: [
        {
          label: "Applicable requirement",
          targetId: "logging-policy",
          identity: "LOG-7",
        },
        {
          label: "Tracking issue",
          targetId: "logging-issue",
          identity: "CHK-19 → ISS-19",
        },
      ],
    },
  },
  "logging-issue": {
    id: "logging-issue",
    label: "Logging issue",
    provider: "linear",
    feather: "column",
    influence: "deciding",
    claim: "The issue says covered; its basis is a vendor claim.",
    quote:
      'ISS-19: Owner marked "covered by gateway logs" from the delivery discussion. No actor-level sink test is attached. Fix scheduled for 7 October.',
    why: "Conflicts with CHK-19. The ticket and discussion share a claim, not two independent checks.",
    limit: "Status and a schedule do not establish coverage or capacity.",
    period: "28 September 2026",
    revision: "logging-issue / r1",
    record: {
      subject: "ISS-19 → LOG-7",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "delivery-discussion-19",
      links: [
        {
          label: "Contradicting test",
          targetId: "logging-gap",
          identity: "ISS-19 → CHK-19",
        },
        {
          label: "Original discussion",
          targetId: "logging-owner",
          identity: "delivery discussion 19",
        },
      ],
    },
  },
  "logging-owner": {
    id: "logging-owner",
    label: "Delivery context",
    provider: "slack",
    feather: "braid",
    influence: "supporting",
    claim: "The fix competes with the billing release.",
    quote:
      "Inez, service owner: Gateway logs should cover this until the 7 October app fix. The billing release uses the same delivery team. The earlier actor-field incident is relevant.",
    why: "Supports checking an interim option and validating feasibility with Inez.",
    limit: "Neither the date nor the assertion grants a logging exception.",
    period: "28 September 2026",
    revision: "logging-owner / r1",
    record: {
      subject: "Inez · ISS-19",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "delivery-discussion-19",
      links: [
        {
          label: "Earlier missing-field incident",
          targetId: "logging-incident",
          identity: "billing-admin actor field",
        },
        {
          label: "Issue repeating this claim",
          targetId: "logging-issue",
          identity: "ISS-19",
        },
      ],
    },
  },
  "logging-incident": {
    id: "logging-incident",
    label: "Earlier logging incident",
    provider: "linear",
    feather: "loop",
    influence: "context",
    claim: "An earlier feed omitted the acting identity.",
    quote:
      "INC-9: Gateway logs included the route and timestamp, but omitted the authenticated admin ID needed to review a privilege change.",
    why: "Makes the actor field a specific safeguard test, rather than trusting event counts.",
    limit: "Past failure does not prove the new forwarding arrangement fails.",
    period: "18 August 2026",
    revision: "logging-incident / r1",
    record: {
      subject: "INC-9",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked: "Prepared observation: 18 August 2026. No current refresh.",
      origin: "incident-9",
      links: [
        {
          label: "Interim arrangement",
          targetId: "safeguard-plan",
          identity: "billing-admin actor field",
        },
      ],
    },
  },
  "safeguard-plan": {
    id: "safeguard-plan",
    label: "Interim safeguard plan",
    provider: "notion",
    feather: "mesh",
    influence: "supporting",
    claim: "A gateway feed and daily review are proposed.",
    quote:
      "Plan SG-19: Forward actor, action, target and time through a restricted gateway feed; Inez reviews it daily. This would cover only prod-eu privileged changes until the app fix.",
    why: "Gives a bounded alternative to evaluate if immediate remediation is infeasible.",
    limit:
      "No successful end-to-end test or daily review observation is supplied yet.",
    period: "28 September 2026",
    revision: "safeguard-plan / r1",
    record: {
      subject: "SG-19",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "safeguard-plan-19",
      links: [
        {
          label: "Required fields",
          targetId: "logging-policy",
          identity: "LOG-7",
        },
        {
          label: "Safeguard test",
          targetId: null,
          identity: "TEST-SG-19 / not supplied",
        },
      ],
    },
  },
  "exception-request": {
    id: "exception-request",
    label: "Exception request",
    provider: "notion",
    feather: "object",
    influence: "constraint",
    claim: "An exception is requested, not approved.",
    quote:
      "EX-19: Inez requests a deviation for prod-eu privilege-change forwarding through 7 October, conditional on the SG-19 feed and daily review. Status: requested. Approver: security owner.",
    why: "Keeps a request separate from authority, safeguards and expiry.",
    limit:
      "No approval is supplied. The request does not authorise continuing the gap.",
    period: "28 September 2026",
    revision: "exception-request / r1",
    record: {
      subject: "EX-19 → ISS-19",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "exception-request-19",
      links: [
        {
          label: "Related issue",
          targetId: "logging-issue",
          identity: "EX-19 → ISS-19",
        },
        {
          label: "Required safeguard",
          targetId: "safeguard-plan",
          identity: "EX-19 → SG-19",
        },
        {
          label: "Approval record",
          targetId: null,
          identity: "EX-19 / approval absent",
        },
      ],
    },
  },
  "safeguard-test": {
    id: "safeguard-test",
    label: "Independent safeguard test",
    provider: "datadog",
    feather: "loop",
    influence: "deciding",
    claim: "The interim feed delivered the required fields.",
    quote:
      "TEST-SG-19: Suri generated privilege changes on prod-eu. The protected sink contained actor, action, target and time for each probe. Delivery stopped when access to the sink was revoked in the negative check.",
    why: "Demonstrates selected fields and the scope of the interim feed.",
    limit:
      "Does not approve a deviation or prove tomorrow’s delivery. Daily review remains a separate requirement.",
    period: "30 September 2026 · 09:00",
    revision: "safeguard-test / r1",
    record: {
      subject: "TEST-SG-19 → SG-19",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked:
        "Prepared observation: 30 September 2026 · 09:00. No current refresh.",
      origin: "independent-test-sg-19",
      links: [
        {
          label: "Plan tested",
          targetId: "safeguard-plan",
          identity: "TEST-SG-19 → SG-19",
        },
        {
          label: "Requested scope",
          targetId: "exception-request",
          identity: "EX-19 / prod-eu",
        },
      ],
    },
  },
  "exception-approval": {
    id: "exception-approval",
    label: "Attributed approval",
    provider: "notion",
    feather: "object",
    influence: "constraint",
    claim: "A bounded deviation is approved with conditions.",
    quote:
      "APR-19: Jules, designated security owner under LOG-7, approves EX-19 for prod-eu privilege changes until 7 October 2026 at 18:00 UTC. Requires SG-19 delivery, daily review and the app fix tracked in ISS-19.",
    why: "Supplies attributed authority for this synthetic scope and period.",
    limit:
      "Does not waive conditions, approve other environments or renew automatically.",
    period: "30 September 2026 · 10:00",
    revision: "exception-approval / r1",
    record: {
      subject: "APR-19 → EX-19",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked:
        "Prepared observation: 30 September 2026 · 10:00. No current refresh.",
      origin: "approval-19",
      links: [
        {
          label: "Approved request",
          targetId: "exception-request",
          identity: "APR-19 → EX-19",
        },
        {
          label: "Authority rule",
          targetId: "logging-policy",
          identity: "Jules / designated security owner / LOG-7",
        },
        {
          label: "Tested condition",
          targetId: "safeguard-test",
          identity: "SG-19",
        },
      ],
    },
  },
  "daily-review": {
    id: "daily-review",
    label: "Daily review observation",
    provider: "linear",
    feather: "loop",
    influence: "supporting",
    claim: "The first required review is recorded.",
    quote:
      "REV-19: Inez compared the expected prod-eu privilege changes with the SG-19 sink at 16:00. No missing action was found in that window.",
    why: "Supports the daily-review condition for this observed day only.",
    limit: "Not evidence of any later daily review.",
    period: "30 September 2026 · 16:00",
    revision: "daily-review / r1",
    record: {
      subject: "REV-19 → SG-19",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked:
        "Prepared observation: 30 September 2026 · 16:00. No current refresh.",
      origin: "daily-review-19",
      links: [
        {
          label: "Approval conditions",
          targetId: "exception-approval",
          identity: "APR-19",
        },
      ],
    },
  },
  "validity-check": {
    id: "validity-check",
    label: "Expiry check",
    provider: "notion",
    feather: "column",
    influence: "constraint",
    claim: "The approved period has ended.",
    quote:
      "At 8 October 2026 09:00 UTC, APR-19 is past its 7 October 18:00 expiry. No renewed approval or verified app fix is supplied.",
    why: "The previous approval cannot support the current deviation.",
    limit:
      "This is a prepared future checkpoint, not a live timer or automatic monitoring.",
    period: "8 October 2026 · 09:00",
    revision: "validity-check / r1",
    record: {
      subject: "APR-19 / validity",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked:
        "Prepared observation: 8 October 2026 · 09:00. No current refresh.",
      origin: "expiry-check-19",
      links: [
        {
          label: "Original approval",
          targetId: "exception-approval",
          identity: "APR-19 ends 2026-10-07T18:00Z",
        },
        {
          label: "Missing verified fix",
          targetId: null,
          identity: "ISS-19 / outcome not supplied",
        },
      ],
    },
  },
  "feed-stopped": {
    id: "feed-stopped",
    label: "Stopped feed",
    provider: "datadog",
    feather: "series",
    influence: "deciding",
    claim: "The approved safeguard is no longer delivering.",
    quote:
      "At 1 October 09:00, expected privilege-change probes do not arrive at the sink. Monitoring records a stopped forwarding feed. App-local records still exist.",
    why: "A condition of APR-19 has failed inside the approval period.",
    limit:
      "Approval is not a substitute for an effective safeguard. No alternative is demonstrated.",
    period: "1 October 2026 · 09:00",
    revision: "feed-stopped / r1",
    record: {
      subject: "SG-19 / feed",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked:
        "Prepared observation: 1 October 2026 · 09:00. No current refresh.",
      origin: "feed-check-oct1",
      links: [
        {
          label: "Conditional approval",
          targetId: "exception-approval",
          identity: "APR-19 requires SG-19",
        },
      ],
    },
  },
  "expanded-scope": {
    id: "expanded-scope",
    label: "Additional environment",
    provider: "aws",
    feather: "mesh",
    influence: "deciding",
    claim: "A second environment is outside the approval.",
    quote:
      "Deployment inventory now includes billing-admin prod-us with the same missing sink coverage. APR-19 names prod-eu only.",
    why: "The existing exception cannot authorise the additional scope.",
    limit:
      "Matching service names cannot broaden approval. prod-us controls remain unverified.",
    period: "1 October 2026",
    revision: "expanded-scope / r1",
    record: {
      subject: "billing-admin prod-us",
      scope: "Acme billing-admin · prod-us",
      checked: "Prepared observation: 1 October 2026. No current refresh.",
      origin: "inventory-us",
      links: [
        {
          label: "Existing scope limit",
          targetId: "exception-approval",
          identity: "APR-19 / prod-eu only",
        },
        {
          label: "prod-us approval",
          targetId: null,
          identity: "No approval record for prod-us",
        },
      ],
    },
  },
} satisfies Record<string, DemoSource>;
const remediation = {
  id: "remediation",
  specVersion: "1.0.0",
  label: "Remediation tracking",
  question:
    "The gateway security fix is merged. What should happen next, and can we close the finding?",
  scope: "Acme gateway · gw-prod-eu · customer sign-in",
  irrelevant: {
    id: "launch-room",
    label: "Irrelevant context",
    provider: "slack",
    feather: "braid",
    influence: "context",
    claim: "The launch meeting moved rooms.",
    quote:
      "Nora: Friday’s launch briefing is now in Room C. The service, window, test capacity and customer configuration are unchanged.",
    why: "Does not alter the treatment, authority, scope or deciding checks.",
    limit:
      "This is an irrelevant-context variation, not new security evidence.",
    period: "30 September 2026",
    revision: "launch-room / r1",
    record: {
      subject: "Launch briefing",
      scope: "Acme gateway · gw-prod-eu · customer sign-in",
      checked: "Prepared observation: 30 September 2026. No current refresh.",
      origin: "meeting-room-update",
      links: [],
    },
  },
  alternatives: [
    {
      title: "Close at merge",
      tradeoff:
        "The completed ticket cannot establish production treatment. The affected version is still serving.",
    },
    {
      title: "Defer until after launch",
      tradeoff:
        "Avoids rollout disruption now but leaves the observed exposure. No interim treatment or acceptance is established.",
    },
  ],
  challenge: {
    title: "Are we mistaking completion for an outcome?",
    body: "A ticket, a merge and a deployment answer different questions. The customer configuration also needs to keep working.",
    check:
      "Bind the scoped security and sign-in checks to the deployed artifact.",
    sourceId: "treatment",
  },
  stages: [
    {
      id: "open",
      focus: ["finding", "inventory", "change-policy"],
      label: "Merged fix",
      advice: {
        title: "Merge is a start. Verify the fix in production.",
        reason:
          "The ticket is done, but the affected gateway is still serving traffic. Plan the approved rollout and test the actual customer sign-in path.",
        condition:
          "Nora must resolve the change window and rollback check. Closure is unsupported until the scoped security check passes on every serving replica.",
        next: "Nora: confirm the window, rollout and verification owner.",
        support:
          "The production version decides this next step. A completed ticket repeats the patch review and adds no independent confirmation.",
      },
      change: "Initial selected basis.",
      status: "Merged · deployment missing · verification missing",
      options: ["deployed", "irrelevant"],
      sources: [
        records["finding"],
        records["treatment"],
        records["patch"],
        records["inventory"],
        records["incident"],
        records["change-policy"],
        records["capacity"],
      ],
    },
    {
      id: "deployed",
      focus: ["finding", "deployment", "change-policy"],
      label: "Add deployment receipt",
      advice: {
        title: "Deployed. Keep the finding open.",
        reason:
          "The build identity now matches the fix on all three replicas. We still need the security check and the customer sign-in check on this deployment.",
        condition:
          "Suri must verify SEC-142 against D-281. Missing change-approval evidence remains a separate follow-up.",
        next: "Suri: run the scoped security and sign-in checks.",
        support:
          "Deployment answers where the code runs. It does not answer whether the treatment worked.",
      },
      change:
        "D-281 establishes deployment of B-281; it does not establish verification.",
      status: "Merged · deployed · verification missing",
      options: ["verified", "failed", "irrelevant"],
      sources: [
        records["finding"],
        records["treatment"],
        records["patch"],
        records["inventory"],
        records["incident"],
        records["change-policy"],
        records["capacity"],
        records["deployment"],
      ],
    },
    {
      id: "verified",
      focus: ["deployment", "verification", "change-policy"],
      label: "Add successful verification",
      advice: {
        title: "Propose closure for this finding.",
        reason:
          "The fixed artifact is deployed and the scoped security and sign-in checks pass. Suri can review closure of SEC-142 for gw-prod-eu.",
        condition:
          "Closure is a proposal for this finding only. Resolve the missing CHG-87 approval record separately; future drift is not monitored by this demo.",
        next: "Suri: review V-281 and record the scoped closure decision.",
        support:
          "The observed deployment and independent check support this proposal; they do not prove security outside the tested scope.",
      },
      change:
        "V-281 supplies the missing outcome check. The earlier completed ticket was insufficient.",
      status: "Merged · deployed · verified · closure proposed",
      options: ["rollback", "irrelevant"],
      sources: [
        records["finding"],
        records["treatment"],
        records["patch"],
        records["inventory"],
        records["incident"],
        records["change-policy"],
        records["capacity"],
        records["deployment"],
        records["verification"],
      ],
    },
    {
      id: "failed",
      focus: ["verification-failed", "deployment", "change-policy"],
      label: "Try failed verification",
      advice: {
        title: "The treatment broke required work.",
        reason:
          "Valid customer sign-in fails. Keep SEC-142 open and ask Nora to resolve the regression under the release process.",
        condition:
          "Rollback is only requested. Reverting restores the vulnerable version, so a revised treatment or authorised interim arrangement is needed.",
        next: "Nora and Suri: review rollback and the remaining exposure.",
        support:
          "A passed signature check cannot compensate for a failed required workflow.",
      },
      change:
        "The relevant sign-in test failed; the next step changes even though the patch is deployed.",
      status: "Deployed · required workflow failed · finding open",
      options: ["rollback", "verified", "irrelevant"],
      sources: [
        records["finding"],
        records["treatment"],
        records["patch"],
        records["inventory"],
        records["incident"],
        records["change-policy"],
        records["capacity"],
        records["deployment"],
        records["verification-failed"],
      ],
    },
    {
      id: "rollback",
      focus: ["rollback", "finding", "change-policy"],
      label: "Add rollback receipt",
      advice: {
        title: "Recovered service. Unresolved exposure.",
        reason:
          "The rollback restores sign-in and the affected artifact. Re-plan treatment of SEC-142 with the service and security owners.",
        condition:
          "No safeguard, accepted exception or successful security retest is established for 2.8.0.",
        next: "Nora and Suri: agree a revised fix and scoped verification.",
        support:
          "The later artifact observation supersedes the earlier deployment for current state.",
      },
      change:
        "D-280-R shows the affected version serving again. Prior verification cannot close a reverted deployment.",
      status: "Rollback observed · vulnerable version serving",
      options: ["deployed", "irrelevant"],
      sources: [
        records["finding"],
        records["treatment"],
        records["patch"],
        records["inventory"],
        records["incident"],
        records["change-policy"],
        records["capacity"],
        records["deployment"],
        records["rollback"],
      ],
    },
  ],
} satisfies Omit<WorkflowCase, "initial" | "sources" | "baseline">;
const exceptions = {
  id: "exceptions",
  specVersion: "1.0.0",
  label: "Issues and exceptions",
  question:
    "A production service is missing required admin audit logs. Should we remediate now or request a time-limited exception?",
  scope: "Acme billing-admin · prod-eu · privileged admin actions",
  irrelevant: {
    id: "review-room",
    label: "Irrelevant context",
    provider: "slack",
    feather: "braid",
    influence: "context",
    claim: "The review meeting title changed.",
    quote:
      "The weekly review is now called Billing readiness. Owners, required fields, scope, delivery dates and approval conditions are unchanged.",
    why: "Does not change any prerequisite for the decision.",
    limit: "This is an irrelevant-context variation.",
    period: "30 September 2026",
    revision: "review-room / r1",
    record: {
      subject: "Review meeting",
      scope: "Acme billing-admin · prod-eu · privileged admin actions",
      checked: "Prepared observation: 30 September 2026. No current refresh.",
      origin: "review-title-update",
      links: [],
    },
  },
  alternatives: [
    {
      title: "Remediate immediately",
      tradeoff:
        "Closes the intended gap after verification, but Inez must confirm feasible delivery and displaced billing work.",
    },
    {
      title: "Request a bounded deviation",
      tradeoff:
        "Needs scoped approval, effective safeguards and an expiry. A request alone gives no authority.",
    },
    {
      title: "Accept the ticket status",
      tradeoff:
        "Contradicted by the direct sink test. It leaves the required fields unverified.",
    },
  ],
  challenge: {
    title: "Does “logs exist” mean the right actions are reviewable?",
    body: "Event volume can look healthy while the acting identity is missing. Two records repeat the same gateway claim.",
    check:
      "Test actor, action, target and time end to end, then inspect approval separately.",
    sourceId: "logging-gap",
  },
  stages: [
    {
      id: "open",
      focus: ["logging-gap", "logging-issue", "exception-request"],
      label: "Logging gap",
      advice: {
        title: "Test the safeguard. Keep approval separate.",
        reason:
          'The sink test contradicts the "covered" ticket. Remediation remains the target; a bounded interim arrangement is only an option if its coverage works and the right owner approves.',
        condition:
          "Inez must confirm delivery feasibility. The security owner must decide any deviation. The requested exception grants no authority.",
        next: "Inez: arrange an actor-level safeguard test and prepare the scoped request.",
        support:
          "The selected sources establish the gap, not effective compensation or approval.",
      },
      change: "Initial selected basis.",
      status: "Gap observed · safeguard untested · request only",
      options: ["tested", "irrelevant"],
      sources: [
        records["logging-policy"],
        records["logging-gap"],
        records["logging-issue"],
        records["logging-owner"],
        records["logging-incident"],
        records["safeguard-plan"],
        records["exception-request"],
      ],
    },
    {
      id: "tested",
      focus: ["safeguard-test", "exception-request", "logging-policy"],
      label: "Add safeguard test",
      advice: {
        title: "The safeguard works in the test. Approval is still missing.",
        reason:
          "The independent test supports the interim feed for prod-eu. Ask Jules to decide the bounded request while Inez keeps remediation moving.",
        condition:
          "The request remains unapproved. Daily review and delivery feasibility need accountable confirmation.",
        next: "Jules: review EX-19, its conditions and the expiry.",
        support:
          "A successful test answers effectiveness in its scope. It cannot authorise a deviation.",
      },
      change:
        "TEST-SG-19 resolves the initial coverage doubt. It does not turn the request into approval.",
      status: "Safeguard tested · exception unapproved",
      options: ["approved", "irrelevant"],
      sources: [
        records["logging-policy"],
        records["logging-gap"],
        records["logging-issue"],
        records["logging-owner"],
        records["logging-incident"],
        records["safeguard-plan"],
        records["exception-request"],
        records["safeguard-test"],
      ],
    },
    {
      id: "approved",
      focus: ["exception-approval", "safeguard-test", "daily-review"],
      label: "Add approval and review records",
      advice: {
        title: "Use the bounded arrangement. Keep the fix moving.",
        reason:
          "APR-19 supplies approval and REV-19 records the first daily check. The gap remains open while Inez delivers the app fix.",
        condition:
          "Valid only through 7 October at 18:00 UTC, for prod-eu, with feed delivery and daily review. Later compliance is unobserved.",
        next: "Inez: continue the daily checks and verify the app fix before expiry.",
        support:
          "The approval, test and review are separate records. This does not close the underlying logging issue.",
      },
      change:
        "Attributed approval and a daily review now support the interim arrangement as of 30 September.",
      status: "Approved for scope · first review observed · issue open",
      options: ["expired", "stopped", "expanded", "irrelevant"],
      sources: [
        records["logging-policy"],
        records["logging-gap"],
        records["logging-issue"],
        records["logging-owner"],
        records["logging-incident"],
        records["safeguard-plan"],
        records["exception-request"],
        records["safeguard-test"],
        records["exception-approval"],
        records["daily-review"],
      ],
    },
    {
      id: "expired",
      focus: ["validity-check", "exception-approval", "logging-issue"],
      label: "Try expiry without a fix",
      advice: {
        title: "The approval expired. Reassess the gap.",
        reason:
          "The prior arrangement cannot support continued deviation after its end date. Escalate the unresolved logging gap to Jules and Inez.",
        condition:
          "No renewed approval or verified remediation is supplied. Do not imply automatic renewal.",
        next: "Jules and Inez: decide the immediate treatment of the unresolved gap.",
        support:
          "The unchanged approval is historical evidence; its validity is no longer current.",
      },
      change:
        "The assessment date crossed APR-19’s expiry. Historical approval remains inspectable.",
      status: "Approval expired · verified fix missing",
      options: ["irrelevant"],
      sources: [
        records["logging-policy"],
        records["logging-gap"],
        records["logging-issue"],
        records["logging-owner"],
        records["logging-incident"],
        records["safeguard-plan"],
        records["exception-request"],
        records["safeguard-test"],
        records["exception-approval"],
        records["daily-review"],
        records["validity-check"],
      ],
    },
    {
      id: "stopped",
      focus: ["feed-stopped", "exception-approval", "logging-gap"],
      label: "Try a stopped feed",
      advice: {
        title: "A required safeguard failed. Reopen the decision.",
        reason:
          "The feed stopped while the exception period was still open. Its date alone cannot sustain the conditional arrangement.",
        condition:
          "Restore and verify the feed or seek another explicitly authorised response. The gap remains unresolved.",
        next: "Inez and Jules: respond to failed delivery and reassess EX-19.",
        support:
          "The new failed probe changes the effective safeguard state; yesterday’s successful test is retained.",
      },
      change: "The later failed delivery check defeats a condition of APR-19.",
      status: "Approval in date · safeguard failed",
      options: ["irrelevant"],
      sources: [
        records["logging-policy"],
        records["logging-gap"],
        records["logging-issue"],
        records["logging-owner"],
        records["logging-incident"],
        records["safeguard-plan"],
        records["exception-request"],
        records["safeguard-test"],
        records["exception-approval"],
        records["daily-review"],
        records["feed-stopped"],
      ],
    },
    {
      id: "expanded",
      focus: ["expanded-scope", "exception-approval", "logging-policy"],
      label: "Try expanded scope",
      advice: {
        title: "The new environment needs its own decision.",
        reason:
          "APR-19 is limited to prod-eu. Confirm prod-us coverage and treatment instead of extending the old approval by analogy.",
        condition:
          "No prod-us approval or demonstrated safeguard is supplied. prod-eu records do not establish prod-us coverage.",
        next: "Inez and Jules: scope the prod-us gap and its required response.",
        support:
          "This changes the subject scope, not the wording of the existing approval.",
      },
      change: "A new environment lies outside the earlier approval.",
      status: "prod-eu scoped approval · prod-us unresolved",
      options: ["irrelevant"],
      sources: [
        records["logging-policy"],
        records["logging-gap"],
        records["logging-issue"],
        records["logging-owner"],
        records["logging-incident"],
        records["safeguard-plan"],
        records["exception-request"],
        records["safeguard-test"],
        records["exception-approval"],
        records["daily-review"],
        records["expanded-scope"],
      ],
    },
  ],
} satisfies Omit<WorkflowCase, "initial" | "sources" | "baseline">;
function complete(
  definition: Omit<WorkflowCase, "initial" | "sources" | "baseline">,
): WorkflowCase {
  const initial = definition.stages.find((stage) => stage.id === "open");
  if (!initial) throw new Error("Missing initial workflow stage");
  return {
    ...definition,
    initial,
    sources: initial.sources,
    baseline: initial.advice,
  };
}
export const workflowCases: Record<WorkflowId, WorkflowCase> = {
  remediation: complete(remediation),
  exceptions: complete(exceptions),
};
