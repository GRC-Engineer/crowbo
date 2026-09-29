import { feathers } from "./domain.ts";
import type { FeatherDesign } from "./identity";
import type { Provider } from "./providers";

export type CaseId = "access" | "upgrade";
export type Influence = "deciding" | "supporting" | "context" | "constraint";
export type DemoSource = {
  id: string;
  label: string;
  provider: Provider;
  feather: FeatherDesign;
  influence: Influence;
  claim: string;
  quote: string;
  why: string;
  limit: string;
  period: string;
  revision: string;
};
export type Recommendation = {
  title: string;
  reason: string;
  condition: string;
  next: string;
  support: string;
};
type DemoCase = {
  label: string;
  question: string;
  scope: string;
  sources: DemoSource[];
  baseline: Recommendation;
  alternatives: { title: string; tradeoff: string }[];
  challenge: { title: string; body: string; check: string; sourceId: string };
};

const accessMap: Record<
  string,
  { provider: Provider; feather: FeatherDesign; influence: Influence }
> = {
  activity: { provider: "zendesk", feather: "series", influence: "supporting" },
  directory: { provider: "okta", feather: "cluster", influence: "context" },
  roles: { provider: "zendesk", feather: "branch", influence: "deciding" },
  calendar: {
    provider: "calendar",
    feather: "column",
    influence: "supporting",
  },
  owner: { provider: "slack", feather: "braid", influence: "deciding" },
  policy: { provider: "notion", feather: "spine", influence: "constraint" },
};

const accessSources: DemoSource[] = feathers.map((source) => ({
  id: source.id,
  label: source.source,
  ...accessMap[source.id],
  claim: source.title,
  quote: source.quote,
  why: source.influence,
  limit: source.limit,
  period: source.period,
  revision: source.revision,
}));

export const demoCases: {
  access: DemoCase & { id: "access" };
  upgrade: DemoCase & {
    id: "upgrade";
    changed: Recommendation;
    whatIf: string;
  };
} = {
  access: {
    id: "access",
    label: "Support access",
    question:
      "Can we narrow support access without breaking quarter-end reports?",
    scope: "Acme · 12 support staff · quarter-end, 30 September 2026",
    sources: accessSources,
    baseline: {
      title: "Test a role that fits the work.",
      reason:
        "Keep tickets and own-queue exports. Remove broad administration after the owner reviews the role and its permissions are tested.",
      condition:
        "Owner review and a controlled permissions check are still needed.",
      next: "Review and test the proposed support role",
      support:
        "The catalogue supports the role. Its effective permissions are untested.",
    },
    alternatives: [
      {
        title: "Keep Administrator",
        tradeoff:
          "Preserves current workflows but leaves broad privileges. Interim exposure needs an accountable decision.",
      },
      {
        title: "Remove all reporting",
        tradeoff:
          "Narrows access, but interrupts a reporting need the owner has confirmed.",
      },
    ],
    challenge: {
      title: "What if the quiet log misses rare work?",
      body: "Ninety days without admin activity does not rule out a recovery task that happens once a year.",
      check:
        "Ask the owner whether any recovery workflow needs administration, and how that access should be handled.",
      sourceId: "activity",
    },
  },
  upgrade: {
    id: "upgrade",
    label: "Service upgrade",
    question: "Should we upgrade the gateway before Friday’s customer launch?",
    scope: "Acme · gateway service · launch window, 2 October 2026",
    sources: [
      {
        id: "patch",
        label: "Change review",
        provider: "github",
        feather: "merge",
        influence: "deciding",
        claim: "The patch changes session handling.",
        quote:
          "The proposed gateway update replaces session parsing. Unit tests pass; the launch-specific sign-in path has not been tested.",
        why: "Makes the customer sign-in path the deciding pre-launch check.",
        limit:
          "Passing unit tests do not establish that the launch workflow works.",
        revision: "gateway-pr / r4",
        period: "Review on 28 September 2026",
      },
      {
        id: "incident",
        label: "Previous incident",
        provider: "linear",
        feather: "loop",
        influence: "deciding",
        claim: "The last upgrade broke sign-in.",
        quote:
          "A previous gateway release rejected sessions for one customer configuration. A rollback restored service.",
        why: "Justifies testing the same configuration before rolling out this change.",
        limit:
          "The earlier cause may differ. This is not proof the new release will fail.",
        revision: "incident / r2",
        period: "Incident on 12 August 2026",
      },
      {
        id: "inventory",
        label: "Service inventory",
        provider: "aws",
        feather: "object",
        influence: "context",
        claim: "One gateway serves the launch.",
        quote:
          "The launch traffic passes through the shared gateway service. The inventory lists the customer sign-in configuration.",
        why: "Defines which service and configuration the check should cover.",
        limit:
          "The inventory snapshot may omit dependencies added after it was checked.",
        revision: "inventory / r6",
        period: "Snapshot on 28 September 2026",
      },
      {
        id: "health",
        label: "Service activity",
        provider: "datadog",
        feather: "series",
        influence: "supporting",
        claim: "No active outage is observed.",
        quote:
          "The selected gateway dashboard shows no active outage over the last 24 hours.",
        why: "Provides operational context; it does not establish upgrade urgency or vulnerability exposure.",
        limit:
          "One dashboard is not complete coverage of service health or security exposure.",
        revision: "health / r9",
        period: "27–28 September 2026",
      },
      {
        id: "capacity",
        label: "Owner context",
        provider: "slack",
        feather: "braid",
        influence: "supporting",
        claim: "A test slot is available on Wednesday.",
        quote:
          "The service owner can run the sign-in and rollback checks on Wednesday. Friday is the planned customer launch.",
        why: "Offers a concrete check before the launch; delivery still needs confirmation.",
        limit: "This attributed availability is not an approved change window.",
        revision: "owner / r3",
        period: "Statement on 28 September 2026",
      },
      {
        id: "change-policy",
        label: "Change policy",
        provider: "notion",
        feather: "spine",
        influence: "constraint",
        claim: "Production changes need approval.",
        quote:
          "Production changes require an approved window and a verified rollback path.",
        why: "A successful test cannot grant change approval. This condition must hold for either upgrade option.",
        limit:
          "No approved window or verified rollback is established in this example.",
        revision: "change-policy / v2",
        period: "Applicable to the gateway change",
      },
    ],
    baseline: {
      title: "Test the launch path before committing.",
      reason:
        "Use Wednesday’s slot to check sign-in and rollback. Decide the release timing after those results, with the service owner.",
      condition:
        "Change approval, rollback verification and the security impact of delay remain unresolved.",
      next: "Review the sign-in and rollback checks with the owner",
      support:
        "The prior incident makes the check relevant. It does not predict this release’s outcome.",
    },
    changed: {
      title: "Resolve the missing test capacity.",
      reason:
        "The Wednesday slot is unavailable. Ask the owner for another controlled test window and assess the consequences of delaying the patch.",
      condition:
        "Neither shipping untested nor deferring the patch is approved.",
      next: "Ask the owner for a test window and a delay assessment",
      support:
        "The required check is unchanged. There is now no confirmed slot to perform it.",
    },
    alternatives: [
      {
        title: "Upgrade immediately",
        tradeoff:
          "Brings the patch forward, but the relevant sign-in path and rollback are unverified.",
      },
      {
        title: "Wait until after launch",
        tradeoff:
          "Avoids changing the launch path now, but the security impact of waiting has not been assessed.",
      },
    ],
    challenge: {
      title: "Are we too focused on the last outage?",
      body: "The previous incident makes release risk vivid. It can distract from the security consequences of leaving the current version in place.",
      check:
        "Check the patch’s security advisory and the gateway’s exposure before treating a delay as acceptable.",
      sourceId: "incident",
    },
    whatIf: "Wednesday’s test slot is unavailable",
  },
};

export const researchSteps = [
  {
    label: "Find sources",
    detail: "Match the question to the prepared source set.",
  },
  {
    label: "Check context",
    detail: "Read the scope, timing and limits of each source.",
  },
  {
    label: "Weigh the inputs",
    detail: "Separate deciding facts from context and firm constraints.",
  },
  {
    label: "Compare moves",
    detail: "Check the options and surface what could change the choice.",
  },
];

export type DemoState =
  | { kind: "welcome" }
  | { kind: "question"; draft: string; error: string | null }
  | { kind: "research"; caseId: CaseId; step: number; paused: boolean }
  | { kind: "result"; caseId: "access" }
  | {
      kind: "result";
      caseId: "upgrade";
      version: "baseline" | "changed";
      note: string;
      recorded: boolean;
    };

export type DemoAction =
  | { type: "home" }
  | { type: "open" }
  | { type: "edit"; value: string }
  | { type: "submit" }
  | { type: "tick" }
  | { type: "pause" }
  | { type: "finish" }
  | { type: "question" }
  | { type: "what-if" }
  | { type: "restore" }
  | { type: "note"; value: string }
  | { type: "record" };

export const demoInitialState: DemoState = { kind: "welcome" };

function result(caseId: CaseId): DemoState {
  if (caseId === "access") return { kind: "result", caseId };
  return {
    kind: "result",
    caseId,
    version: "baseline",
    note: "",
    recorded: false,
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "home":
      return demoInitialState;
    case "open":
      return state.kind === "welcome"
        ? { kind: "question", draft: "", error: null }
        : state;
    case "edit":
      return state.kind === "question"
        ? { ...state, draft: action.value.slice(0, 500), error: null }
        : state;
    case "submit": {
      if (state.kind !== "question") return state;
      const match = Object.values(demoCases).find(
        (entry) =>
          entry.question.toLowerCase() === state.draft.trim().toLowerCase(),
      );
      return match
        ? { kind: "research", caseId: match.id, step: 0, paused: false }
        : {
            ...state,
            error:
              "This walkthrough has two prepared questions. Choose one below to see the flow.",
          };
    }
    case "tick":
      if (state.kind !== "research" || state.paused) return state;
      return state.step < researchSteps.length - 1
        ? { ...state, step: state.step + 1 }
        : result(state.caseId);
    case "pause":
      return state.kind === "research"
        ? { ...state, paused: !state.paused }
        : state;
    case "finish":
      return state.kind === "research" ? result(state.caseId) : state;
    case "question":
      return {
        kind: "question",
        draft: "caseId" in state ? demoCases[state.caseId].question : "",
        error: null,
      };
    case "what-if":
      return state.kind === "result" && state.caseId === "upgrade"
        ? { ...state, version: "changed", recorded: false }
        : state;
    case "restore":
      return state.kind === "result" && state.caseId === "upgrade"
        ? { ...state, version: "baseline", recorded: false }
        : state;
    case "note":
      return state.kind === "result" && state.caseId === "upgrade"
        ? { ...state, note: action.value.slice(0, 800) }
        : state;
    case "record":
      return state.kind === "result" && state.caseId === "upgrade"
        ? { ...state, recorded: true }
        : state;
  }
}
