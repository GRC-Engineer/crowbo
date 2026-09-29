export type Scenario = "baseline" | "roles-unavailable" | "owner-unconfirmed";
export type Page = "nest" | "feathers" | "flock" | "log" | "settings";

export const scenarios: { id: Scenario; label: string; detail: string }[] = [
  {
    id: "baseline",
    label: "The current basis",
    detail: "Custom role available. Reporting need confirmed.",
  },
  {
    id: "roles-unavailable",
    label: "The role is not available",
    detail: "Our plan does not support custom permissions.",
  },
  {
    id: "owner-unconfirmed",
    label: "The reporting need is unclear",
    detail: "The owner has not confirmed quarter-end exports.",
  },
];

export type Feather = {
  id: string;
  source: string;
  title: string;
  summary: string;
  quote: string;
  influence: string;
  limit: string;
  revision: string;
  period: string;
  checked: string;
  kind: "observation" | "context" | "constraint";
  status: string;
};

export const feathers: Feather[] = [
  {
    id: "activity",
    source: "App activity",
    title: "The work is tickets and reports.",
    summary: "90 days of observed work",
    quote:
      "Support members handled tickets and exported their queue reports. No app-settings or user-management events were observed in the selected activity window.",
    influence:
      "Supports a narrower role. No observed administration does not mean administration is never needed.",
    limit:
      "Emergency and infrequent work may fall outside this observation window.",
    revision: "activity / r17",
    period: "30 June – 27 September 2026",
    checked: "28 Sep 2026 · 09:02",
    kind: "observation",
    status: "Observed",
  },
  {
    id: "directory",
    source: "People directory",
    title: "12 people. One support team.",
    summary: "Membership and accountable owner",
    quote:
      "Twelve support staff hold the Administrator role. Maya Chen is the support owner; Alex Rivera is the platform delivery lead.",
    influence:
      "Defines the scope and people needed for review. Directory membership does not establish authority to approve.",
    limit:
      "Synthetic directory snapshot. No person is authenticated by this prototype.",
    revision: "directory / r8",
    period: "Snapshot on 28 September 2026",
    checked: "28 Sep 2026 · 08:52",
    kind: "context",
    status: "Mapped",
  },
  {
    id: "roles",
    source: "Role catalogue",
    title: "A narrower role is possible.",
    summary: "Custom permissions available",
    quote:
      "The platform supports a custom role with ticket handling and own-queue report exports, without app-settings or user-management permissions.",
    influence:
      "Makes the proposed alternative feasible. If custom roles are unavailable, the next step must change.",
    limit:
      "The role has not been created or tested. Effective permissions still need a controlled check.",
    revision: "roles / r3",
    period: "Catalogue checked on 28 September 2026",
    checked: "28 Sep 2026 · 08:56",
    kind: "observation",
    status: "Available",
  },
  {
    id: "calendar",
    source: "Work calendar",
    title: "Quarter-end is close.",
    summary: "Reporting window · 30 September",
    quote:
      "The support team produces queue reports for quarter-end. Reporting remains part of the work during this review.",
    influence: "Removing exports now could interrupt required reporting.",
    limit:
      "Timing alone does not establish a legal or non-deferrable obligation.",
    revision: "calendar / r5",
    period: "Quarter-end on 30 September 2026",
    checked: "28 Sep 2026 · 08:00",
    kind: "context",
    status: "Context",
  },
  {
    id: "owner",
    source: "Owner context",
    title: "“We still need those exports.”",
    summary: "Infrequent work, explicitly confirmed",
    quote:
      "We do not export reports every week, but we need our queue exports for quarter-end. Keep that ability when changing the role.",
    influence:
      "Preserve own-queue exports. Infrequent use is not the same as unnecessary access.",
    limit:
      "An attributed synthetic statement. The proposed role still needs owner review.",
    revision: "owner / r2",
    period: "Owner statement on 27 September 2026",
    checked: "27 Sep 2026 · 14:30",
    kind: "context",
    status: "Confirmed",
  },
  {
    id: "policy",
    source: "Access policy",
    title: "Only their own queue.",
    summary: "A boundary, not a weight",
    quote:
      "Support exports must be restricted to records in the team’s own queue. Any proposed role must preserve this scope.",
    influence:
      "Every option must satisfy this boundary. Other inputs cannot outweigh it.",
    limit:
      "Illustrative policy. Enforcement must be checked in the actual platform.",
    revision: "policy / v3",
    period: "Applicable to this support-platform scenario",
    checked: "Policy version 3",
    kind: "constraint",
    status: "Must hold",
  },
];

export const capabilities = [
  { name: "Handle support tickets", detail: "Everyday work", keep: true },
  { name: "Export own-queue reports", detail: "Quarter-end work", keep: true },
  { name: "Change app settings", detail: "Broad administration", keep: false },
  {
    name: "Manage people and roles",
    detail: "Privileged administration",
    keep: false,
  },
];

export function advice(scenario: Scenario) {
  switch (scenario) {
    case "baseline":
      return {
        headline: "Give support a role that fits the work.",
        role: "Support operator",
        description:
          "Keep ticket handling and scoped reports. Remove the administration the team does not need for its confirmed work.",
        reason:
          "The owner confirmed quarter-end exports. Low usage alone would have missed the work that matters.",
        status: "Owner review pending",
        next: "Review the proposed role with Maya, then test its effective permissions in a controlled setting.",
        condition:
          "Owner review and a controlled permissions check are still required.",
      };
    case "roles-unavailable":
      return {
        headline: "Find a workable role before changing access.",
        role: "Verify an alternative",
        description:
          "The proposed custom role is unavailable in this scenario. Ask the platform owner for a supported, scoped replacement.",
        reason:
          "A smaller role only helps if it can preserve ticket handling and required reports.",
        status: "Feasibility unresolved",
        next: "Alex should identify a supported alternative. The owner must separately decide how to handle the interim exposure.",
        condition:
          "Current access is not declared safe or accepted. Do not apply the proposed role.",
      };
    case "owner-unconfirmed":
      return {
        headline: "Confirm the work before narrowing the role.",
        role: "Ask about the reports",
        description:
          "Ask Maya whether own-queue exports are still required. Observed usage cannot settle an infrequent business need.",
        reason:
          "The reporting requirement is unresolved in this scenario. Removing it could interrupt quarter-end work.",
        status: "Owner input needed",
        next: "Confirm the reporting need with Maya before finalising the proposed permissions.",
        condition:
          "No role change is ready for approval while the required work is unresolved.",
      };
  }
}

export type Correction = {
  id: number;
  scenario: Scenario;
  note: string;
  source: string;
};
export type Version = {
  number: number;
  scenario: Scenario;
  correction: Correction | null;
};
export type FlightEvent =
  | { kind: "recommendation"; version: Version }
  | { kind: "correction"; correction: Correction }
  | { kind: "preference"; version: number; option: string };
export type DecisionState = {
  current: Version;
  previous: Version[];
  pending: Correction | null;
  events: FlightEvent[];
};
const initialVersion: Version = {
  number: 1,
  scenario: "baseline",
  correction: null,
};
export const initialState: DecisionState = {
  current: initialVersion,
  previous: [],
  pending: null,
  events: [{ kind: "recommendation", version: initialVersion }],
};
export type DecisionAction =
  | { type: "save"; scenario: Scenario; note: string; source: string }
  | { type: "reassess" }
  | { type: "prefer"; option: string };

export function decisionReducer(
  state: DecisionState,
  action: DecisionAction,
): DecisionState {
  switch (action.type) {
    case "save": {
      if (state.events.length >= 60) return state;
      const correction = {
        id: state.events.length + 1,
        scenario: action.scenario,
        note:
          action.note.trim().slice(0, 600) ||
          "Selected fact updated for this simulated review.",
        source: action.source,
      };
      return {
        ...state,
        pending: correction,
        events: [...state.events, { kind: "correction", correction }],
      };
    }
    case "reassess": {
      if (!state.pending) return state;
      const version = {
        number: state.current.number + 1,
        scenario: state.pending.scenario,
        correction: state.pending,
      };
      return {
        current: version,
        previous: [...state.previous, state.current],
        pending: null,
        events: [...state.events, { kind: "recommendation", version }],
      };
    }
    case "prefer":
      if (state.events.length >= 60) return state;
      return {
        ...state,
        events: [
          ...state.events,
          {
            kind: "preference",
            version: state.current.number,
            option: action.option,
          },
        ],
      };
  }
}

export function options(scenario: Scenario) {
  return [
    {
      id: "custom",
      name: "Custom support role",
      status:
        scenario === "baseline"
          ? "Proposed"
          : scenario === "roles-unavailable"
            ? "Not yet feasible"
            : "Needs confirmation",
      benefit:
        "Keep tickets and own-queue reports. Remove settings and user administration.",
      tradeoff:
        "Requires role support, owner review and a controlled permissions test.",
    },
    {
      id: "admin",
      name: "Keep Administrator",
      status: "Interim option",
      benefit: "Avoid an immediate interruption to the existing workflow.",
      tradeoff:
        "Broad administration remains. Needs an accountable exposure decision and a time-bound follow-up.",
    },
    {
      id: "tickets",
      name: "Ticket-only access",
      status:
        scenario === "owner-unconfirmed"
          ? "Need unresolved"
          : "Conflicts with work",
      benefit: "Remove administration and report exports.",
      tradeoff:
        scenario === "owner-unconfirmed"
          ? "Establish whether reports are necessary before choosing this option."
          : "Does not preserve the owner-confirmed reporting requirement.",
    },
  ];
}
