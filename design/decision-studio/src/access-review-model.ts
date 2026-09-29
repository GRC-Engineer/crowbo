import {
  demoCases,
  type DemoSource,
  type Recommendation,
} from "./question-demo-model.ts";

export type RecoveryPath = "tested" | "unverified" | "unavailable";
export type AccessBasis = "daily" | "recovery-known" | RecoveryPath;
export type AccessVersion = { number: number; basis: AccessBasis };
export type PendingContext =
  { kind: "annual-task" } | { kind: "recovery-path"; status: RecoveryPath };
export type AccessState = {
  current: AccessVersion;
  previous: AccessVersion[];
  pending: PendingContext | null;
  note: string;
  recordedVersions: number[];
  followup: { draft: string; error: string | null };
};
export type AccessAction =
  | { type: "challenge" }
  | { type: "prepare-path"; status: RecoveryPath }
  | { type: "reassess" }
  | { type: "discard" }
  | { type: "note"; value: string }
  | { type: "record" }
  | { type: "edit-followup"; value: string }
  | { type: "send-followup" };

export const conversationPrompts: Record<AccessBasis, string> = {
  daily: demoCases.access.question,
  "recovery-known": "What about the annual recovery task?",
  tested: "Use the tested recovery rehearsal.",
  unverified: "What if we only have a runbook?",
  unavailable: "What if temporary recovery access is unavailable?",
};

type PreparedFollowup = {
  label: string;
  question: string;
  action: Extract<AccessAction, { type: "challenge" | "prepare-path" }>;
};

export function availableFollowups(basis: AccessBasis): PreparedFollowup[] {
  if (basis === "daily")
    return [
      {
        label: "Annual recovery task",
        question: conversationPrompts["recovery-known"],
        action: { type: "challenge" },
      },
    ];
  const paths: { status: RecoveryPath; label: string }[] = [
    { status: "tested", label: "Tested path" },
    { status: "unverified", label: "Runbook only" },
    { status: "unavailable", label: "No path available" },
  ];
  return paths
    .filter(({ status }) => status !== basis)
    .map(({ status, label }) => ({
      label,
      question: conversationPrompts[status],
      action: { type: "prepare-path", status },
    }));
}

export const annualTask: DemoSource = {
  id: "annual-task",
  label: "Annual recovery task",
  provider: "slack",
  feather: "braid",
  influence: "deciding",
  claim: "Annual recovery needs administrative capability.",
  quote:
    "Maya, support owner: Once a year we rehearse recovery of the support queue. That task needs administrative capability that the proposed everyday role does not include. It was outside the 90-day activity window.",
  why: "The daily role alone does not cover all confirmed work. The quiet activity log cannot justify removing the ability to perform recovery.",
  limit:
    "An attributed fictional statement, not a permissions test or approval. It establishes neither a working temporary-access process nor a need for permanent Administrator access.",
  period: "Owner statement, 29 September 2026 · annual support-queue recovery",
  revision: "annual-recovery / r1 · synthetic",
};

export const recoveryPaths: Record<RecoveryPath, DemoSource> = {
  tested: {
    id: "recovery-tested",
    label: "Recovery rehearsal",
    provider: "linear",
    feather: "loop",
    influence: "deciding",
    claim: "Temporary recovery access worked in a controlled test.",
    quote:
      "Fictional test record: In Acme support staging, Alex received an approved 45-minute administrative grant, completed the annual queue-recovery task, and could export only the support team's own queue. Cross-queue export attempts were denied. The grant expired and a subsequent admin action was denied. The record includes test approval, grant, task, expiry and denial logs; Maya reviewed the result.",
    why: "Provides a demonstrated recovery path alongside narrower everyday access in this prepared example. The expiry and export checks are observed results, not promises in a runbook.",
    limit:
      "One synthetic tenant and rehearsal on 29 September. No claim about a vendor's real capabilities. The everyday role still needs its own effective-permission test. Test approval is not approval to change anyone's access.",
    period: "Controlled staging rehearsal, 29 September 2026 · 45-minute grant",
    revision: "recovery-rehearsal / r1 · synthetic",
  },
  unverified: {
    id: "recovery-unverified",
    label: "Recovery runbook",
    provider: "notion",
    feather: "spine",
    influence: "deciding",
    claim: "The process is documented, but has not been demonstrated.",
    quote:
      "Prepared alternative: The runbook describes temporary administrative access for recovery. There is no implementation record, successful rehearsal, expiry check or export-boundary test in the available sources.",
    why: "A possible path to investigate. Written instructions cannot establish that recovery or expiry works in this environment.",
    limit:
      "This alternative replaces the tested-path fixture. It cannot support a claim of a working temporary-access mechanism or permission to remove existing access.",
    period: "Runbook reviewed, 29 September 2026 · support-queue recovery",
    revision: "recovery-runbook / r1 · synthetic alternative",
  },
  unavailable: {
    id: "recovery-unavailable",
    label: "Platform constraint",
    provider: "linear",
    feather: "shard",
    influence: "constraint",
    claim: "This environment has no temporary recovery-access path.",
    quote:
      "Prepared alternative: The platform owner confirms that the current Acme support environment cannot issue the temporary administrative grant needed for this recovery workflow. No supported substitute is established in the available sources.",
    why: "Rules out the proposed temporary-access path in this branch. A different supported recovery method must be established before relying on it.",
    limit:
      "A fictional environment constraint, not a general claim about a provider. It neither approves indefinite Administrator access nor authorizes removing recovery capability.",
    period:
      "Platform statement, 29 September 2026 · current support environment",
    revision: "recovery-constraint / r1 · synthetic alternative",
  },
};

export const accessAdvice: Record<AccessBasis, Recommendation> = {
  daily: demoCases.access.baseline,
  "recovery-known": {
    title: "Resolve the recovery path first.",
    reason:
      "The everyday role covers tickets and reporting on paper. Annual recovery needs an additional capability that the quiet activity log missed.",
    condition:
      "Establish a supported recovery path before removing the access it needs. Owner approval and daily-role testing remain open.",
    next: "Review a recovery path with the owner",
    support:
      "The annual task is now in scope. No working way to provide temporary recovery access has been demonstrated.",
  },
  tested: {
    title: "Daily access, with a recovery path.",
    reason:
      "Use a narrower everyday role, plus tested temporary access for annual recovery. The rehearsal supports the extra capability when the work needs it.",
    condition:
      "The owner must approve the change, and the everyday role still needs a permissions test. The recovery rehearsal covers one staging environment.",
    next: "Review the combined plan and test the daily role",
    support:
      "The recovery task, time limit and export boundary passed in this fictional rehearsal. That strengthens this option; it does not establish production readiness or a calibrated confidence score.",
  },
  unverified: {
    title: "Prove the recovery path works.",
    reason:
      "The runbook describes a useful option, but does not show that recovery, expiry or export limits work. Keep that gap visible before choosing the combined plan.",
    condition:
      "A controlled recovery rehearsal, daily-role test and owner approval are still needed. No access change is authorized.",
    next: "Ask for a controlled recovery rehearsal",
    support:
      "The process is documented. Its implementation and effective permissions remain unverified.",
  },
  unavailable: {
    title: "Find another supported recovery path.",
    reason:
      "The daily role cannot perform recovery, and this environment cannot provide temporary admin access. The proposed combination is not currently feasible.",
    condition:
      "Establish another recovery method with the owner. Neither removing the capability nor retaining permanent admin is approved here.",
    next: "Review supported recovery alternatives",
    support:
      "The prepared platform constraint rules out this path. The sources do not establish a safe replacement.",
  },
};

export const basisLabels: Record<AccessBasis, string> = {
  daily: "Daily work",
  "recovery-known": "Annual task added",
  tested: "Tested recovery path",
  unverified: "Runbook only",
  unavailable: "Path unavailable",
};

export const revisionReasons: Record<Exclude<AccessBasis, "daily">, string> = {
  "recovery-known":
    "Annual recovery falls outside the activity window. A narrower daily role alone no longer covers the confirmed work.",
  tested:
    "A controlled rehearsal demonstrates temporary recovery access. The combined option is now supported within that test’s scope.",
  unverified:
    "In this alternative, only a runbook is available. The combined option needs a successful test before we can rely on it.",
  unavailable:
    "In this alternative, the environment cannot provide temporary access. This recovery path is ruled out.",
};

export const accessInitialState: AccessState = {
  current: { number: 1, basis: "daily" },
  previous: [],
  pending: null,
  note: "",
  recordedVersions: [],
  followup: { draft: "", error: null },
};

export function pendingSource(context: PendingContext): DemoSource {
  return context.kind === "annual-task"
    ? annualTask
    : recoveryPaths[context.status];
}

export function versionSources(version: AccessVersion): DemoSource[] {
  const original = demoCases.access.sources;
  if (version.basis === "daily") return [...original];
  if (version.basis === "recovery-known") return [...original, annualTask];
  return [...original, annualTask, recoveryPaths[version.basis]];
}

export function accessReducer(
  state: AccessState,
  action: AccessAction,
): AccessState {
  switch (action.type) {
    case "edit-followup":
      return {
        ...state,
        followup: { draft: action.value.slice(0, 500), error: null },
      };
    case "send-followup": {
      if (state.pending)
        return {
          ...state,
          followup: {
            ...state.followup,
            error:
              "Apply or dismiss the staged context before sending another follow-up.",
          },
        };
      const prepared = availableFollowups(state.current.basis).find(
        ({ question }) =>
          question.toLowerCase() === state.followup.draft.trim().toLowerCase(),
      );
      if (!prepared)
        return {
          ...state,
          followup: {
            ...state.followup,
            error:
              "This preview supports the prepared follow-ups below. Choose one to continue; your draft has been kept.",
          },
        };
      return {
        ...accessReducer(state, prepared.action),
        followup: { draft: "", error: null },
      };
    }
    case "challenge":
      return state.current.basis === "daily"
        ? { ...state, pending: { kind: "annual-task" } }
        : state;
    case "prepare-path":
      return state.current.basis !== "daily" &&
        state.current.basis !== action.status
        ? {
            ...state,
            pending: { kind: "recovery-path", status: action.status },
          }
        : state;
    case "discard":
      return { ...state, pending: null };
    case "reassess": {
      if (!state.pending) return state;
      const basis =
        state.pending.kind === "annual-task"
          ? "recovery-known"
          : state.pending.status;
      if (state.current.basis === "daily" && basis !== "recovery-known")
        return state;
      return {
        ...state,
        previous: [...state.previous, state.current],
        current: { number: state.current.number + 1, basis },
        pending: null,
      };
    }
    case "note":
      return { ...state, note: action.value.slice(0, 800) };
    case "record":
      return state.recordedVersions.includes(state.current.number)
        ? state
        : {
            ...state,
            recordedVersions: [...state.recordedVersions, state.current.number],
          };
  }
}

export function accessOptions(basis: AccessBasis) {
  const hasRecovery = basis !== "daily";
  const options = [
    {
      name: "Keep Administrator",
      result: "Keeps the existing capability, including broad privileges.",
      gap: "Interim exposure needs an accountable decision; keeping it is not approved here.",
      proposed: false,
    },
    {
      name: "Remove reporting access",
      result: "Interrupts the quarter-end exports the owner needs.",
      gap: "Conflicts with a confirmed workflow.",
      proposed: false,
    },
    {
      name: "Narrower daily role",
      result: hasRecovery
        ? "Covers tickets and own-queue exports on paper, but cannot perform annual recovery."
        : "Covers the stated ticket and reporting work on paper.",
      gap: hasRecovery
        ? "A recovery path, daily-role test and owner approval are still needed."
        : "Check rare workflows, test permissions and obtain owner approval.",
      proposed: !hasRecovery,
    },
  ];
  if (hasRecovery)
    options.push({
      name: "Daily role + temporary recovery access",
      result:
        basis === "tested"
          ? "The fictional rehearsal supports recovery, expiry and the own-queue export limit."
          : basis === "unavailable"
            ? "Not feasible with the current environment’s temporary-access capability."
            : "A possible design; no working recovery mechanism has been demonstrated.",
      gap:
        basis === "tested"
          ? "Still needs a daily-role permissions test and approval for the change."
          : "Do not rely on this combination until a supported path is demonstrated.",
      proposed: basis === "tested",
    });
  return options;
}
