import { digest } from "../domain/canonical";

/**
 * Capacity-bounded programme prioritisation: which improvements a security programme should take
 * on next, given current evidence, named commitments and the time and money it actually has.
 * A faithful TypeScript port of the frozen Python proof (proof/crowbo.py, programme-proof-0.1);
 * record IDs match the ones the proof recorded, so the two engines are checked against each other.
 * Pure functions only: no storage, network or model call. Every output is a simulation.
 */

export const VERSION = "programme-proof-0.1";
export const RESOURCES = ["security_half_days", "platform_half_days", "cash_usd"] as const;
type Resource = (typeof RESOURCES)[number];
export type Capacity = Record<Resource, number | null>;
type Usage = Record<Resource, number>;
type Json = any;

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const text = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 4000;
const identifier = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const number = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000;

/** Whole days since the epoch for an ISO date, after checking it is a real calendar date. */
function day(value: unknown): number {
  require(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "Expected ISO date");
  const ms = Date.parse(`${value}T00:00:00Z`);
  require(!Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value, "Expected ISO date");
  return ms / 86_400_000;
}

export function validate(data: Json): void {
  require(data.synthetic === true && data.schema_version === 1, "Only synthetic v1 packets are supported");
  require(identifier(data.tenant) && identifier(data.owner), "Invalid programme identity");
  require(data.principals.includes(data.owner), "Owner must be a declared principal");
  require(data.principals.every(identifier), "Invalid principal");
  const controls = data.controls;
  const controlIds = Object.keys(controls);
  require(controlIds.length >= 1 && controlIds.length <= 10, "Expected 1 to 10 controls");
  for (const [key, control] of Object.entries<Json>(controls)) {
    require(identifier(key) && text(control.scope) && text(control.claim), "Invalid control");
    require(number(control.max_age_days), "Invalid freshness window");
  }
  const records: Json[] = data.evidence;
  require(records.length <= 1000, "Too many evidence records");
  const ids = records.map((e) => e.id);
  require(new Set(ids).size === ids.length, "Duplicate evidence identifier");
  const byId = new Map(records.map((e) => [e.id, e]));
  for (const evidence of records) {
    require(identifier(evidence.id) && identifier(evidence.tenant), "Invalid evidence identity");
    require(evidence.control in controls, "Unknown evidence control");
    require(["observation", "assertion", "requirement"].includes(evidence.kind), "Invalid source kind");
    require(typeof evidence.gap === "boolean", "Gap interpretation must be a boolean");
    require(["complete", "partial"].includes(evidence.coverage), "Invalid coverage");
    require(evidence.synthetic === true, "Non-synthetic evidence is outside this proof");
    require(["scope", "source", "text", "interpretation_basis"].every((k) => text(evidence[k])), "Invalid evidence text");
    require(Array.isArray(evidence.readers) && evidence.readers.every(identifier), "Invalid evidence readers");
    require(day(evidence.observed_start) <= day(evidence.observed_end) && day(evidence.observed_end) <= day(evidence.recorded_at), "Invalid observation chronology");
    if (evidence.supersedes) {
      const old = byId.get(evidence.supersedes);
      require(old, "Unknown superseded evidence");
      require(["tenant", "control", "scope"].every((k) => evidence[k] === old[k]), "Supersession changes claim scope");
      require(day(old.recorded_at) < day(evidence.recorded_at), "Supersession must move forward in time");
    }
  }
  const actions: Json[] = data.actions;
  require(actions.length >= 1 && actions.length <= 12, "Expected 1 to 12 actions for bounded enumeration");
  require(new Set(actions.map((a) => a.id)).size === actions.length, "Duplicate action identifier");
  for (const action of actions) {
    require(identifier(action.id) && action.control in controls, "Invalid action identity");
    require(["improve", "investigate", "maintain"].includes(action.mode), "Invalid action mode");
    require(number(action.priority), "Invalid proposed priority");
    require(["label", "business_basis", "assumption", "would_change"].every((k) => text(action[k])), "Invalid action explanation");
    for (const resource of RESOURCES) {
      const bounds = action.effort[resource];
      require(Array.isArray(bounds) && bounds.length === 2 && bounds.every(number) && bounds[0] <= bounds[1], "Invalid effort range");
    }
  }
  const actionIds = new Set(actions.map((a) => a.id));
  for (const c of Object.values<Json>(data.cases)) {
    day(c.as_of);
    require(c.evidence_ids.every((id: string) => ids.includes(id)), "Unknown case evidence");
    require(c.required_actions.every((id: string) => actionIds.has(id)), "Unknown commitment action");
    require(RESOURCES.every((r) => c.capacity[r] === null || number(c.capacity[r])), "Invalid capacity");
  }
}

const byKey = (key: string) => (a: Json, b: Json) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

/** The evidence one principal may see for one case, as of that case's date. */
export function packet(data: Json, caseId: string, tenant: string, principal: string, asOf: string): Json {
  validate(data);
  require(tenant === data.tenant && data.principals.includes(principal), "Unknown tenant or principal");
  require(Object.hasOwn(data.cases, caseId), "Unknown case");
  const c = data.cases[caseId];
  require(asOf === c.as_of, "Assessment date must match the selected case snapshot");
  const instant = day(asOf);
  const visible: Json[] = data.evidence.filter(
    (e: Json) =>
      c.evidence_ids.includes(e.id) && e.tenant === tenant && e.readers.includes(principal) && day(e.recorded_at) <= instant && day(e.observed_end) <= instant,
  );
  const visibleIds = new Set(visible.map((e) => e.id));
  const trimmed = visible.map((e) => Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== "supersedes" || visibleIds.has(v))));
  return {
    schema_version: 1, synthetic: true, case_id: caseId,
    tenant, principal, as_of: asOf,
    owner: data.owner, question: data.question,
    scope: data.scope, horizon: data.horizon,
    controls: data.controls, actions: [...data.actions].sort(byKey("id")),
    capacity: c.capacity, required_actions: c.required_actions,
    evidence: trimmed.sort(byKey("id")),
    method_status: "Assistant-authored scenario criteria; awaiting qualified review",
  };
}

export function assessEvidence(basis: Json): Json {
  const assessments: Json = {};
  const superseded = new Set(basis.evidence.filter((e: Json) => e.supersedes).map((e: Json) => e.supersedes));
  for (const controlId of Object.keys(basis.controls).sort()) {
    const control = basis.controls[controlId];
    const assessed = basis.evidence
      .filter((e: Json) => e.control === controlId)
      .map((e: Json) => {
        const limits: string[] = [];
        if (superseded.has(e.id)) limits.push("superseded");
        if (e.scope !== control.scope) limits.push("scope_mismatch");
        if (day(basis.as_of) - day(e.observed_end) > control.max_age_days) limits.push("stale");
        if (e.coverage !== "complete") limits.push("partial");
        if (e.kind !== "observation") limits.push("not_operating_evidence");
        return { id: e.id, gap: e.gap, limits };
      });
    const values = new Set(assessed.filter((e: Json) => !e.limits.length).map((e: Json) => e.gap));
    const state = values.size === 2 ? "conflicting" : values.has(true) ? "gap_supported" : values.has(false) ? "no_gap_observed" : "unresolved";
    assessments[controlId] = {
      state, claim: control.claim, scope: control.scope, records: assessed,
      limitation: "Applies only to this claim, scope and period; no compliance pass or risk reduction is inferred.",
    };
  }
  return assessments;
}

function totals(actions: Json[], bound: 0 | 1): Usage {
  return Object.fromEntries(RESOURCES.map((r) => [r, actions.reduce((sum, a) => sum + a.effort[r][bound], 0)])) as Usage;
}

function fits(usage: Usage, capacity: Capacity): boolean {
  return RESOURCES.every((r) => capacity[r] !== null && usage[r] <= (capacity[r] as number));
}

/** Python itertools.combinations order. */
function* combinations<T>(items: T[], k: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === k) {
    yield prefix;
    return;
  }
  for (let i = start; i < items.length; i++) yield* combinations(items, k, i + 1, [...prefix, items[i]]);
}

function comparePreference(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -Infinity) - (b[i] ?? -Infinity);
    if (d) return d;
  }
  return 0;
}

export function recommend(basis: Json): Json {
  const evidence = assessEvidence(basis);
  const alternatives: Json[] = basis.actions.map((action: Json) => {
    const state = evidence[action.control].state;
    const eligible =
      action.mode === "maintain" ||
      (action.mode === "improve" && state === "gap_supported") ||
      (action.mode === "investigate" && (state === "conflicting" || state === "unresolved"));
    return {
      ...action, evidence_state: state, eligible,
      reason: eligible ? "Evidence prerequisite met" : "Evidence prerequisite not met; no automatic commitment",
      evidence_refs: evidence[action.control].records.map((e: Json) => e.id),
    };
  });
  const candidates = alternatives.filter((a) => a.eligible).sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const feasible: [number[], Json[]][] = [];
  for (let length = 0; length <= candidates.length; length++) {
    for (const chosen of combinations(candidates, length)) {
      if (fits(totals(chosen, 1), basis.capacity)) {
        const ids = new Set(chosen.map((a) => a.id));
        const preference = [basis.required_actions.filter((id: string) => ids.has(id)).length, ...candidates.map((a) => Number(ids.has(a.id)))];
        feasible.push([preference, chosen]);
      }
    }
  }
  feasible.sort((x, y) => comparePreference(y[0], x[0]));
  const selected = feasible.length ? feasible[0][1] : [];
  const selectedIds = selected.map((a) => a.id).sort();
  const unmet = basis.required_actions.filter((id: string) => !selectedIds.includes(id)).sort();
  for (const alternative of alternatives) {
    alternative.disposition = selectedIds.includes(alternative.id)
      ? "proposed"
      : !alternative.eligible
        ? "needs_evidence_or_not_indicated"
        : "deferred_by_capacity_and_declared_preference";
  }
  const status = unmet.length || Object.values(basis.capacity).some((v) => v === null) ? "needs_owner_resolution" : "conditional_recommendation";
  return {
    kind: "recommendation", engine_version: VERSION, basis_hash: digest(basis), basis,
    status, evidence_assessment: evidence, alternatives,
    selected: selectedIds, usage_range: { low: totals(selected, 0), high: totals(selected, 1) },
    unmet_commitments: unmet,
    method: "Enumerate feasible subsets at upper effort bounds. Maximise count of named commitments, then the explicit action preference order. This is a proposed scenario policy, not a risk model or trained judgment.",
    other_feasible_portfolios: feasible.slice(1, 6).map(([, group]) => ({ actions: group.map((a) => a.id).sort(), usage_high: totals(group, 1) })),
    uncertainties: [
      "Effort and benefits are synthetic estimates; confirm scope and delivery feasibility with owners.",
      "Missing or restricted evidence cannot establish that a control works.",
      "The preference order is unreviewed and may change the chosen portfolio.",
    ],
    next_step:
      status === "needs_owner_resolution"
        ? "The simulated owner must resolve missing capacity or unmet commitments before any commitment."
        : "Ask the simulated owner to review the assumptions and choose a feasible portfolio or defer.",
    authority: "Recommendation only. No action executes and no real authorisation is granted.",
    authored_by: "Codex", review_status: "proposed_unreviewed",
  };
}

export function ownerDecision(recommendation: Json, recommendationId: string, owner: string, selected: string[], rationale: string): Json {
  require(recommendation.kind === "recommendation", "Owner choice requires a recommendation");
  require(owner === recommendation.basis.owner, "Unknown simulated owner");
  require(text(rationale), "A simulated owner rationale is required");
  require(new Set(selected).size === selected.length, "Duplicate selected action");
  const byId = new Map(recommendation.alternatives.filter((a: Json) => a.eligible).map((a: Json) => [a.id, a]));
  require(selected.every((id) => byId.has(id)), "Unknown action or unmet evidence prerequisite");
  const actions = selected.map((id) => byId.get(id));
  require(!selected.length || fits(totals(actions, 1), recommendation.basis.capacity), "Owner choice exceeds capacity");
  const unmet = recommendation.basis.required_actions.filter((id: string) => !selected.includes(id)).sort();
  return {
    kind: "simulated_owner_decision", recommendation_id: recommendationId,
    tenant: recommendation.basis.tenant, principal: recommendation.basis.principal,
    owner, selected: [...selected].sort(), rationale,
    unmet_commitments: unmet, disposition: unmet.length ? "deferred_pending_commitment_resolution" : "simulated_choice",
    authority: "Fictional choice only. No execution, purchase, acceptance of real risk or identity verification.",
  };
}

export function reassess(basis: Json, previous: Json, previousId: string, decision: Json, decisionId: string): Json {
  require(previous.kind === "recommendation", "Previous record must be a recommendation");
  require(decision.kind === "simulated_owner_decision" && decision.recommendation_id === previousId, "Owner decision does not belong to the previous recommendation");
  require(previous.basis.tenant === basis.tenant && previous.basis.principal === basis.principal, "Record context does not match");
  require(day(basis.as_of) > day(previous.basis.as_of), "Reassessment must be later");
  const result = recommend(basis);
  const before = previous.evidence_assessment;
  result.previous_recommendation_id = previousId;
  result.previous_owner_decision_id = decisionId;
  result.changes = {
    evidence_states: Object.fromEntries(
      Object.entries<Json>(result.evidence_assessment)
        .filter(([key, value]) => before[key].state !== value.state)
        .map(([key, value]) => [key, { before: before[key].state, after: value.state }]),
    ),
    added_actions: result.selected.filter((id: string) => !previous.selected.includes(id)).sort(),
    displaced_actions: previous.selected.filter((id: string) => !result.selected.includes(id)).sort(),
    owner_choice_now_needs_review: JSON.stringify(decision.selected) !== JSON.stringify(result.selected),
    capacity_changed: RESOURCES.some((r) => basis.capacity[r] !== previous.basis.capacity[r]),
  };
  return result;
}

/** A record's ID is the hash of its body, as in the proof. */
export const recordId = (body: Json): string => digest(body);
