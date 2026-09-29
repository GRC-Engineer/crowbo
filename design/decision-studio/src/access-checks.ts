import type { DemoSource, Recommendation } from "./source-model.ts";
export type AccessCheck =
  | "identity-unknown"
  | "daily-failed"
  | "daily-tested"
  | "observed"
  | "irrelevant";
export const accessChecks = {
  "identity-unknown": {
    label: "Try an unresolved identity",
    fromBasis: ["daily", "tested", "daily-tested", "observed"],
    source: {
      id: "directory",
      label: "Unresolved account identity",
      provider: "okta",
      feather: "cluster",
      influence: "constraint",
      claim: "The two account records cannot be reliably joined.",
      quote:
        "Alternative MAP-042 r2: The immutable Zendesk ID is absent from the people mapping. Two records share the name Alex Rivera. Neither record proves who owns usr-042.",
      why: "Stops attributing Maya’s work statement to this account without the identity join.",
      limit:
        "A matching display name is not identity evidence. Do not disclose or change another account based on it.",
      period: "28 September 2026",
      revision: "directory / r2 · alternative",
      record: {
        subject: "usr-042 / custodian unresolved",
        scope:
          "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
        checked: "Prepared observation: 28 September 2026. No current refresh.",
        origin: "identity-map-042-unresolved",
        links: [
          {
            label: "App account permissions",
            targetId: "permissions",
            identity: "usr-042; custodian not established",
          },
          {
            label: "Authoritative identity join",
            targetId: null,
            identity: "MAP-042 / immutable join missing",
          },
        ],
      },
    },
    advice: {
      title: "Resolve the account before changing access.",
      reason:
        "This alternative cannot join the account to its custodian. The earlier required-work statement may concern a different person.",
      condition:
        "Confirm the immutable account mapping and accountable owner. No permission change is supported by a name match.",
      next: "Identity owner: reconcile usr-042 with the authoritative people record.",
      support:
        "The failed identity join changes whose work the sources can establish.",
    },
    change:
      "The revised identity source removes the immutable join. The original named-person attribution is no longer supported.",
  },
  "daily-failed": {
    label: "Try a failed daily-role test",
    fromBasis: ["tested", "daily-tested", "observed"],
    source: {
      id: "daily-test",
      label: "Failed daily-role test",
      provider: "zendesk",
      feather: "branch",
      influence: "deciding",
      claim: "The proposed role cannot export its own queue.",
      quote:
        "Alternative TEST-042-F: With support-operator-v1 and the inherited Administrator grant removed in staging, usr-042 can handle tickets but its q-7 export is denied.",
      why: "The candidate role fails confirmed daily work even though the separate recovery rehearsal succeeded.",
      limit:
        "Passing recovery is not proof that the daily role fits. No production change or approval is supplied.",
      period: "30 September 2026 · controlled staging test",
      revision: "daily-test / r1-failed",
      record: {
        subject: "TEST-042-F → usr-042",
        scope:
          "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
        checked:
          "Prepared observation: 30 September 2026 · controlled staging test. No current refresh.",
        origin: "daily-role-test-failed",
        links: [
          {
            label: "Required exports",
            targetId: "owner",
            identity: "usr-042 / q-7",
          },
          {
            label: "Candidate role",
            targetId: "roles",
            identity: "support-operator-v1",
          },
        ],
      },
    },
    advice: {
      title: "Fix the daily role before rollout.",
      reason:
        "The export test fails after inherited admin is removed. Recovery access works in its rehearsal, but it cannot replace required everyday reporting.",
      condition:
        "Revise and retest effective permissions, including denied cross-queue exports. Approval is still required.",
      next: "Alex and Maya: correct the daily role and repeat the required-work checks.",
      support:
        "The failed required-work check rules out the current candidate. A successful recovery test cannot outweigh it.",
    },
    change:
      "The daily-role test contradicts the catalogue’s claimed fit. The recovery result is retained for its separate task.",
  },
  "daily-tested": {
    label: "Add the successful daily-role test",
    fromBasis: ["tested", "daily-failed"],
    source: {
      id: "daily-test",
      label: "Daily-role test",
      provider: "zendesk",
      feather: "branch",
      influence: "deciding",
      claim: "The revised role fits the required daily work.",
      quote:
        "TEST-042-P: support-operator-v2 on staging usr-042, with inherited Administrator removed, handles tickets and q-7 exports. Cross-queue export, app settings and user management are denied. Maya reviewed the recorded task results.",
      why: "Supports daily-role fit alongside the separate tested recovery path.",
      limit:
        "Staging test results do not supply production approval or observed production changes.",
      period: "30 September 2026 · controlled staging test",
      revision: "daily-test / r2-passed",
      record: {
        subject: "TEST-042-P → usr-042",
        scope:
          "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
        checked:
          "Prepared observation: 30 September 2026 · controlled staging test. No current refresh.",
        origin: "daily-role-test-passed",
        links: [
          {
            label: "Account under test",
            targetId: "directory",
            identity: "usr-042 → MAP-042",
          },
          {
            label: "Current inheritance to remove",
            targetId: "permissions",
            identity: "support-admins",
          },
          {
            label: "Tested recovery path",
            targetId: "recovery-tested",
            identity: "annual queue recovery",
          },
        ],
      },
    },
    advice: {
      title: "Propose the narrower role and recovery path.",
      reason:
        "The daily-role test preserves tickets and scoped exports. The separate rehearsal supports temporary annual recovery without standing Administrator.",
      condition:
        "The designated approver must authorise the production change. Remove the inherited grant and verify the resulting production permissions and work.",
      next: "Maya and platform approver: review the tested plan for usr-042.",
      support:
        "Two scoped tests support different required tasks. Neither is production execution or approval.",
    },
    change:
      "TEST-042-P now supplies daily-work and export-boundary checks. Production implementation remains unobserved.",
  },
  observed: {
    label: "Add permission change and outcome checks",
    fromBasis: ["daily-tested"],
    source: {
      id: "access-outcome",
      label: "Observed access outcome",
      provider: "zendesk",
      feather: "loop",
      influence: "deciding",
      claim: "The account’s production permissions and work were checked.",
      quote:
        "OUT-042: AC-042 records Maya’s review and designated platform approver Leon’s authorization. Alex applied support-operator-v2 to usr-042 and removed support-admins. A separate effective-rights read denies settings, user management and cross-queue exports; ticket handling and q-7 export succeed. Annual recovery remains the separately tested, approved-on-request path.",
      why: "Separates the proposal from the later approval, implementation and scoped outcome record.",
      limit:
        "One fictional account at the recorded time. No claim about 12 staff, future grants or live monitoring. Production annual recovery has not been exercised here.",
      period: "1 October 2026 · 11:00",
      revision: "access-outcome / r1",
      record: {
        subject: "OUT-042 / AC-042 / usr-042",
        scope:
          "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
        checked:
          "Prepared observation: 1 October 2026 · 11:00. No current refresh.",
        origin: "production-access-check-042",
        links: [
          {
            label: "Tested role basis",
            targetId: "daily-test",
            identity: "TEST-042-P / support-operator-v2",
          },
          {
            label: "Recovery rehearsal",
            targetId: "recovery-tested",
            identity: "annual task; staging scope",
          },
        ],
      },
    },
    advice: {
      title: "The scoped change is observed. Retain the record.",
      reason:
        "The later record supplies attributed approval, removal of inherited admin, and successful production checks for this account’s daily work.",
      condition:
        "This does not generalise to other accounts. Reassess changed permissions or required work; production annual recovery remains unobserved.",
      next: "Maya: retain the checks and review the annual recovery arrangement when due.",
      support:
        "The outcome record stands apart from the recorded next step. It shows the approved change and its scoped results.",
    },
    change:
      "OUT-042 adds later attributed authorization, observed implementation and scoped daily-work results.",
  },
  irrelevant: {
    label: "Try irrelevant meeting context",
    fromBasis: ["daily"],
    source: {
      id: "access-room",
      label: "Meeting context",
      provider: "calendar",
      feather: "column",
      influence: "context",
      claim: "The access review moved to a different room.",
      quote:
        "The review moved to Room C. The account, required work, reporting date and policy are unchanged.",
      why: "Adds no deciding fact or changed condition.",
      limit: "A meeting update cannot justify changing permissions.",
      period: "28 September 2026",
      revision: "access-room / r1",
      record: {
        subject: "Access review meeting",
        scope:
          "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
        checked: "Prepared observation: 28 September 2026. No current refresh.",
        origin: "access-review-room",
        links: [],
      },
    },
    advice: {
      title: "Test a role that fits the work.",
      reason:
        "Keep tickets and own-queue exports. Remove broad administration after the owner reviews the role and its permissions are tested.",
      condition:
        "Owner review and a controlled permissions check are still needed.",
      next: "Review and test the proposed support role",
      support:
        "The catalogue supports the role. Its effective permissions are untested.",
    },
    change:
      "Only the meeting room changed. The recommendation and its unresolved conditions remain the same.",
  },
} satisfies Record<
  AccessCheck,
  {
    label: string;
    fromBasis: string[];
    source: DemoSource;
    advice: Recommendation;
    change: string;
  }
>;
