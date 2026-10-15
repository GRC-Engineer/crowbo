import { EngineError } from "./errors";
import { digest } from "../domain/canonical";
import { FakeApi, readable } from "./connectors";
import { decide, MIN_WEIGHT, type Weighed } from "./decide";
import { derive } from "./derive";
import { extractAll, structuredExtractor } from "./extract";
import { ContextGraph } from "./graph";
import type { ChatModel } from "./ai";
import { DecisionMemory } from "./memory";
import { PREDICATES } from "./predicates";
import type { CompanyFixture, Condition, Connector, Decision, Edge, Extractor, Fact, MemoryEntry, SourceRecord, SourceWeight, Value } from "./model";
import { checkLimits, KB_CONNECTOR, KB_DEFAULT_WEIGHT, type KbFile, type KbFileResult, kbProfile, toRecords } from "./kb";
import { type EngineState, type EngineStore, MemoryEngineStore } from "./store";

/**
 * The engine, wired end to end for one company. Runs "async, on every source": each connector
 * reads its tool on its own schedule, new revisions are classified, facts from different tools
 * are joined, and the decision is precomputed, so asking is a lookup. A decision is addressed by
 * its inputs. Calls a person records become attributed facts, so the next answer uses them.
 * State persists through an EngineStore (the tenant Durable Object on staging); facts and the
 * decision are recomputed from it on load. Reads run lazily: each call first performs any due read.
 */

export type OutcomeStatus = "done" | "partly_done" | "not_done_by_due" | "diverged" | "unconfirmed_by_due";
export const OUTCOME_STATUSES: OutcomeStatus[] = ["done", "partly_done", "not_done_by_due", "diverged", "unconfirmed_by_due"];
/** A demo copy stops accepting writes past this many memory entries; reset it to start over. */
export const MEMORY_CAP = 2000;

export type Call = "accept" | "override" | "defer" | "exception";

/** Connectors that became a class: the old id, the class id. A stored engine is migrated on open. */
const RENAMED: Record<string, string> = { okta: "identity", linear: "tickets" };
export type Assertion = { subject: string; predicate: string; value: Value };
/** Where a call was made: a Slack thread's permalink. Checked here, at the boundary of what memory keeps. */
export type Provenance = { permalink: string };
export const PERMALINK = /^https:\/\/[a-z0-9-]{1,63}\.slack\.com\/archives\/[CDG][A-Z0-9]{8,32}\/p\d{16}$/;

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
  /** The demo clock: what "now" is for reads, freshness and due dates. */
  now: string;

  constructor(readonly fixture: CompanyFixture, readonly options: EngineOptions, private store: EngineStore = new MemoryEngineStore(), state: EngineState | null = null) {
    if (fixture.synthetic !== true) throw new EngineError("The prototype engine runs on synthetic fixtures only");
    this.now = state?.now || fixture.connected_at;
    this.clock = options.clock ?? (() => this.now);
    this.memory = new DecisionMemory(this.clock, (e) => this.store.appendMemory(e), state?.memory ?? []);
    this.api = new FakeApi(fixture.api, this.now);
    this.weights = new Map(fixture.weights.map((w) => [w.connector, { ...w }]));
    for (const w of state?.weights ?? []) this.weights.set(w.connector, { ...w });
    for (const r of state?.records ?? []) this.records.set(r.id, r);
    for (const [c, at] of Object.entries(state?.readAt ?? {})) this.readAt.set(c, at);
  }

  /** Open the engine on a store: reload what was kept, or read every source once on first use. */
  static async open(fixture: CompanyFixture, options: EngineOptions, store: EngineStore = new MemoryEngineStore(), firstRead = `${fixture.as_of}T09:00:00Z`): Promise<Engine> {
    const state = store.load();
    const engine = new Engine(fixture, options, store, state);
    if (state) engine.migrate();
    if (!state) {
      engine.setNow(firstRead);
      for (const c of options.connectors) await engine.read(c, firstRead, false);
    }
    await engine.refresh("engine");
    return engine;
  }

  /** A ready engine on a fresh in-memory store (tests, the local server). */
  static start(fixture: CompanyFixture, options: EngineOptions, at?: string): Promise<Engine> {
    return Engine.open(fixture, options, new MemoryEngineStore(), at);
  }

  /**
   * Carry a stored engine across a connector rename. The company's weight moves to the class with a
   * logged weight change, so the chain says why decision IDs changed; the old connector's records and
   * last read are dropped, and the class reads its source again on the next request.
   */
  private migrate() {
    for (const [old, now] of Object.entries(RENAMED)) {
      const held = this.weights.has(old) || this.readAt.has(old) || [...this.records.values()].some((r) => r.connector === old);
      if (!held || !this.options.connectors.some((c) => c.id === now)) continue;
      // The company's own weight if it set one, otherwise the default it was using.
      const w = this.weights.get(old) ?? this.fixture.weights.find((x) => x.connector === now);
      if (w) {
        const next = { ...w, connector: now };
        this.memory.append("weight_change", "engine", { connector: now, renamed_from: old, from: w.weight, to: w.weight, reason: `connector class rename: ${old} is now a provider of the ${now} connector` });
        this.store.deleteWeight(old);
        this.store.saveWeight(next);
        this.weights.delete(old);
        this.weights.set(now, next);
      }
      for (const r of [...this.records.values()].filter((x) => x.connector === old)) {
        this.store.deleteRecord(r.id);
        this.records.delete(r.id);
      }
      this.store.deleteReadAt(old);
      this.readAt.delete(old);
    }
  }

  asOf(): string {
    return this.now.slice(0, 10);
  }

  private setNow(at: string) {
    this.now = at;
    this.api.now = at;
    this.store.saveNow(at);
  }

  /** Everything kept, for a what-if copy. */
  snapshot(): EngineState {
    return { records: [...this.records.values()].map((r) => structuredClone(r)), weights: this.weightsTable(), memory: this.memory.list(), readAt: Object.fromEntries(this.readAt), now: this.now };
  }

  connector(id: string): Connector {
    const c = this.options.connectors.find((x) => x.id === id);
    if (!c) throw new EngineError(`Unknown connector ${id}`);
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
    if (at > this.now) this.setNow(at);
    this.api.now = at;
    const before = { facts: new Set(this.facts.map((f) => f.id)), edges: new Set(this.graph.all().map((e) => `${e.from}|${e.rel}|${e.to}`)), decision: this.latest };
    let changed = 0;
    for (const fresh of await c.read(this.api.fetch)) if (this.keep(fresh, c.live_state ? at.slice(0, 10) : fresh.observed_at)) changed++;
    this.store.saveReadAt(c.id, at);
    this.readAt.set(c.id, at);
    if (changed) this.memory.append("read", c.id, { at, records_changed: changed });
    const decision = recompute ? await this.refresh("engine", true) : null;
    return {
      at, connector: c.id, records_changed: changed,
      facts_added: this.facts.filter((f) => !before.facts.has(f.id)).length,
      edges_added: this.graph.all().filter((e) => !before.edges.has(`${e.from}|${e.rel}|${e.to}`)).map(({ from, rel, to }) => ({ from, rel, to })),
      decision_diff: decision && decision.id !== before.decision?.id ? diff(before.decision, decision) : null,
    };
  }

  /** Keep a record read from a source: a new revision when its text, readers or coverage changed. Returns whether it did. */
  private keep(fresh: Omit<SourceRecord, "revision">, observed_at: string): boolean {
    const prev = this.records.get(fresh.id);
    const same = prev && prev.text === fresh.text && prev.format === fresh.format && JSON.stringify(prev.readers) === JSON.stringify(fresh.readers) && JSON.stringify(prev.coverage ?? null) === JSON.stringify(fresh.coverage ?? null);
    if (same) {
      if (prev.observed_at !== observed_at) this.store.saveRecord({ ...prev, observed_at });
      prev.observed_at = observed_at;
      return false;
    }
    const next = { ...fresh, observed_at, revision: (prev?.revision ?? 0) + 1 };
    this.store.saveRecord(next);
    this.records.set(fresh.id, next);
    return true;
  }

  /**
   * Import a knowledge-base export: each file becomes a "kb" record (typed lines from a mapped CSV,
   * or prose), facts go through the same quote check as any source, and the decision is recomputed.
   * Only an export declared synthetic is accepted until the founders clear real exports. Everything is
   * validated before anything is kept. Re-importing an unchanged export writes nothing; otherwise
   * memory keeps the import (a digest per file, never its text) and, the first time, the default
   * weight for "kb" as a weight change with its reason.
   */
  async importKnowledgeBase(files: KbFile[], by: string, declaration: { synthetic: true }) {
    const started = performance.now();
    if (declaration?.synthetic !== true) throw new EngineError("Only an export declared synthetic is imported until the founders clear real exports");
    checkLimits(files);
    const prepared: ({ file: KbFile } & Awaited<ReturnType<typeof toRecords>>)[] = [];
    for (const f of files) prepared.push({ file: f, ...(await toRecords(f, this.fixture.viewer, this.asOf())) });
    const before = this.latest;
    const results: KbFileResult[] = prepared.map(({ file, records, format, reason }) => {
      const changed = records.map((r) => this.keep(r, r.observed_at)).some(Boolean);
      const first = records[0];
      return {
        path: file.path, record: first?.id ?? null, ...(records.length > 1 ? { records: records.map((r) => r.id) } : {}),
        format, revision: first ? this.records.get(first.id)!.revision : null, changed, ...(reason ? { reason } : {}),
      };
    });
    if (results.some((r) => r.changed)) {
      if (!this.weights.has(KB_CONNECTOR)) {
        const w = KB_DEFAULT_WEIGHT;
        this.memory.append("weight_change", by, { connector: w.connector, from: null, to: w.weight, max_age_days: w.max_age_days, reason: w.reason, default: true });
        this.store.saveWeight(w);
        this.weights.set(w.connector, { ...w });
      }
      this.memory.append("import", by, {
        declared: "synthetic",
        files: results.map((r, i) => ({ path: r.path, record: r.record, format: r.format, revision: r.revision, changed: r.changed, sha256: digest({ content: files[i].content }) })),
      });
    }
    const after = await this.refresh(by);
    return {
      profile: kbProfile(this, results),
      decision_id: after.id,
      decision_diff: after.id !== before?.id ? diff(before, after) : null,
      elapsed_ms: Math.round(performance.now() - started),
    };
  }

  /** Classify, join, weigh and decide over everything read so far. Records a decision only when inputs changed. */
  /**
   * `judge`: this refresh follows a read or a clock move, so outcomes are checked against the latest
   * decision that proposed each move, before a new decision is kept. Calls and weight changes never
   * judge: they change what Crowbo knows, not what anyone did.
   */
  async refresh(actor: string, judge = false): Promise<Decision> {
    const { readable: visible, withheld } = readable([...this.records.values()], this.fixture.viewer, this.fixture.grants);
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
    this.facts = [...weighed, ...derive(usable, this.asOf()).map((f) => this.weigh(f))].map((f) => ({ ...f, id: factId(f) }));
    this.withheld = withheld;
    this.rejected = rejected;
    this.graph = new ContextGraph(this.facts.filter((f) => f.weight >= MIN_WEIGHT && f.freshness === "fresh"));
    const decision = decide(
      { viewer: this.fixture.viewer, as_of: this.asOf(), facts: this.facts, scenarios: this.fixture.scenarios, actions: this.fixture.actions, capacity: this.fixture.capacity },
      this.graph, this.clock(),
    );
    this.latest = decision;
    if (judge) this.trackOutcomes();
    const lastKept = this.memory.list("decision").at(-1)?.body.decision;
    if (lastKept !== decision.id) {
      // Each proposed move keeps the value its expectation started from, so outcomes can be judged later.
      const expected = Object.fromEntries(decision.next_moves.flatMap((m) => {
        const a = this.fixture.actions.find((x) => x.id === m.action);
        return a?.expect ? [[m.action, { condition: a.expect, baseline: this.value(a.expect) ?? null, due: m.due }]] : [];
      }));
      this.memory.append("decision", actor, {
        decision: decision.id, inputs_hash: decision.inputs_hash, previous: lastKept ?? null,
        next_moves: decision.next_moves.map((m) => m.action), deferred: decision.deferred.map((d) => d.action), expected,
      });
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
      const age = days(this.asOf(), r.observed_at);
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
    if (!current) throw new EngineError(`Unknown source ${connector}`);
    if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new EngineError("Weights are whole numbers from 0 to 5");
    if (!reason.trim()) throw new EngineError("A weight change needs a reason");
    const before = this.latest!.id;
    this.memory.append("weight_change", by, { connector, from: current.weight, to: weight, reason });
    const next = { ...current, weight, set_by: by, reason };
    this.store.saveWeight(next);
    this.weights.set(connector, next);
    const after = await this.refresh(by);
    return { connector, from: current.weight, to: weight, decision_changed: before !== after.id, decision: after };
  }

  /**
   * A person's call on an action, kept in memory. Statements of fact in the call ("4 of these are
   * break-glass accounts") become a memory record, attributed to the person, that goes through the
   * same pipeline as any source, so the next answer uses it and cites it.
   */
  async recordCall(actionId: string, call: Call, by: string, reason: string, assertions: Assertion[] = [], disputesSource?: string, provenance?: Provenance) {
    if (!this.fixture.actions.some((a) => a.id === actionId)) throw new EngineError(`Unknown action ${actionId}`);
    if (provenance && !PERMALINK.test(provenance.permalink)) throw new EngineError("A call's provenance must be a Slack thread permalink");
    if (!reason.trim()) throw new EngineError("A call needs a reason");
    if (disputesSource && !this.weights.has(disputesSource)) throw new EngineError(`Unknown source ${disputesSource}`);
    // Validate everything before anything is kept: a rejected call leaves memory untouched.
    const current = (subject: string, predicate: string) => this.facts.find((f) => f.subject === subject && f.predicate === predicate && f.freshness === "fresh")?.value;
    for (const a of assertions) {
      const rule = PREDICATES[a.predicate]?.assertable;
      if (!rule) throw new EngineError(`${a.predicate} cannot be asserted in a call; assertable: ${Object.keys(PREDICATES).filter((k) => PREDICATES[k].assertable).join(", ")}`);
      if (!/^[a-z]+:[A-Za-z0-9._-]+$/.test(a.subject)) throw new EngineError("An assertion needs a node subject such as group:billing-admins");
      if (typeof a.value === "string" && /[\r\n]/.test(a.value)) throw new EngineError("Assertion values are single-line");
      const problem = rule(a.value, { factValue: current, subject: a.subject });
      if (problem) throw new EngineError(problem);
    }
    const before = this.latest!;
    const entry = this.memory.append("call", by, { action: actionId, call, reason, decision: before.id, assertions, ...(disputesSource ? { disputes_source: disputesSource } : {}), ...(provenance ? { provenance } : {}) });
    if (assertions.length) {
      const id = `memory:${entry.seq}`;
      const record: SourceRecord = {
        id, connector: "memory", rail: "business", revision: 1, observed_at: this.asOf(), readers: [this.fixture.viewer], label: "Decision memory",
        // Only the validated assertions; the reason and author stay in the memory entry, never parsed.
        format: "lines", text: assertions.map((a) => `${a.subject} ${a.predicate} ${a.value}`).join("\n"),
        ...(provenance ? { link: provenance.permalink } : {}),
      };
      this.store.saveRecord(record);
      this.records.set(id, record);
    }
    const proposals = this.memory.tuningProposals(new Map([...this.weights].map(([k, w]) => [k, w.weight])));
    for (const p of proposals) this.memory.append("proposal", "engine", { ...p, note: "Proposal only: a person accepts it with accept_proposal." });
    const after = await this.refresh(by);
    return { recorded: entry, proposals, decision_diff: after.id !== before.id ? diff(before, after) : null };
  }

  /**
   * A person accepts a weight proposal: the weight changes as proposed, the change is kept against
   * the proposal, and the decision is recomputed. Refused if the proposal is unknown, already
   * accepted, or the weight has changed since it was proposed (the proposal no longer applies).
   */
  async acceptProposal(seq: number, by: string) {
    const proposal = this.memory.list("proposal").find((e) => e.seq === seq);
    if (!proposal) throw new EngineError(`No proposal ${seq}`);
    if (this.memory.list("weight_change").some((e) => e.body.proposal === seq)) throw new EngineError(`Proposal ${seq} was already accepted`);
    const { connector, from, to, disputes } = proposal.body as { connector: string; from: number; to: number; disputes: number };
    const current = this.weights.get(connector);
    if (!current) throw new EngineError(`Unknown source ${connector}`);
    // Stale once the weight has changed after the proposal, even if it has since come back to the same value.
    const since = this.memory.list("weight_change").find((e) => e.body.connector === connector && e.seq > seq);
    if (since || current.weight !== from) throw new EngineError(`Proposal ${seq} was for ${connector} at ${from}; the weight has changed since (now ${current.weight}), so the proposal no longer applies`);
    const before = this.latest!;
    const reason = `Accepted proposal ${seq}: ${disputes} recorded calls disputed ${connector}`;
    this.memory.append("weight_change", by, { connector, from, to, reason, proposal: seq });
    const next = { ...current, weight: to, set_by: by, reason };
    this.store.saveWeight(next);
    this.weights.set(connector, next);
    const after = await this.refresh(by);
    const changed = after.id !== before.id ? diff(before, after) : null;
    return {
      connector, from, to, proposal: seq,
      decision_diff: changed && { ...changed, because: `${connector} weight ${from} → ${to}, accepted from proposal ${seq}` },
      decision: after,
    };
  }

  /** The current usable value of a condition's subject and predicate. */
  private value(c: Condition): Value | undefined {
    return this.facts.find((f) => f.subject === c.subject && f.predicate === c.predicate && f.freshness === "fresh" && f.weight >= MIN_WEIGHT)?.value;
  }

  /**
   * What was done after each move was proposed, read from later sources: the expectation now holds
   * (done), moved toward it (partly done), moved the other way (diverged), or nothing changed by the
   * due date. A status is written once per change, against the decision that proposed the move.
   */
  private trackOutcomes() {
    for (const action of this.fixture.actions) {
      if (!action.expect) continue;
      // The latest decision that proposed this move: its baseline and due date are the current promise.
      const proposed = this.memory.list("decision").filter((e) => (e.body.next_moves as string[]).includes(action.id) && (e.body.expected as any)?.[action.id]).at(-1);
      if (!proposed) continue;
      const { baseline, due } = (proposed.body.expected as any)[action.id] as { baseline: Value | null; due: string };
      const now = this.value(action.expect);
      const target = Number(action.expect.value);
      let status: OutcomeStatus | null = null;
      if (now === undefined) status = this.asOf() > due ? "unconfirmed_by_due" : null;
      else if (holds(action.expect, now)) status = "done";
      else if (typeof now === "number" && typeof baseline === "number" && Math.abs(now - target) < Math.abs(baseline - target)) status = "partly_done";
      else if (typeof now === "number" && typeof baseline === "number" && Math.abs(now - target) > Math.abs(baseline - target)) status = "diverged";
      else if (this.asOf() > due) status = "not_done_by_due";
      if (!status) continue;
      const last = this.memory.list("outcome").filter((e) => e.body.action === action.id && e.body.decision === proposed.body.decision && e.body.source === "inferred from later reads").at(-1);
      if (last?.body.status === status && last.body.value === (now ?? null)) continue;
      const evidence = this.facts.filter((f) => f.subject === action.expect!.subject && f.predicate === action.expect!.predicate && f.freshness === "fresh").flatMap((f) => (f.derived_from ?? [{ record: f.source.record, revision: f.source.revision }]));
      this.memory.append("outcome", "engine", { decision: proposed.body.decision, action: action.id, status, source: "inferred from later reads", baseline, value: now ?? null, expected: action.expect, due, evidence });
    }
  }

  /** "What did you do here?": an outcome a person states, for what the reads cannot see. */
  recordOutcome(actionId: string, status: OutcomeStatus, whatWasDone: string, by: string) {
    if (!this.fixture.actions.some((a) => a.id === actionId)) throw new EngineError(`Unknown action ${actionId}`);
    if (!OUTCOME_STATUSES.includes(status)) throw new EngineError(`Outcome must be one of ${OUTCOME_STATUSES.join(", ")}`);
    if (!whatWasDone.trim() || whatWasDone.length > 1000) throw new EngineError("Say what was done, in up to 1000 characters");
    const proposed = this.memory.list("decision").filter((e) => (e.body.next_moves as string[]).includes(actionId)).at(-1);
    if (!proposed) throw new EngineError(`${actionId} was never proposed, so there is no decision to attach an outcome to`);
    return this.memory.append("outcome", by, { decision: proposed.body.decision, action: actionId, status, source: "stated", what_was_done: whatWasDone });
  }

  outcomes(): MemoryEntry[] {
    return this.memory.list("outcome");
  }

  /** Perform every read that is due by now. Called before each request, so the schedule runs without a timer. */
  async catchUp(): Promise<ReadLogEntry[]> {
    const due = this.options.connectors.filter((c) => {
      const last = this.readAt.get(c.id);
      return !last || Date.parse(last) + c.every_minutes * 60_000 <= Date.parse(this.now);
    });
    const log: ReadLogEntry[] = [];
    for (const c of due) log.push(await this.read(c, this.now, false));
    // One refresh after the due reads, judging outcomes even when nothing changed (a due date may have passed).
    if (due.length) await this.refresh("engine", true);
    return log;
  }

  /** Demo only: move the clock forward; the reads that fall due run, and outcomes are judged. */
  async advance(hours: number, by: string) {
    if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 30) throw new EngineError("Advance by 1 to 720 hours");
    const before = this.latest!;
    const outcomesBefore = this.outcomes().length;
    const from = this.now;
    const to = new Date(Date.parse(from) + hours * 3_600_000).toISOString().replace(".000", "");
    this.memory.append("clock", by, { from, to });
    this.setNow(to);
    const reads = (await this.catchUp()).filter((r) => r.records_changed > 0);
    return { from, to, reads, decision_diff: this.latest!.id !== before.id ? diff(before, this.latest!) : null, outcomes: this.outcomes().slice(outcomesBefore) };
  }

  /** The decision under other weights, computed on a copy: nothing is written, nothing is kept. */
  async whatIf(weights: Record<string, number>) {
    for (const [c, w] of Object.entries(weights)) {
      if (!this.weights.has(c)) throw new EngineError(`Unknown source ${c}`);
      if (!Number.isInteger(w) || w < 0 || w > 5) throw new EngineError("Weights are whole numbers from 0 to 5");
    }
    const state = this.snapshot();
    state.weights = state.weights.map((w) => (w.connector in weights ? { ...w, weight: weights[w.connector] } : w));
    const copy = await Engine.open(this.fixture, this.options, new MemoryEngineStore(state));
    return { weights, decision: copy.nextMoves(), diff: diff(this.latest, copy.nextMoves()), kept: false };
  }

  status() {
    return {
      company: this.fixture.company, viewer: this.fixture.viewer, as_of: this.asOf(), now: this.now, synthetic: true,
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

function holds(c: Condition, v: Value): boolean {
  switch (c.op) {
    case "exists": return true;
    case "eq": return v === c.value;
    case "gt": return typeof v === "number" && v > Number(c.value);
    case "lt": return typeof v === "number" && v < Number(c.value);
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
