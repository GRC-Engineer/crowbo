import { MIN_WEIGHT, type Weighed } from "./decide";
import type { Engine } from "./engine";
import type { Citation, Decision, Move, Topic } from "./model";
import { nodeName } from "./predicates";

/**
 * What the harness shows: a question answered from the precomputed decision, with numbered
 * sources, the finding, the move, who decides and delivers by when, and what stays unresolved.
 * Also the weekly brief. Words written by a model live in explain.ts. Presentation only: every number
 * comes from the decision and its facts, and what to show is declared by the topic.
 */

type Fact = Weighed & { id: string };

export interface Source {
  n: number;
  connector: string;
  label: string;
  record: string;
  claim: string;
  read_at: string | null;
  coverage: "full" | "partial";
  freshness: "fresh" | "stale";
  stale_reason?: string;
  conflicts_with?: number[];
  fact_id: string;
  /** The company's trust in this source, 0 to 5: the weight the risk arithmetic uses. */
  weight: number;
  /** Whether the decision used it: fresh and weighted at least MIN_WEIGHT. Stale is shown, not used. */
  used: boolean;
}

export interface Answer {
  question: string;
  topic: string;
  elapsed_ms: number;
  sources: Source[];
  answer: {
    finding: { text: string; cites: number[]; deciding: boolean; fact_id: string }[];
    move: null | (Pick<Move, "title" | "mode" | "why" | "risk_removed_per_year" | "hours" | "cash"> & { cites: number[] });
    deferred: null | { title: string; reason: string };
    decides: string | null;
    delivers: string | null;
    due: null | { text: string; date: string; cites: number[] };
    conditions: string[];
    unresolved: string[];
  };
  decision_id: string;
  synthetic: true;
}

export function pickTopic(topics: Topic[], question: string, topic?: string): Topic {
  if (topic) {
    const t = topics.find((x) => x.id === topic);
    if (!t) throw new Error(`Unknown topic ${topic}; known: ${topics.map((x) => x.id).join(", ")}`);
    return t;
  }
  const q = question.toLowerCase();
  const scored = topics.map((t) => ({ t, n: t.keywords.filter((k) => q.includes(k)).length })).sort((a, b) => b.n - a.n);
  if (!scored[0] || scored[0].n === 0) throw new Error(`No topic matches; ask about: ${topics.map((x) => x.question).join(" / ")}`);
  return scored[0].t;
}

const recordsOf = (f: Fact) => (f.kind === "derived" ? (f.derived_from ?? []).map((r) => r.record) : [f.source.record]);
const person = (node: string | null) => (node ? nodeName(node).replace(/^./, (c) => c.toUpperCase()) : null);
const usable = (f: Fact) => f.freshness === "fresh" && f.weight >= MIN_WEIGHT;

/** Number sources in the order the answer first cites them. */
class Numbering {
  private order: string[] = [];
  constructor(private engine: Engine, private facts: Fact[]) {}

  cite(f: Fact): number[] {
    return recordsOf(f)
      .map((r) => {
        if (!this.order.includes(r)) this.order.push(r);
        return this.order.indexOf(r) + 1;
      })
      .sort((a, b) => a - b);
  }

  indexOf(record: string): number | null {
    const i = this.order.indexOf(record);
    return i < 0 ? null : i + 1;
  }

  /** Each source's claim: its own prose, else the joined fact it feeds, else its first fact. */
  sources(): Source[] {
    return this.order.map((id, i) => {
      const r = this.engine.records.get(id)!;
      const own = this.facts.filter((f) => f.source.record === id);
      const claimFact = own.find((f) => r.format === "prose") ?? this.facts.find((f) => f.kind === "derived" && recordsOf(f).includes(id)) ?? own[0];
      const stale = own.find((f) => f.freshness === "stale");
      const weight = this.engine.weightsTable().find((w) => w.connector === r.connector)?.weight ?? 0;
      return {
        weight, used: !stale && weight >= MIN_WEIGHT,
        n: i + 1, connector: r.connector, label: this.engine.label(id), record: id, claim: claimFact?.quote ?? "",
        read_at: this.engine.readAt.get(r.connector) ?? null,
        coverage: r.coverage && r.coverage.days_with_data < r.coverage.window_days ? "partial" : "full",
        freshness: stale ? "stale" : "fresh", ...(stale?.stale_reason ? { stale_reason: stale.stale_reason } : {}),
        fact_id: claimFact?.id ?? "",
      };
    });
  }
}

export function answerTopic(engine: Engine, question: string, topicId?: string, started = performance.now()): Answer {
  const topic = pickTopic(engine.fixture.topics, question, topicId);
  const decision = engine.nextMoves();
  const facts = engine.facts;
  const numbering = new Numbering(engine, facts);
  const factFor = (c: Citation) => facts.find((f) => f.source.record === c.record && f.quote === c.quote);
  const value = (predicate: string) => facts.find((f) => f.subject === topic.subject && f.predicate === predicate && usable(f))?.value;

  // The finding: the topic's declared facts about its subject (these decide), then the move's evidence.
  const finding: Answer["answer"]["finding"] = [];
  for (const { predicate, unless_equals } of topic.finding) {
    const f = facts.find((x) => x.subject === topic.subject && x.predicate === predicate && usable(x));
    if (!f || (unless_equals && value(unless_equals) === f.value)) continue;
    finding.push({ text: f.quote, cites: numbering.cite(f), deciding: true, fact_id: f.id });
  }
  const move = decision.next_moves.find((m) => topic.actions.includes(m.action)) ?? null;
  const deferred = move ? null : (decision.deferred.find((d) => topic.actions.includes(d.action)) ?? null);
  const evidence = (move?.evidence ?? decision.scenarios.find((s) => s.scenario === topic.scenario)?.evidence ?? []).map(factFor).filter((f): f is Fact => !!f);
  const dueFact = evidence.find((f) => f.predicate === "start_date");
  for (const f of evidence) {
    if (f === dueFact || finding.some((x) => x.fact_id === f.id)) continue;
    finding.push({ text: f.quote, cites: numbering.cite(f), deciding: false, fact_id: f.id });
  }
  const moveCites = [...new Set(evidence.filter((f) => f !== dueFact).flatMap((f) => numbering.cite(f)))].sort((a, b) => a - b);
  const dueCites = dueFact ? numbering.cite(dueFact) : [];

  // Stale evidence about the subject is shown, numbered, and never used; conflicts are named, not settled.
  const unresolved: string[] = [];
  const reported = new Set<string>();
  for (const f of facts.filter((x) => x.subject === topic.subject && x.freshness === "stale")) {
    reported.add(`${f.subject}|${f.predicate}`);
    const n = numbering.cite(f)[0];
    const rivals = facts.filter((x) => x.subject === f.subject && x.predicate === f.predicate && usable(x) && x.value !== f.value);
    const against = [...new Set(rivals.flatMap((x) => numbering.cite(x)))];
    finding.push({ text: `${engine.label(f.source.record)} says ${f.value} for ${f.predicate.replace(/_/g, " ")}: ${f.stale_reason}. Shown, not used.`, cites: [n], deciding: false, fact_id: f.id });
    unresolved.push(`[${n}] ${f.quote}: stale (${f.stale_reason})${against.length ? `; conflicts with [${against.join("], [")}]` : ""}`);
  }
  // Conflicts already explained by a stale source above are not repeated.
  for (const u of decision.unresolved.filter((x) => x.subject === topic.subject && x.kind !== "stale" && !reported.has(`${x.subject}|${x.predicate}`))) unresolved.push(`${u.kind}: ${u.detail}`);

  const sources = numbering.sources().map((s) => {
    const stale = facts.filter((f) => f.source.record === s.record && f.freshness === "stale");
    const against = stale
      .flatMap((f) => facts.filter((x) => x.subject === f.subject && x.predicate === f.predicate && usable(x) && x.value !== f.value))
      .flatMap((x) => recordsOf(x).map((r) => numbering.indexOf(r)).filter((n): n is number => n !== null));
    return against.length ? { ...s, conflicts_with: [...new Set(against)] } : s;
  });

  return {
    question, topic: topic.id, elapsed_ms: Math.round((performance.now() - started) * 10) / 10, sources,
    answer: {
      finding,
      move: move ? { title: move.title, mode: move.mode, why: move.why, risk_removed_per_year: move.risk_removed_per_year, hours: move.hours, cash: move.cash, cites: moveCites } : null,
      deferred: deferred ? { title: deferred.title, reason: deferred.reason } : null,
      decides: person(move?.decides ?? null), delivers: person(move?.delivers ?? null),
      due: move ? { text: move.due_reason, date: move.due!, cites: dueCites } : null,
      conditions: move?.conditions ?? [],
      unresolved,
    },
    decision_id: decision.id, synthetic: true,
  };
}

/** The weekly brief a CISO can take to the board: moves, what was decided, hours back, open evidence. */
export function weeklyBrief(engine: Engine): { markdown: string; decision_id: string } {
  const d: Decision = engine.nextMoves();
  const money = (n: number) => `$${Math.round(n / 1000)}k`;
  const calls = engine.memory.list("call");
  const weights = engine.memory.list("weight_change");
  const md = [
    `# Security brief, week of ${engine.fixture.as_of}`,
    `${engine.fixture.company}. Demo data built on a case a future customer raised.`,
    "",
    "## Next moves, by risk removed",
    ...d.next_moves.map((m, i) => `${i + 1}. **${m.title}** (${m.mode}). ${m.why} Decides: ${person(m.decides) ?? "unassigned"}. Delivers: ${person(m.delivers) ?? "unassigned"}. Due ${m.due_reason} (${m.due}).`),
    "",
    `**Hours back this quarter:** ${d.hours_back.security_hours} security, ${d.hours_back.engineering_hours} engineering. **Risk removed if all moves land:** ${money(d.next_moves.reduce((s, m) => s + Math.max(0, m.risk_removed_per_year.low), 0))}–${money(d.next_moves.reduce((s, m) => s + Math.max(0, m.risk_removed_per_year.high), 0))} a year.`,
    "",
    "## Not now, and why",
    ...(d.deferred.length ? d.deferred.map((x) => `- ${x.title}: ${x.reason}`) : ["- Nothing deferred."]),
    "",
    "## Decided this week",
    ...(calls.length ? calls.map((c) => `- ${c.actor}: ${c.body.call} on ${c.body.action}. "${c.body.reason}"`) : ["- No calls recorded yet."]),
    ...weights.map((w) => `- ${w.actor} set ${w.body.connector} weight ${w.body.from} → ${w.body.to}: "${w.body.reason}"`),
    "",
    "## Evidence we did not use",
    ...(d.unresolved.length ? d.unresolved.map((u) => `- ${u.kind}: ${u.detail}`) : ["- None."]),
    "",
    `Decision ${d.id.slice(0, 12)}. Recommendations only; nothing executes.`,
  ].join("\n");
  return { markdown: md, decision_id: d.id };
}
