import { accessSources } from "./access-sources.ts";
import { workflowCases } from "./workflow-cases.ts";
import type { DemoCase } from "./source-model.ts";
export type { DemoSource, Influence, Recommendation } from "./source-model.ts";
export type CaseId = "access" | "remediation" | "exceptions";
export const demoCases: Record<CaseId, DemoCase & { id: CaseId }> = {
  remediation: workflowCases.remediation,
  access: {
    id: "access",
    label: "Access reviews",
    question:
      "Can we remove this support account's standing administrator access without breaking its approved work?",
    scope:
      "Acme Support · account usr-042 · tenant acme-support · own queue q-7",
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
  exceptions: workflowCases.exceptions,
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
  | { kind: "result"; caseId: CaseId };
export type DemoAction =
  | {
      type:
        "home" | "open" | "submit" | "tick" | "pause" | "finish" | "question";
    }
  | { type: "edit"; value: string };
export const demoInitialState: DemoState = { kind: "welcome" };
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
              "This walkthrough has three prepared questions. Choose one below to see the flow.",
          };
    }
    case "tick":
      return state.kind !== "research" || state.paused
        ? state
        : state.step < researchSteps.length - 1
          ? { ...state, step: state.step + 1 }
          : { kind: "result", caseId: state.caseId };
    case "pause":
      return state.kind === "research"
        ? { ...state, paused: !state.paused }
        : state;
    case "finish":
      return state.kind === "research"
        ? { kind: "result", caseId: state.caseId }
        : state;
    case "question":
      return {
        kind: "question",
        draft: "caseId" in state ? demoCases[state.caseId].question : "",
        error: null,
      };
  }
}
