import { decide } from "./decide";
import { extractAll, scriptedModelExtractor, structuredExtractor } from "./extract";
import { ContextGraph } from "./graph";
import { connectorsFor, type FixtureConnector, ingest } from "./ingest";
import { DecisionMemory } from "./memory";
import type { CompanyFixture, Decision, Extractor, Fact, SourceWeight } from "./model";

/**
 * The engine, wired end to end for one company. Runs "async, on every source": each refresh
 * reads every connector, re-derives facts and the graph, and precomputes the decision, so asking
 * is a lookup. A decision is addressed by its inputs; new evidence or a weight change produces a
 * new decision and records it in memory. In production each company is one tenant Durable Object
 * and refresh runs on connector syncs, not on request.
 */

export type Call = "accept" | "override" | "defer" | "exception";

export interface EngineOptions {
  clock?: () => string;
  /** Labels standing in for the model extractor (prose sources such as Slack). */
  modelLabels?: Record<string, Omit<Fact, "source" | "extractor">[]>;
}

export class Engine {
  readonly memory: DecisionMemory;
  private connectors: Map<string, FixtureConnector>;
  private extractors: Extractor[];
  private weights: Map<string, SourceWeight>;
  private clock: () => string;
  private facts: Fact[] = [];
  private graph = new ContextGraph([]);
  private withheld = 0;
  private rejected = 0;
  private latest!: Decision;

  constructor(private fixture: CompanyFixture, options: EngineOptions = {}) {
    if (fixture.synthetic !== true) throw new Error("The prototype engine runs on synthetic fixtures only");
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.memory = new DecisionMemory(this.clock);
    this.connectors = connectorsFor(fixture);
    this.extractors = [structuredExtractor, scriptedModelExtractor(options.modelLabels ?? {})];
    this.weights = new Map(fixture.weights.map((w) => [w.connector, { ...w }]));
    this.refresh("engine");
  }

  /** Ingest → classify → graph → weigh and decide. Records a new decision only when inputs changed. */
  refresh(actor: string): Decision {
    const { readable, withheld } = ingest(this.connectors.values(), this.fixture.viewer);
    const { facts, rejected } = extractAll(readable, this.extractors);
    this.facts = facts;
    this.withheld = withheld;
    this.rejected = rejected;
    this.graph = new ContextGraph(facts);
    const decision = decide(
      {
        viewer: this.fixture.viewer, as_of: this.fixture.as_of, facts,
        weights: new Map([...this.weights].map(([k, w]) => [k, w.weight])),
        scenarios: this.fixture.scenarios, actions: this.fixture.actions, capacity: this.fixture.capacity,
      },
      this.graph,
      this.clock(),
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

  /** The precomputed answer. A lookup, not a computation. */
  nextMoves(): Decision {
    return this.latest;
  }

  explain(actionId: string) {
    const move = this.latest.next_moves.find((m) => m.action === actionId);
    const deferred = this.latest.deferred.find((d) => d.action === actionId);
    const action = this.fixture.actions.find((a) => a.id === actionId);
    if (!action) throw new Error(`Unknown action ${actionId}`);
    return {
      action, status: move ? "proposed" : "deferred", move: move ?? null, deferred: deferred ?? null,
      graph: this.graph.around(action.control, 2),
      calls: this.memory.list("call").filter((e) => e.body.action === actionId),
    };
  }

  graphAround(node: string, depth = 2) {
    return { node, edges: this.graph.around(node, depth) };
  }

  weightsTable(): SourceWeight[] {
    return [...this.weights.values()].sort((a, b) => b.weight - a.weight || (a.connector < b.connector ? -1 : 1));
  }

  /** Edit a company weight. Logged, then the decision is recomputed. */
  setWeight(connector: string, weight: number, by: string, reason: string) {
    const current = this.weights.get(connector);
    if (!current) throw new Error(`Unknown source ${connector}`);
    if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new Error("Weights are whole numbers from 0 to 5");
    if (!reason.trim()) throw new Error("A weight change needs a reason");
    const before = this.latest.id;
    this.memory.append("weight_change", by, { connector, from: current.weight, to: weight, reason });
    this.weights.set(connector, { connector, weight, set_by: by, reason });
    const after = this.refresh(by);
    return { connector, from: current.weight, to: weight, decision_changed: before !== after.id, decision: after };
  }

  /** A person's call on a proposed or deferred move: kept, and used for tuning proposals. */
  recordCall(actionId: string, call: Call, by: string, reason: string, disputesSource?: string) {
    if (!this.fixture.actions.some((a) => a.id === actionId)) throw new Error(`Unknown action ${actionId}`);
    if (!reason.trim()) throw new Error("A call needs a reason");
    if (disputesSource && !this.weights.has(disputesSource)) throw new Error(`Unknown source ${disputesSource}`);
    const entry = this.memory.append("call", by, { action: actionId, call, reason, decision: this.latest.id, ...(disputesSource ? { disputes_source: disputesSource } : {}) });
    const proposals = this.memory.tuningProposals(new Map([...this.weights].map(([k, w]) => [k, w.weight])));
    for (const p of proposals) this.memory.append("proposal", "engine", { ...p, note: "Proposal only: approve by changing the weight." });
    return { recorded: entry, proposals };
  }

  /** Scripted evidence arrives from a connector (an edit in Okta, a new Jamf report). */
  arrive(eventId: string) {
    const event = this.fixture.events.find((e) => e.id === eventId);
    if (!event) throw new Error(`Unknown event ${eventId}`);
    const connector = this.connectors.get(event.record.connector);
    if (!connector) throw new Error(`No connector ${event.record.connector}`);
    const before = this.latest;
    connector.receive(structuredClone(event.record));
    this.memory.append("evidence", event.record.connector, { event: eventId, record: `${event.record.id}@${event.record.revision}`, description: event.description });
    const after = this.refresh("engine");
    return {
      event: event.description,
      previous_decision: before.id, decision: after.id, stale_before: before.id !== after.id,
      added: after.next_moves.filter((m) => !before.next_moves.some((b) => b.action === m.action)).map((m) => m.action),
      removed: before.next_moves.filter((b) => !after.next_moves.some((m) => m.action === b.action)).map((m) => m.action),
      next_moves: after.next_moves,
    };
  }

  /** Counts that show what each layer did on the last refresh. */
  status() {
    return {
      company: this.fixture.company, viewer: this.fixture.viewer, synthetic: true,
      layers: {
        "01_ingest": { connectors: this.connectors.size, records_withheld_from_viewer: this.withheld },
        "02_classify_and_weight": { facts: this.facts.length, facts_rejected_unquoted: this.rejected, weights: this.weightsTable().map((w) => `${w.connector} ${w.weight}`) },
        "03_context_graph": { edges: this.graph.all().length },
        "04_decision_memory": { entries: this.memory.list().length, chain_intact: this.memory.verify() },
      },
      decision: this.latest.id,
      pending_events: this.fixture.events.map((e) => ({ id: e.id, description: e.description })),
    };
  }
}
