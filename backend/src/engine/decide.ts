import { digest } from "../domain/canonical";
import type { ContextGraph } from "./graph";
import type {
  Action, Capacity, Citation, Condition, Decision, Deferred, Fact, Move, Range, Scenario, ScenarioAssessment,
} from "./model";

/**
 * Layer 02b, weigh, and the decision itself: the next moves by risk removed. Deterministic code
 * over facts, visible weights and attributed estimates, so the same inputs always give the same
 * answer and every number can be traced. A model may extract facts or explain the result; it never
 * chooses. The arithmetic is deliberately simple (ranges, a greedy fit); docs/ENGINE.md lists what
 * a production version replaces it with.
 */

export const METHOD_VERSION = "engine-prototype-0.1";
/** A source weighted below this cannot establish a gap or a prerequisite on its own. */
export const MIN_WEIGHT = 2;

export interface DecideInputs {
  viewer: string;
  as_of: string;
  facts: Fact[];
  weights: Map<string, number>;
  scenarios: Scenario[];
  actions: Action[];
  capacity: Capacity;
}

function holds(c: Condition, f: Fact): boolean {
  switch (c.op) {
    case "exists": return true;
    case "eq": return f.value === c.value;
    case "gt": return typeof f.value === "number" && f.value > Number(c.value);
    case "lt": return typeof f.value === "number" && f.value < Number(c.value);
  }
}

const cite = (f: Fact, weights: Map<string, number>): Citation => ({
  quote: f.quote, connector: f.source.connector, record: f.source.record, revision: f.source.revision, weight: weights.get(f.source.connector) ?? 0,
});

/** Facts about the condition's subject and predicate from sources weighted at least MIN_WEIGHT. */
function usable(c: Condition, facts: Fact[], weights: Map<string, number>): Fact[] {
  return facts.filter((f) => f.subject === c.subject && f.predicate === c.predicate && (weights.get(f.source.connector) ?? 0) >= MIN_WEIGHT);
}

/** Evidence for a condition: supported, contradicted, conflicting or missing. */
function test(c: Condition, facts: Fact[], weights: Map<string, number>) {
  const relevant = usable(c, facts, weights);
  const yes = relevant.filter((f) => holds(c, f));
  const no = relevant.filter((f) => !holds(c, f));
  const state = yes.length && no.length ? "unresolved" : yes.length ? "gap_supported" : no.length ? "no_gap_observed" : "unresolved";
  const confidence = yes.length ? Math.max(...yes.map((f) => weights.get(f.source.connector) ?? 0)) / 5 : 0;
  return { state, confidence, evidence: (yes.length ? yes : relevant).map((f) => cite(f, weights)) } as const;
}

export function assess(s: Scenario, facts: Fact[], weights: Map<string, number>): ScenarioAssessment {
  const t = test(s.gap, facts, weights);
  return {
    scenario: s.id, state: t.state, confidence: t.confidence, evidence: t.evidence,
    expected_loss_per_year: { low: s.frequency_per_year.low * s.loss_per_event.low, high: s.frequency_per_year.high * s.loss_per_event.high },
  };
}

/** Product of two ranges where either may cross zero. */
function times(a: Range, b: Range, k: number): Range {
  const p = [a.low * b.low, a.low * b.high, a.high * b.low, a.high * b.high].map((x) => x * k);
  return { low: Math.min(...p), high: Math.max(...p) };
}

/**
 * Expected annual loss removed by an action, summed over the scenarios it touches. Reductions
 * count only where the gap is evidenced, scaled by evidence confidence. Risk an action adds (a
 * drop) counts in full whatever the evidence, so dropping a control is never made to look free.
 */
export function riskRemoved(action: Action, assessed: Map<string, ScenarioAssessment>): Range {
  let low = 0, high = 0;
  for (const r of action.reduces) {
    const a = assessed.get(r.scenario);
    if (!a) throw new Error(`Action ${action.id} names unknown scenario ${r.scenario}`);
    const adds = r.fraction.low < 0;
    const k = adds ? 1 : a.state === "gap_supported" ? a.confidence : 0;
    const part = times(a.expected_loss_per_year, r.fraction, k);
    (low += part.low), (high += part.high);
  }
  return { low: Math.round(low), high: Math.round(high) };
}

const add = (a: Range, b: Range): Range => ({ low: a.low + b.low, high: a.high + b.high });
const mid = (r: Range) => (r.low + r.high) / 2;
const money = (n: number) => `$${Math.round(n / 1000)}k`;
const span = (r: Range, f: (n: number) => string) => (r.low === r.high ? f(r.low) : `${f(r.low)}–${f(r.high)}`);

function ownerAndDue(action: Action, graph: ContextGraph, facts: Fact[], asOf: string, horizonDays: number) {
  const owner = graph.follow(action.control, "owned_by");
  const launches = graph.into(action.control, "depends_on");
  const dates = facts.filter((f) => launches.includes(f.subject) && f.predicate === "launch_date" && typeof f.value === "string").map((f) => f.value as string);
  const fallback = new Date(Date.parse(`${asOf}T00:00:00Z`) + horizonDays * 86_400_000).toISOString().slice(0, 10);
  return { owner, due: dates.sort()[0] ?? fallback, dueReason: dates.length ? "before the launch that depends on it" : "end of the planning horizon" };
}

export function decide(inputs: DecideInputs, graph: ContextGraph, computedAt: string): Decision {
  const { facts, weights, scenarios, actions, capacity, as_of, viewer } = inputs;
  const sortedFacts = [...facts].sort((a, b) => (`${a.subject}|${a.predicate}|${a.source.record}` < `${b.subject}|${b.predicate}|${b.source.record}` ? -1 : 1));
  const inputs_hash = digest({ viewer, as_of, facts: sortedFacts, weights: Object.fromEntries([...weights].sort()), scenarios, actions, capacity });

  const assessed = new Map(scenarios.map((s) => [s.id, assess(s, facts, weights)]));
  const title = new Map(scenarios.map((s) => [s.id, s.title]));
  const share = capacity.horizon_days / 365;
  const remaining = { security_hours: capacity.security_hours, engineering_hours: capacity.engineering_hours, cash: capacity.cash };
  const hoursBack = { security_hours: 0, engineering_hours: 0 };
  const moves: Move[] = [];
  const deferred: Deferred[] = [];

  const candidates = actions.map((action) => {
    const risk = riskRemoved(action, assessed);
    const hours = add(action.effort.security_hours, action.effort.engineering_hours);
    const prereqs = action.requires.map((c) => ({ c, t: test(c, facts, weights) }));
    const missing = prereqs.filter((p) => p.t.state !== "gap_supported");
    const evidenced = action.mode === "drop" || action.reduces.some((r) => assessed.get(r.scenario)!.state === "gap_supported");
    const evidence = [...action.reduces.flatMap((r) => assessed.get(r.scenario)!.evidence), ...prereqs.flatMap((p) => p.t.evidence)];
    const score = mid(risk) / Math.max(1, hours.high);
    return { action, risk, hours, missing, evidenced, evidence, score };
  });

  // Drops first: they give capacity back, if the risk they add stays within tolerance.
  const ordered = [...candidates].sort((a, b) => Number(a.action.mode !== "drop") - Number(b.action.mode !== "drop") || b.score - a.score || (a.action.id < b.action.id ? -1 : 1));
  for (const c of ordered) {
    const { action, risk } = c;
    const defer = (reason: string) => deferred.push({ action: action.id, title: action.title, reason });
    if (c.missing.length) {
      defer(`Needs evidence: ${c.missing.map((m) => `${m.c.subject} ${m.c.predicate}`).join(", ")} (no source weighted ${MIN_WEIGHT}+ shows it)`);
      continue;
    }
    if (!c.evidenced) {
      defer(`No evidenced gap: ${action.reduces.map((r) => `"${title.get(r.scenario)}" is ${assessed.get(r.scenario)!.state.replace(/_/g, " ")}`).join("; ")}`);
      continue;
    }
    if (action.mode === "drop" && -risk.low > capacity.drop_risk_tolerance_per_year) {
      defer(`Dropping it could add up to ${money(-risk.low)} a year of risk, above the ${money(capacity.drop_risk_tolerance_per_year)} tolerance`);
      continue;
    }
    const e = action.effort;
    const short = [
      e.security_hours.high > remaining.security_hours && `${e.security_hours.high - remaining.security_hours} security hours`,
      e.engineering_hours.high > remaining.engineering_hours && `${e.engineering_hours.high - remaining.engineering_hours} engineering hours`,
      e.cash.high > remaining.cash && `${money(e.cash.high - remaining.cash)} cash`,
    ].filter(Boolean);
    if (short.length) {
      defer(`Does not fit this horizon: short by ${short.join(", ")}`);
      continue;
    }
    remaining.security_hours -= e.security_hours.high;
    remaining.engineering_hours -= e.engineering_hours.high;
    remaining.cash -= e.cash.high;
    if (action.frees) {
      const sec = Math.floor(action.frees.security_hours.low * share);
      const eng = Math.floor(action.frees.engineering_hours.low * share);
      (remaining.security_hours += sec), (remaining.engineering_hours += eng);
      (hoursBack.security_hours += sec), (hoursBack.engineering_hours += eng);
    }
    const { owner, due, dueReason } = ownerAndDue(action, graph, facts, as_of, capacity.horizon_days);
    const why =
      action.mode === "drop"
        ? `Gives back ${Math.floor(action.frees!.security_hours.low * share) + Math.floor(action.frees!.engineering_hours.low * share)} hours this horizon; adds at most ${money(-risk.low)} a year of risk, within tolerance. Owner from the graph; due ${dueReason}.`
        : `Removes ${span(risk, money)} a year of expected loss for ${span(c.hours, String)} hours: ${action.reduces.map((r) => `"${title.get(r.scenario)}" (confidence ${assessed.get(r.scenario)!.confidence.toFixed(1)})`).join(", ")}. Owner from the graph; due ${dueReason}.`;
    moves.push({ action: action.id, title: action.title, mode: action.mode, risk_removed_per_year: risk, hours: c.hours, cash: action.effort.cash, score: Math.round(c.score), owner, due, why, evidence: c.evidence });
  }

  return {
    id: digest({ inputs_hash, method: METHOD_VERSION }),
    inputs_hash, viewer, computed_at: computedAt,
    next_moves: moves, deferred, scenarios: [...assessed.values()],
    hours_back: hoursBack,
    capacity_used: {
      security_hours: capacity.security_hours + hoursBack.security_hours - remaining.security_hours,
      engineering_hours: capacity.engineering_hours + hoursBack.engineering_hours - remaining.engineering_hours,
      cash: capacity.cash - remaining.cash,
    },
    capacity,
    method: "Expected annual loss = frequency × loss per event (ranges). Risk removed = expected loss × reduction × evidence confidence (strongest source weight / 5), counted only where a gap is evidenced; risk a drop adds counts in full. Drops within tolerance go first and give hours back; the rest are taken by risk removed per hour while they fit at upper effort bounds.",
    authority: "Recommendation only. Nothing executes; a person decides, and the call is kept in decision memory.",
  };
}
