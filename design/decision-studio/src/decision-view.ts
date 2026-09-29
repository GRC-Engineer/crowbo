import { useReducer } from "react";
import {
  accessAdvice,
  accessInitialState,
  accessOptions,
  accessReducer,
  availableFollowups,
  basisLabels,
  isAccessCheck,
  pendingSource,
  revisionReasons,
  versionSources,
  type AccessBasis,
  type AccessVersion,
} from "./access-review-model";
import { caseGuides } from "./case-guides";
import { demoCases, type CaseId } from "./question-demo-model";
import type { DemoSource, Recommendation } from "./source-model";
import { workflowCases, type WorkflowId } from "./workflow-cases";
import {
  availableStages,
  initialWorkflow,
  workflowReducer,
} from "./workflow-model";

// One shape for the decide screen. The access case and the two workflow
// cases keep their own reducers; these hooks read each into the same view.

export type VersionView = {
  number: number;
  stage: string;
  label: string;
  advice: Recommendation;
  sources: DemoSource[];
  change: string | null;
  recorded: boolean;
};
export type PendingView = {
  label: string;
  change: string;
  advice: Recommendation;
  sources: DemoSource[];
  added: DemoSource[];
};
export type UpdateView = { id: string; label: string; stage: () => void };
export type OptionView = {
  name: string;
  result: string;
  gap: string;
  proposed: boolean;
};
export type BranchView = {
  id: string;
  label: string;
  title: string;
  depth: number;
  sources: number;
  current: boolean;
};
export type DecisionView = {
  caseId: CaseId;
  label: string;
  title: string;
  question: string;
  scope: string;
  specification: string;
  current: VersionView;
  focus: DemoSource[];
  previous: VersionView[];
  pending: PendingView | null;
  updates: UpdateView[];
  options: OptionView[];
  branches: BranchView[];
  challenge: { title: string; body: string; check: string };
  note: string;
  saveNote: (value: string) => void;
  record: () => void;
  reassess: () => void;
  discard: () => void;
  // Prepared follow-up questions typed on the command line.
  ask: ((text: string) => string | null) | null;
};

function added(next: DemoSource[], current: DemoSource[]) {
  return next.filter(
    (source) =>
      !current.some(
        (old) => old.id === source.id && old.revision === source.revision,
      ),
  );
}

function tree<T extends string>(
  root: T,
  children: (id: T) => T[],
  describe: (id: T) => { label: string; title: string; sources: number },
  current: string,
  extra: T[] = [],
): BranchView[] {
  const seen = new Set<string>();
  const out: BranchView[] = [];
  const walk = (id: T, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, depth, current: id === current, ...describe(id) });
    for (const child of children(id)) walk(child, Math.min(depth + 1, 3));
  };
  walk(root, 0);
  for (const id of extra) walk(id, 1);
  return out;
}

export function useWorkflowDecision(caseId: WorkflowId): DecisionView {
  const [state, dispatch] = useReducer(
    workflowReducer,
    caseId,
    initialWorkflow,
  );
  const data = workflowCases[caseId];
  const stages = new Map(
    [data.initial, ...data.stages].map((stage) => [stage.id, stage]),
  );
  const { stage } = state.current;
  const version = (entry: typeof state.current): VersionView => ({
    number: entry.number,
    stage: entry.stage.id,
    label: entry.stage.label,
    advice: entry.stage.advice,
    sources: entry.stage.sources,
    change: entry.number > 1 ? entry.stage.change : null,
    recorded: state.recordedVersions.includes(entry.number),
  });
  return {
    caseId,
    label: data.label,
    title: caseGuides[caseId].title,
    question: data.question,
    scope: data.scope,
    specification: data.specVersion,
    current: version(state.current),
    focus: stage.sources.filter((source) => stage.focus.includes(source.id)),
    previous: state.previous.map(version),
    pending: state.pending && {
      label: state.pending.label,
      change: state.pending.change,
      advice: state.pending.advice,
      sources: state.pending.sources,
      added: added(state.pending.sources, stage.sources),
    },
    updates: availableStages(state).map((next) => ({
      id: next.id,
      label: next.label,
      stage: () => dispatch({ type: "stage", id: next.id }),
    })),
    options: [
      {
        name: stage.advice.title.replace(/\.$/, ""),
        result: stage.advice.reason,
        gap: stage.advice.condition,
        proposed: true,
      },
      ...data.alternatives.map((option) => ({
        name: option.title,
        result: option.tradeoff,
        gap: "",
        proposed: false,
      })),
    ],
    branches: tree(
      data.initial.id,
      (id) =>
        (stages.get(id)?.options ?? []).filter(
          (option) => option !== "irrelevant" && stages.has(option),
        ),
      (id) => {
        const entry = stages.get(id) ?? data.initial;
        return {
          label: entry.label,
          title: entry.advice.title,
          sources: entry.sources.length,
        };
      },
      stage.id.replace(/-context$/, ""),
      data.stages.map((entry) => entry.id),
    ),
    challenge: data.challenge,
    note: state.note,
    saveNote: (value) => dispatch({ type: "note", value }),
    record: () => dispatch({ type: "record" }),
    reassess: () => dispatch({ type: "reassess" }),
    discard: () => dispatch({ type: "discard" }),
    ask: null,
  };
}

function accessFocus(version: AccessVersion, sources: DemoSource[]) {
  const hasRecovery = sources.some((record) => record.id === "annual-task");
  const check = isAccessCheck(version.basis)
    ? version.basis === "identity-unknown"
      ? "directory"
      : version.basis === "observed"
        ? "access-outcome"
        : version.basis === "irrelevant"
          ? "roles"
          : "daily-test"
    : null;
  return sources.filter((record) =>
    check
      ? record.id === "policy" || record.id === check
      : hasRecovery
        ? record.id === "policy" ||
          record.id === "annual-task" ||
          record.id.startsWith("recovery-")
        : ["roles", "owner", "policy"].includes(record.id),
  );
}

function followupBasis(
  action: ReturnType<typeof availableFollowups>[number]["action"],
): AccessBasis {
  return action.type === "challenge" ? "recovery-known" : action.status;
}

export function useAccessDecision(): DecisionView {
  const [state, dispatch] = useReducer(accessReducer, accessInitialState);
  const data = demoCases.access;
  const version = (entry: AccessVersion): VersionView => ({
    number: entry.number,
    stage: entry.basis,
    label: basisLabels[entry.basis],
    advice: accessAdvice[entry.basis],
    sources: versionSources(entry),
    change: entry.basis === "daily" ? null : revisionReasons[entry.basis],
    recorded: state.recordedVersions.includes(entry.number),
  });
  const current = version(state.current);
  const pendingBasis: AccessBasis | null = !state.pending
    ? null
    : state.pending.kind === "annual-task"
      ? "recovery-known"
      : state.pending.status;
  return {
    caseId: "access",
    label: data.label,
    title: caseGuides.access.title,
    question: data.question,
    scope: data.scope,
    specification: "1.0.0",
    current,
    focus: accessFocus(state.current, current.sources),
    previous: state.previous.map(version),
    pending:
      state.pending && pendingBasis
        ? {
            label: basisLabels[pendingBasis],
            change: revisionReasons[pendingBasis],
            advice: accessAdvice[pendingBasis],
            sources: versionSources({
              number: state.current.number + 1,
              basis: pendingBasis,
            }),
            added: [pendingSource(state.pending)],
          }
        : null,
    updates: availableFollowups(state.current.basis).map((prompt) => ({
      id: followupBasis(prompt.action),
      label: prompt.label,
      stage: () => dispatch(prompt.action),
    })),
    options: accessOptions(state.current.basis).map((option) => ({
      name: option.name,
      result: option.result,
      gap: option.gap,
      proposed: option.proposed,
    })),
    branches: tree<AccessBasis>(
      "daily",
      (basis) =>
        availableFollowups(basis).map((prompt) => followupBasis(prompt.action)),
      (basis) => ({
        label: basisLabels[basis],
        title: accessAdvice[basis].title,
        sources: versionSources({ number: 1, basis }).length,
      }),
      state.current.basis,
    ),
    challenge: data.challenge,
    note: state.note,
    saveNote: (value) => dispatch({ type: "note", value }),
    record: () => dispatch({ type: "record" }),
    reassess: () => dispatch({ type: "reassess" }),
    discard: () => dispatch({ type: "discard" }),
    ask: (text) => {
      const prepared = availableFollowups(state.current.basis).find(
        ({ question }) => question.toLowerCase() === text.trim().toLowerCase(),
      );
      if (!prepared)
        return "Choose one of the prepared follow-ups under What could change this.";
      dispatch(prepared.action);
      return null;
    },
  };
}
