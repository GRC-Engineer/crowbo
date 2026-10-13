import { digest } from "../domain/canonical";
import { FakeApi, readable } from "./connectors";
import { decide, MIN_WEIGHT, type Weighed } from "./decide";
import { derive } from "./derive";
import { extractAll, structuredExtractor } from "./extract";
import { ContextGraph } from "./graph";
import type { ChatModel } from "./ai";
import { DecisionMemory } from "./memory";
import { PREDICATES } from "./predicates";
import type { CompanyFixture, Connector, Decision, Edge, Extractor, Fact, SourceRecord, SourceWeight, Value } from "./model";

/**
 * The engine, wired end to end for one company. Runs "async, on every source": each connector
 * reads its tool on its own schedule, new revisions are classified, facts from different tools
 * are joined, and the decision is precomputed, so asking is a lookup. A decision is addressed by
 * its inputs. Calls a person records become attributed facts, so the next answer uses them.
 * In production each company is one tenant Durable Object and reads run on alarms.
 */

export type Call = "accept" | "override" | "defer" | "exception";
export type Assertion = { subject: string; predicate: string; value: Value };

export interface EngineOptions {
  connectors: Connector[];
  /** Model extractors for prose (Clef through Workers AI, or the offline stand-in). */
  proseExtractors: Extractor[];
  /** Routing and answering model (GLM-5.3-flash or Haiku 5.5); null runs without one, and says so. */
  answerer: ChatModel | null;
  clock?: () => string;
}

export interface ReadLogEntry {
  at: string;
  connector: string;
  records_changed: number;
  facts_added: number;
  edges_added: Pick<Edge, "from" | "rel" | "to">[];
  decision_diff: null | { before: string | null; after: string; added: string[]; removed: string[]; changed_reasons: string[] };
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const factId = (f: Fact) => digest({ s: f.subject, p: f.predicate, v: f.value, r: f.source.record, q: f.quote }).slice(0, 12);

export class Engine {
  readonly memory: DecisionMemory;
  readonly api: FakeApi;
  records = new Map<string, SourceRecord>();
  readAt = new Map<string, string>();
  facts: (Weighed & { id: string })[] = [];
  graph = new ContextGraph([]);
  withheld = 0;
  rejected = 0;
  private weights: Map<string, SourceWeight>;
  private latest: Decision | null = null;
  /** Facts per source revision, so a revision is classified (and a model called) once. */
  private extracted = new Map<string, { facts: Fact[]; rejected: number }>();
  private clock: () => string;

  constructor(readonly fixture: CompanyFixture, readonly options: EngineOptions) {
    if (fixture.synthetic !== true) throw new Error("The prototype engine runs on synthetic fixtures only");
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.memory = new DecisionMemory(this.clock);
    this.api = new FakeApi(fixture.api, fixture.connected_at);
    this.weights = new Map(fixture.weights.map((w) => [w.connector, { ...w }]));
  }

  /** A ready engine: every connector read once at `at` (default: the demo's morning). */
  static async start(fixture: CompanyFixture, options: EngineOptions, at = `${fixture.as_of}T09:00:00Z`): Promise<Engine> {
    const engine = new Engine(fixture, options);
    for (const c of options.connectors) await engine.read(c, at, false);
    await engine.refresh("engine");
    return engine;
  }

  connector(id: string): Connector {
    const c = this.options.connectors.find((x) => x.id === id);
    if (!c) throw new Error(`Unknown connector ${id}`);
    return c;
  }

  label(record: string): string {
    const r = this.records.get(record);
    return r?.label ?? (r ? this.connector(r.connector).label : record.startsWith("memory:") ? "Decision memory" : record);
  }

  /**
   * One scheduled read. A record whose text, readers or coverage changed becomes a new revision;
   * its date always follows the source (the read time for live state, the edit date for documents).
   */
  async read(c: Connector, at: string, recompute = true): Promise<ReadLogEntry> {
    this.api.now = at;
    const before = { facts: new Set(this.facts.map((f) => f.id)), edges: new Set(this.graph.all().map((e) => `${e.from}|${e.rel}|${e.to}`)), decision: this.latest };
    let changed = 0;
    for (const fresh of await c.read(this.api.fetch)) {
      const prev = this.records.get(fresh.id);
      const observed_at = c.live_state ? at.slice(0, 10) : fresh.observed_at;
      const same = prev && prev.text === fresh.text && JSON.stringify(prev.readers) === JSON.stringify(fresh.readers) && JSON.stringify(prev.coverage ?? null) === JSON.stringify(fresh.coverage ?? null);
      if (same) {
        prev.observed_at = observed_at;
        continue;
      }
      this.records.set(fresh.id, { ...fresh, observed_at, revision: (prev?.revision ?? 0) + 1 });
      changed++;
    }
    this.readAt.set(c.id, at);
    if (changed) this.memory.append("read", c.id, { at, records_changed: changed });
    const decision = recompute ? await this.refresh("engine") : null;
    return {
      at, connector: c.id, records_changed: changed,
      facts_added: this.facts.filter((f) => !before.facts.has(f.id)).length,
      edges_added: this.graph.all().filter((e) => !before.edges.has(`${e.from}|${e.rel}|${e.to}`)).map(({ from, rel, to }) => ({ from, rel, to })),
      decision_diff: decision && decision.id !== before.decision?.id ? diff(before.decision, decision) : null,
    };
  }

  /** Classify, join, weigh and decide over everything read so far. Records a decision only when inputs changed. */
  async refresh(actor: string): Promise<Decision> {
    const { readable: visible, withheld } = readable([...this.records.values()], this.fixture.viewer);
    let rejected = 0;
    const extracted: Fact[] = [];
    for (const r of visible) {
      // A revision is classified once; models are not re-run when nothing in the source changed.
      const key = `${r.id}@${r.revision}`;
      if (!this.extracted.has(key)) this.extracted.set(key, await extractAll([r], [structuredExtractor, ...this.options.proseExtractors]));
      const out = this.extracted.get(key)!;
      rejected += out.rejected;
      extracted.push(...out.facts);
    }
    const weighed = extracted.map((f) => this.weigh(f));
    const usable = weighed.filter((f) => f.freshness === "fresh" && f.weight >= MIN_WEIGHT);
    this.facts = [...weighed, ...derive(usable, this.fixture.as_of).map((f) => this.weigh(f))].map((f) => ({ ...f, id: factId(f) }));
    this.withheld = withheld;
    this.rejected = rejected;
    this.graph = new ContextGraph(this.facts.filter((f) => f.weight >= MIN_WEIGHT && f.freshness === "fresh"));
    const decision = decide(
      { viewer: this.fixture.viewer, as_of: this.fixture.as_of, facts: this.facts, scenarios: this.fixture.scenarios, actions: this.fixture.actions, capacity: this.fixture.capacity },
      this.graph, this.clock(),
    );
    if (!this.latest || this.latest.id !== decision.id) {
      this.memory.append("decision", actor, {
        decision: decision.id, inputs_hash: decision.inputs_hash, previous: this.latest?.id ?? null,
        next_moves: decision.next_moves.map((m) => m.action), deferred: decision.deferred.map((d) => d.action),
      });
      this.latest = decision;
    }
    return this.latest;
  }

  /** The company's weight for a fact's sources, and whether every source behind it is still fresh. */
  private weigh(f: Fact): Weighed {
    const records = f.kind === "derived" ? (f.derived_from ?? []).map((r) => r.record) : [f.source.record];
    let weight = 5;
    for (const id of records) {
      const r = this.records.get(id);
      const w = r ? this.weights.get(r.connector) : undefined;
      if (!r || !w) return { ...f, weight: 0, freshness: "stale", stale_reason: `source ${id} unknown` };
      weight = Math.min(weight, w.weight);
      const age = days(this.fixture.as_of, r.observed_at);
      if (age > w.max_age_days) return { ...f, weight, freshness: "stale", stale_reason: `last updated ${r.observed_at}, ${age} days old, past the ${w.max_age_days}-day limit for ${this.label(id)}` };
    }
    return { ...f, weight, freshness: "fresh" };
  }

  nextMoves(): Decision {
    return this.latest!;
  }

  weightsTable(): SourceWeight[] {
    return [...this.weights.values()].sort((a, b) => b.weight - a.weight || (a.connector < b.connector ? -1 : 1));
  }

  async setWeight(connector: string, weight: number, by: string, reason: string) {
    const current = this.weights.get(connector);
    if (!current) throw new Error(`Unknown source ${connector}`);
    if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new Error("Weights are whole numbers from 0 to 5");
    if (!reason.trim()) throw new Error("A weight change needs a reason");
    const before = this.latest!.id;
    this.memory.append("weight_change", by, { connector, from: current.weight, to: weight, reason });
    this.weights.set(connector, { ...current, weight, set_by: by, reason });
    const after = await this.refresh(by);
    return { connector, from: current.weight, to: weight, decision_changed: before !== after.id, decision: after };
  }

  /**
   * A person's call on an action, kept in memory. Statements of fact in the call ("4 of these are
   * break-glass accounts") become a memory record, attributed to the person, that goes through the
   * same pipeline as any source, so the next answer uses it and cites it.
   */
  async recordCall(actionId: string, call: Call, by: string, reason: string, assertions: Assertion[] = [], disputesSource?: string) {
    if (!this.fixture.actions.some((a) => a.id === actionId)) throw new Error(`Unknown action ${actionId}`);
    if (!reason.trim()) throw new Error("A call needs a reason");
    if (disputesSource && !this.weights.has(disputesSource)) throw new Error(`Unknown source ${disputesSource}`);
    // Validate everything before anything is kept: a rejected call leaves memory untouched.
    const current = (subject: string, predicate: string) => this.facts.find((f) => f.subject === subject && f.predicate === predicate && f.freshness === "fresh")?.value;
    for (const a of assertions) {
      const rule = PREDICATES[a.predicate]?.assertable;
      if (!rule) throw new Error(`${a.predicate} cannot be asserted in a call; assertable: ${Object.keys(PREDICATES).filter((k) => PREDICATES[k].assertable).join(", ")}`);
      if (!/^[a-z]+:[A-Za-z0-9._-]+$/.test(a.subject)) throw new Error("An assertion needs a node subject such as group:billing-admins");
      if (typeof a.value === "string" && /[\r\n]/.test(a.value)) throw new Error("Assertion values are single-line");
      const problem = rule(a.value, { factValue: current, subject: a.subject });
      if (problem) throw new Error(problem);
    }
    const before = this.latest!;
    const entry = this.memory.append("call", by, { action: actionId, call, reason, decision: before.id, assertions, ...(disputesSource ? { disputes_source: disputesSource } : {}) });
    if (assertions.length) {
      const id = `memory:${entry.seq}`;
      this.records.set(id, {
        id, connector: "memory", rail: "business", revision: 1, observed_at: this.fixture.as_of, readers: [this.fixture.viewer], label: "Decision memory",
        // Only the validated assertions; the reason and author stay in the memory entry, never parsed.
        format: "lines", text: assertions.map((a) => `${a.subject} ${a.predicate} ${a.value}`).join("\n"),
      });
    }
    const proposals = this.memory.tuningProposals(new Map([...this.weights].map(([k, w]) => [k, w.weight])));
    for (const p of proposals) this.memory.append("proposal", "engine", { ...p, note: "Proposal only: approve by changing the weight." });
    const after = await this.refresh(by);
    return { recorded: entry, proposals, decision_diff: after.id !== before.id ? diff(before, after) : null };
  }

  status() {
    return {
      company: this.fixture.company, viewer: this.fixture.viewer, as_of: this.fixture.as_of, synthetic: true,
      layers: {
        "01_ingest": { connectors: this.options.connectors.map((c) => ({ id: c.id, label: c.label, rail: c.rail, every_minutes: c.every_minutes, last_read: this.readAt.get(c.id) ?? null })), records: this.records.size, records_withheld_from_viewer: this.withheld },
        "02_classify_and_weight": { facts: this.facts.length, derived: this.facts.filter((f) => f.kind === "derived").length, stale: this.facts.filter((f) => f.freshness === "stale").length, facts_rejected_unquoted: this.rejected, extractors: [structuredExtractor.id, ...this.options.proseExtractors.map((x) => x.id)], answering_model: this.options.answerer?.id ?? null, weights: this.weightsTable() },
        "03_context_graph": { edges: this.graph.all().length },
        "04_decision_memory": { entries: this.memory.list().length, chain_intact: this.memory.verify() },
      },
      decision: this.latest?.id ?? null,
      topics: this.fixture.topics.map(({ id, question }) => ({ id, question })),
    };
  }
}

export function diff(before: Decision | null, after: Decision): NonNullable<ReadLogEntry["decision_diff"]> {
  const was = new Set(before?.next_moves.map((m) => m.action) ?? []);
  const now = new Set(after.next_moves.map((m) => m.action));
  const reasons = after.deferred.filter((d) => !before?.deferred.some((b) => b.action === d.action && b.reason === d.reason)).map((d) => `${d.action}: ${d.reason}`);
  const titles = after.next_moves.filter((m) => before?.next_moves.some((b) => b.action === m.action && b.title !== m.title)).map((m) => `${m.action}: now "${m.title}"`);
  return {
    before: before?.id ?? null, after: after.id,
    added: [...now].filter((a) => !was.has(a)), removed: [...was].filter((a) => !now.has(a)),
    changed_reasons: [...titles, ...reasons],
  };
}

/**
 * Replay the first hour after the sources are connected: each connector reads on its own cadence
 * (staggered start), and the log shows records arriving, facts and links forming, and the decision
 * taking shape. A fresh engine, so the live one is untouched.
 */
export async function replaySchedule(fixture: CompanyFixture, options: EngineOptions, minutes = 60): Promise<{ log: ReadLogEntry[]; final: Decision | null }> {
  const engine = new Engine(fixture, options);
  const start = Date.parse(fixture.connected_at);
  const plan: { at: number; c: Connector }[] = [];
  options.connectors.forEach((c, i) => {
    for (let t = start + i * 5 * 60_000; t <= start + minutes * 60_000; t += c.every_minutes * 60_000) plan.push({ at: t, c });
  });
  plan.sort((a, b) => a.at - b.at);
  const log: ReadLogEntry[] = [];
  for (const { at, c } of plan) log.push(await engine.read(c, new Date(at).toISOString().replace(".000", "")));
  return { log, final: engine.nextMoves() ? engine.nextMoves() : null };
}
