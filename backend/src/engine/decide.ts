import { digest } from "../domain/canonical";
import type { ContextGraph } from "./graph";
import { isMulti, nodeName } from "./predicates";
import type {
  Action, Capacity, Citation, Condition, Decision, Deferred, Fact, Freshness, Move, Range, Scenario, ScenarioAssessment, Unresolved,
} from "./model";

/**
 * Layer 02b, weigh, and the decision itself: the next moves by risk removed. Deterministic code
 * over facts, visible weights and attributed estimates, so the same inputs always give the same
 * answer and every number can be traced. A model may extract facts or explain the result; it never
 * chooses. The arithmetic is deliberately simple (ranges, a greedy fit); docs/ENGINE.md lists what
 * a production version replaces it with.
 */

export const METHOD_VERSION = "engine-prototype-0.2";
/** A source weighted below this cannot establish a gap or a prerequisite on its own. */
export const MIN_WEIGHT = 2;

/** A fact with the company's weight for its source and whether it is still fresh. */
export type Weighed = Fact & { weight: number; freshness: Freshness; stale_reason?: string };

export interface DecideInputs {
  viewer: string;
  as_of: string;
  facts: Weighed[];
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

export const cite = (f: Weighed): Citation => ({
  quote: f.quote, connector: f.source.connector, record: f.source.record, revision: f.source.revision, weight: f.weight, kind: f.kind, freshness: f.freshness,
});

/** Fresh facts about the condition's subject and predicate from sources weighted MIN_WEIGHT or more. */
const usable = (c: Condition, facts: Weighed[]) =>
  facts.filter((f) => f.subject === c.subject && f.predicate === c.predicate && f.weight >= MIN_WEIGHT && f.freshness === "fresh");

/** Evidence for a condition: supported, contradicted, conflicting or missing. */
function test(c: Condition, facts: Weighed[]) {
  const relevant = usable(c, facts);
  const yes = relevant.filter((f) => holds(c, f));
  const no = relevant.filter((f) => !holds(c, f));
  const state = yes.length && no.length ? "unresolved" : yes.length ? "gap_supported" : no.length ? "no_gap_observed" : "unresolved";
  const confidence = yes.length ? Math.max(...yes.map((f) => f.weight)) / 5 : 0;
  return { state, confidence, evidence: (yes.length ? yes : relevant).map(cite) } as const;
}

/**
 * What the engine will not use, said plainly: stale facts, values that disagree across sources,
 * and conditions no usable fact speaks to. Nothing here is resolved by a model.
 */
export function unresolved(facts: Weighed[], conditions: Condition[]): Unresolved[] {
  const out: Unresolved[] = [];
  for (const f of facts.filter((x) => x.freshness === "stale")) {
    out.push({ subject: f.subject, predicate: f.predicate, kind: "stale", detail: `${f.quote} (${f.source.record}, ${f.stale_reason})` });
  }
  const keys = new Set(facts.filter((f) => !isMulti(f.predicate)).map((f) => `${f.subject}|${f.predicate}`));
  for (const key of keys) {
    const same = facts.filter((f) => `${f.subject}|${f.predicate}` === key && f.weight >= MIN_WEIGHT);
    const values = new Set(same.map((f) => JSON.stringify(f.value)));
    if (values.size > 1) {
      const [subject, predicate] = key.split("|");
      out.push({ subject, predicate, kind: "conflicting", detail: same.map((f) => `${f.source.record} says ${f.value} (${f.freshness})`).join("; ") });
    }
  }
  for (const c of conditions) {
    if (!usable(c, facts).length) out.push({ subject: c.subject, predicate: c.predicate, kind: "missing", detail: `No fresh source weighted ${MIN_WEIGHT}+ states ${c.subject} ${c.predicate}` });
  }
  return out;
}

export function assess(s: Scenario, facts: Weighed[]): ScenarioAssessment {
  const t = test(s.gap, facts);
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

/** Who decides (the system's business owner), who delivers (the control's assignee), by when. */
export function people(action: Action, graph: ContextGraph, facts: Weighed[], asOf: string, horizonDays: number) {
  const launches = graph.into(action.control, "depends_on");
  const starts = facts
    .filter((f) => launches.includes(f.subject) && f.predicate === "start_date" && f.freshness === "fresh" && f.weight >= MIN_WEIGHT && typeof f.value === "string")
    .sort((a, b) => (String(a.value) < String(b.value) ? -1 : 1));
  // Sources that disagree on one launch date are not resolved here: no date is used, and it says why.
  const disputed = launches.filter((l) => new Set(starts.filter((f) => f.subject === l).map((f) => f.value)).size > 1);
  const first = disputed.length ? undefined : starts[0];
  const fallback = new Date(Date.parse(`${asOf}T00:00:00Z`) + horizonDays * 86_400_000).toISOString().slice(0, 10);
  return {
    decides: graph.follow(action.system, "business_owner") ?? graph.follow(action.control, "assigned_to"),
    delivers: graph.follow(action.control, "assigned_to"),
    due: first ? String(first.value) : fallback,
    due_reason: first ? `before ${nodeName(first.subject).replace(/-/g, " ")}` : disputed.length ? `end of the planning horizon; sources disagree on the ${disputed.map((l) => nodeName(l)).join(", ")} date` : "end of the planning horizon",
    due_fact: first ?? null,
  };
}

/** Fill "{subject predicate}" placeholders in a title from fresh, usable facts. */
export function fill(template: string, facts: Weighed[]): string {
  return template.replace(/\{([a-z]+:[A-Za-z0-9._-]+) ([a-z][a-z0-9_]*)\}/g, (whole, subject, predicate) => {
    const f = facts.find((x) => x.subject === subject && x.predicate === predicate && x.freshness === "fresh" && x.weight >= MIN_WEIGHT);
    return f ? String(f.value) : whole;
  });
}

/** Conditions stated up front: the action's own, plus any the evidence imposes (partial coverage). */
function conditionsFor(action: Action, evidence: Citation[], facts: Weighed[]): string[] {
  const partial = facts.find((f) => evidence.some((e) => e.record === f.source.record && e.quote === f.quote) && f.coverage && f.coverage.days_with_data < f.coverage.window_days);
  const gap = partial?.coverage;
  return [...action.conditions, ...(gap ? [`The owner confirms the week with no usage logs (${gap.window_days - gap.days_with_data} days missing: ${gap.missing.join(", ")})`] : [])];
}

export function decide(inputs: DecideInputs, graph: ContextGraph, computedAt: string): Decision {
  const { facts, scenarios, actions, capacity, as_of, viewer } = inputs;
  // The hash covers what the decision depends on: facts, their weight and freshness, not the read time.
  const key = (f: Weighed) => `${f.subject}|${f.predicate}|${JSON.stringify(f.value)}|${f.source.record}|${f.quote}`;
  const sortedFacts = [...facts].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)).map(({ observed_at: _o, stale_reason: _s, ...rest }) => rest);
  const inputs_hash = digest({ viewer, as_of, facts: sortedFacts, scenarios, actions, capacity });

  const assessed = new Map(scenarios.map((s) => [s.id, assess(s, facts)]));
  const title = new Map(scenarios.map((s) => [s.id, s.title]));
  const share = capacity.horizon_days / 365;
  const remaining = { security_hours: capacity.security_hours, engineering_hours: capacity.engineering_hours, cash: capacity.cash };
  const hoursBack = { security_hours: 0, engineering_hours: 0 };
  const moves: Move[] = [];
  const deferred: Deferred[] = [];

  const candidates = actions.map((action) => {
    const risk = riskRemoved(action, assessed);
    const hours = add(action.effort.security_hours, action.effort.engineering_hours);
    const prereqs = action.requires.map((c) => ({ c, t: test(c, facts) }));
    const missing = prereqs.filter((p) => p.t.state !== "gap_supported");
    const evidenced = action.mode === "drop" || action.reduces.some((r) => assessed.get(r.scenario)!.state === "gap_supported");
    // A drop stands on its own prerequisites; it does not borrow the evidence for the gap it touches.
    const gapEvidence = action.mode === "drop" ? [] : action.reduces.flatMap((r) => assessed.get(r.scenario)!.evidence);
    const evidence = [...gapEvidence, ...prereqs.flatMap((p) => p.t.evidence)];
    const score = mid(risk) / Math.max(1, hours.high);
    return { action, risk, hours, missing, evidenced, evidence, score };
  });

  // Drops first: they give capacity back, if the risk they add stays within tolerance.
  const ordered = [...candidates].sort((a, b) => Number(a.action.mode !== "drop") - Number(b.action.mode !== "drop") || b.score - a.score || (a.action.id < b.action.id ? -1 : 1));
  for (const c of ordered) {
    const { action, risk } = c;
    const defer = (reason: string) => deferred.push({ action: action.id, title: fill(action.title, facts), reason });
    if (c.missing.length) {
      defer(`Needs evidence: ${c.missing.map((m) => `${m.c.subject} ${m.c.predicate}`).join(", ")} (no fresh source weighted ${MIN_WEIGHT}+ shows it)`);
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
    let freed = 0;
    if (action.frees) {
      const sec = Math.floor(action.frees.security_hours.low * share);
      const eng = Math.floor(action.frees.engineering_hours.low * share);
      (remaining.security_hours += sec), (remaining.engineering_hours += eng);
      (hoursBack.security_hours += sec), (hoursBack.engineering_hours += eng);
      freed = sec + eng;
    }
    const who = people(action, graph, facts, as_of, capacity.horizon_days);
    const evidence = who.due_fact ? [...c.evidence, cite(who.due_fact)] : c.evidence;
    const why =
      action.mode === "drop"
        ? `Gives back ${freed} hours this horizon; adds at most ${money(-risk.low)} a year of risk, within tolerance.`
        : `Removes ${span(risk, money)} a year of expected loss for ${span(c.hours, String)} hours: ${action.reduces.map((r) => `"${title.get(r.scenario)}" (confidence ${assessed.get(r.scenario)!.confidence.toFixed(1)})`).join(", ")}.`;
    moves.push({
      action: action.id, title: fill(action.title, facts), mode: action.mode, risk_removed_per_year: risk, hours: c.hours, cash: action.effort.cash, score: Math.round(c.score),
      decides: who.decides, delivers: who.delivers, due: who.due, due_reason: who.due_reason,
      conditions: conditionsFor(action, c.evidence, facts), why, evidence,
    });
  }

  return {
    id: digest({ inputs_hash, method: METHOD_VERSION }),
    inputs_hash, viewer, computed_at: computedAt,
    next_moves: moves, deferred, scenarios: [...assessed.values()],
    unresolved: unresolved(facts, [...scenarios.map((s) => s.gap), ...actions.flatMap((a) => a.requires)]),
    hours_back: hoursBack,
    capacity_used: {
      security_hours: capacity.security_hours + hoursBack.security_hours - remaining.security_hours,
      engineering_hours: capacity.engineering_hours + hoursBack.engineering_hours - remaining.engineering_hours,
      cash: capacity.cash - remaining.cash,
    },
    capacity,
    method: "Expected annual loss = frequency × loss per event (ranges). Risk removed = expected loss × reduction × evidence confidence (strongest fresh source weight / 5), counted only where a gap is evidenced; risk a drop adds counts in full. Stale facts are shown, never used. Drops within tolerance go first and give hours back; the rest are taken by risk removed per hour while they fit at upper effort bounds.",
    authority: "Recommendation only. Nothing executes; a person decides, and the call is kept in decision memory.",
  };
}
