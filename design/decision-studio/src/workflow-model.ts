import {
  workflowCases,
  type WorkflowId,
  type WorkflowStage,
} from "./workflow-cases.ts";

export type WorkflowVersion = { number: number; stage: WorkflowStage };
export type WorkflowState = {
  caseId: WorkflowId;
  current: WorkflowVersion;
  previous: WorkflowVersion[];
  pending: WorkflowStage | null;
  recordedVersions: number[];
  note: string;
};
export type WorkflowAction =
  | { type: "stage"; id: string }
  | { type: "reassess" | "discard" | "record" }
  | { type: "note"; value: string };
export function initialWorkflow(caseId: WorkflowId): WorkflowState {
  return {
    caseId,
    current: { number: 1, stage: workflowCases[caseId].initial },
    previous: [],
    pending: null,
    recordedVersions: [],
    note: "",
  };
}
export function availableStages(state: WorkflowState): WorkflowStage[] {
  const entry = workflowCases[state.caseId];
  return state.current.stage.options.flatMap((id) => {
    if (id === "irrelevant")
      return [
        {
          ...state.current.stage,
          id: `${state.current.stage.id}-context`,
          label: "Try irrelevant context",
          sources: [...state.current.stage.sources, entry.irrelevant],
          options: state.current.stage.options.filter(
            (option) => option !== "irrelevant",
          ),
          change:
            "The new context changes no deciding fact, condition or scope. The recommendation is unchanged.",
        },
      ];
    const next = entry.stages.find((stage) => stage.id === id);
    return next ? [next] : [];
  });
}
export function workflowReducer(
  state: WorkflowState,
  action: WorkflowAction,
): WorkflowState {
  switch (action.type) {
    case "stage": {
      if (state.pending) return state;
      const pending = availableStages(state).find(
        (stage) => stage.id === action.id,
      );
      return pending && pending.sources.length <= 15
        ? { ...state, pending }
        : state;
    }
    case "reassess":
      return state.pending
        ? {
            ...state,
            previous: [...state.previous, state.current],
            current: { number: state.current.number + 1, stage: state.pending },
            pending: null,
          }
        : state;
    case "discard":
      return { ...state, pending: null };
    case "record":
      return state.recordedVersions.includes(state.current.number)
        ? state
        : {
            ...state,
            recordedVersions: [...state.recordedVersions, state.current.number],
          };
    case "note":
      return { ...state, note: action.value.slice(0, 800) };
  }
}
