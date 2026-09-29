import type { DemoSource } from "./source-model.ts";
export const accessSources: DemoSource[] = [
  {
    id: "activity",
    label: "App activity",
    provider: "zendesk",
    feather: "series",
    influence: "supporting",
    claim: "Daily activity does not establish all required work.",
    quote:
      "For usr-042, the selected 90-day window shows tickets and own-queue exports, with no administration events. Ingestion coverage is 97%; three days are missing.",
    why: "Supports investigating narrower daily access. The window cannot cover annual recovery.",
    limit:
      "Missing days and infrequent work rule out treating absence as proof of no need.",
    period: "30 June–27 September 2026",
    revision: "activity / r1",
    record: {
      subject: "usr-042",
      scope:
        "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
      checked:
        "Prepared observation: 30 June–27 September 2026. No current refresh.",
      origin: "app-activity-042",
      links: [
        {
          label: "Exact account mapping",
          targetId: "directory",
          identity: "Zendesk usr-042 → Okta ok-042",
        },
      ],
    },
  },
  {
    id: "directory",
    label: "Account identity",
    provider: "okta",
    feather: "cluster",
    influence: "deciding",
    claim: "The account is assigned to Alex Rivera.",
    quote:
      "Mapping ID MAP-042 joins Okta immutable ID ok-042 to Zendesk account usr-042. The people record P-042 names Alex Rivera as custodian and Maya Chen as support owner.",
    why: "Defines one account and its attributable required work.",
    limit:
      "Names alone cannot join identities. Directory membership is not permission evidence or approval authority.",
    period: "28 September 2026",
    revision: "directory / r1",
    record: {
      subject: "ok-042 → usr-042",
      scope:
        "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "identity-map-042",
      links: [
        {
          label: "Effective account permissions",
          targetId: "permissions",
          identity: "MAP-042 → usr-042",
        },
        {
          label: "Approved work statement",
          targetId: "owner",
          identity: "P-042 / Maya Chen",
        },
      ],
    },
  },
  {
    id: "roles",
    label: "Role catalogue",
    provider: "zendesk",
    feather: "branch",
    influence: "deciding",
    claim: "A narrower role is possible on paper.",
    quote:
      "Role candidate support-operator-v1 allows tickets and q-7 exports without app settings or user management. The tenant supports custom roles.",
    why: "Provides a candidate that could preserve the stated daily work.",
    limit: "A catalogue is not an effective-permission or required-work test.",
    period: "28 September 2026",
    revision: "roles / r1",
    record: {
      subject: "support-operator-v1",
      scope:
        "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "role-catalogue-1",
      links: [
        {
          label: "Current inherited permissions",
          targetId: "permissions",
          identity: "usr-042",
        },
        {
          label: "Required scope",
          targetId: "policy",
          identity: "q-7 only",
        },
        {
          label: "Daily-role test",
          targetId: null,
          identity: "TEST-042 / not supplied",
        },
      ],
    },
  },
  {
    id: "calendar",
    label: "Reporting context",
    provider: "calendar",
    feather: "column",
    influence: "supporting",
    claim: "Quarter-end exports are needed tomorrow.",
    quote:
      "Quarter-end reports are planned for 30 September. Alex is assigned to prepare q-7 exports.",
    why: "Removing exports now could interrupt required work.",
    limit:
      "The date is business context, not permission to bypass a security boundary.",
    period: "28 September 2026",
    revision: "calendar / r1",
    record: {
      subject: "P-042 / quarter-end",
      scope:
        "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "reporting-calendar",
      links: [
        {
          label: "Owner-confirmed requirement",
          targetId: "owner",
          identity: "P-042 / q-7 exports",
        },
      ],
    },
  },
  {
    id: "owner",
    label: "Owner context",
    provider: "slack",
    feather: "braid",
    influence: "deciding",
    claim: "Maya confirms the account needs scoped exports.",
    quote:
      "Maya Chen: Alex uses usr-042 for tickets and the q-7 quarter-end export. Low use is not a reason to remove that task. Review exceptional workflows before changing access.",
    why: "Contradicts the reviewer’s suggestion that no recent admin activity justifies removing all reporting.",
    limit:
      "An attributed statement, not a role test or approved access change.",
    period: "28 September 2026",
    revision: "owner / r1",
    record: {
      subject: "Maya Chen → usr-042",
      scope:
        "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "owner-maya-042",
      links: [
        {
          label: "Review assertion",
          targetId: "review",
          identity: "AR-042",
        },
        {
          label: "Account mapping",
          targetId: "directory",
          identity: "MAP-042",
        },
      ],
    },
  },
  {
    id: "policy",
    label: "Access boundary",
    provider: "notion",
    feather: "spine",
    influence: "constraint",
    claim: "Exports must stay within the account’s own queue.",
    quote:
      "ACC-3: Support exports must be limited to q-7. Access changes need Maya’s review and the designated platform approver’s authorization, with effective permissions checked.",
    why: "Defines a condition every option must satisfy.",
    limit: "Policy text cannot establish enforcement or supply approval.",
    period: "28 September 2026",
    revision: "policy / v3",
    record: {
      subject: "ACC-3 v3",
      scope:
        "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "access-policy-3",
      links: [
        {
          label: "Effective scope",
          targetId: "permissions",
          identity: "usr-042 / q-7",
        },
        {
          label: "Change approval",
          targetId: null,
          identity: "AC-042 / not supplied",
        },
      ],
    },
  },
  {
    id: "permissions",
    label: "Effective privileges",
    provider: "zendesk",
    feather: "branch",
    influence: "deciding",
    claim: "An inherited group still grants Administrator.",
    quote:
      "PERM-042: usr-042 has Administrator through group support-admins. The tenant resolution includes app settings, user management and cross-queue export. Removing a direct role alone leaves the group grant.",
    why: "The treatment must cover inheritance, not merely the visible role assignment.",
    limit:
      "This snapshot establishes current rights, not whether a replacement preserves work.",
    period: "28 September 2026",
    revision: "permissions / r1",
    record: {
      subject: "usr-042 / support-admins",
      scope:
        "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "effective-permissions-042",
      links: [
        {
          label: "Account identity",
          targetId: "directory",
          identity: "usr-042 → MAP-042",
        },
        {
          label: "Candidate replacement",
          targetId: "roles",
          identity: "support-operator-v1",
        },
      ],
    },
  },
  {
    id: "review",
    label: "Review assertion",
    provider: "linear",
    feather: "column",
    influence: "supporting",
    claim: "The review proposes removing all reporting.",
    quote:
      "AR-042: Reviewer proposed removing admin and reporting because no administration events appeared in the recent window. The proposal cites the same activity extract.",
    why: "Shows a conflicting interpretation. Maya’s reporting requirement and the limited window constrain it.",
    limit:
      "Repeating the activity extract adds no independent corroboration or approval.",
    period: "28 September 2026",
    revision: "review / r1",
    record: {
      subject: "AR-042 → usr-042",
      scope:
        "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
      checked: "Prepared observation: 28 September 2026. No current refresh.",
      origin: "app-activity-042",
      links: [
        {
          label: "Original observation",
          targetId: "activity",
          identity: "AR-042 cites activity r1",
        },
        {
          label: "Conflicting work requirement",
          targetId: "owner",
          identity: "usr-042 / q-7",
        },
      ],
    },
  },
];
