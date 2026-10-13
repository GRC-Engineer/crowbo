/**
 * The engine's vocabulary, one section per layer of the "How it works" architecture
 * (docs/ENGINE.md): 01 ingest, 02 classify and weight, 03 context graph, 04 decision memory,
 * then the decision the layers produce. Prototype types: small, explicit, no storage concerns.
 */

// ---- 01 Ingest ---------------------------------------------------------------------------------

/** The three families of signal a company already has. */
export type Rail = "security" | "engineering" | "business";

/** One revision of one source item, as a connector read it. Never edited; a change is a new revision. */
export interface SourceRecord {
  id: string;
  connector: string;
  rail: Rail;
  revision: number;
  observed_at: string; // ISO date
  /** Exact source text. Facts must quote it. Untrusted: never instructions. */
  text: string;
  /** Who may read this record. Filtering happens before anything is derived from it. */
  readers: string[];
}

/** Reads one tool on its own schedule. Nothing is migrated or typed in. */
export interface Connector {
  id: string;
  rail: Rail;
  /** Current revision of every item this connector can see. */
  read(): SourceRecord[];
}

// ---- 02 Classify and weight --------------------------------------------------------------------

export type Value = string | number | boolean;

/** A typed claim about one subject, bound to an exact quote from one source revision. */
export interface Fact {
  subject: string; // node id, e.g. "group:billing-admins"
  predicate: string;
  value: Value;
  quote: string;
  source: { record: string; revision: number; connector: string };
  extractor: string;
}

/** Turns a readable record into facts. Real extractors are models, qualified by the eval gate. */
export interface Extractor {
  id: string;
  extract(record: SourceRecord): Omit<Fact, "source" | "extractor">[];
}

/** How much this company trusts a source, 0 (ignore) to 5. Visible, editable, logged. */
export interface SourceWeight {
  connector: string;
  weight: number;
  set_by: string;
  reason: string;
}

export interface Range {
  low: number;
  high: number;
}

/** A test over the facts: "group:billing-admins members_outside_finance > 0". */
export interface Condition {
  subject: string;
  predicate: string;
  op: "gt" | "lt" | "eq" | "exists";
  value?: Value;
}

/** Something bad that could happen, with attributed frequency and loss ranges. */
export interface Scenario {
  id: string;
  title: string;
  frequency_per_year: Range;
  loss_per_event: Range;
  /** Where the estimates come from: observation, expert, reference data, or a model proposal. */
  basis: string;
  /** Evidence that the exposure exists today. */
  gap: Condition;
}

/** Fix, fund, build or drop. A drop stops work that does not move the risk. */
export type Mode = "fix" | "fund" | "build" | "drop";

export interface Effort {
  security_hours: Range;
  engineering_hours: Range;
  cash: Range;
}

export interface Action {
  id: string;
  title: string;
  mode: Mode;
  /** The control this action changes; owner and deadline come from the graph around it. */
  control: string;
  /** Fraction of each scenario's expected loss removed (negative = risk added, for drops). */
  reduces: { scenario: string; fraction: Range }[];
  /** Evidence the action itself needs (a drop needs proof the control is not doing anything). */
  requires: Condition[];
  effort: Effort;
  /** Hours a year given back to each team (drops). */
  frees?: { security_hours: Range; engineering_hours: Range };
  basis: string;
}

/** What the team can spend in the horizon. Unknown capacity is not unlimited. */
export interface Capacity {
  security_hours: number;
  engineering_hours: number;
  cash: number;
  horizon_days: number;
  /** Most expected annual loss a drop may add and still be proposed. Set by the company. */
  drop_risk_tolerance_per_year: number;
}

// ---- 03 Context graph --------------------------------------------------------------------------

/** A relationship no single tool holds, with the source revisions it was derived from. */
export interface Edge {
  from: string;
  rel: string;
  to: string;
  contributors: string[]; // "record@revision"
}

// ---- 04 Decision memory ------------------------------------------------------------------------

export type MemoryKind = "decision" | "call" | "weight_change" | "proposal" | "evidence";

/** Append-only, hash-chained: every call, exception and weight change is kept. */
export interface MemoryEntry {
  seq: number;
  at: string;
  kind: MemoryKind;
  actor: string;
  body: Record<string, unknown>;
  prev: string | null;
  hash: string;
}

// ---- The decision ------------------------------------------------------------------------------

export type GapState = "gap_supported" | "no_gap_observed" | "unresolved";

export interface Citation {
  quote: string;
  connector: string;
  record: string;
  revision: number;
  weight: number;
}

export interface ScenarioAssessment {
  scenario: string;
  state: GapState;
  /** Strongest supporting source weight / 5. Applied to risk removed, shown, never hidden. */
  confidence: number;
  expected_loss_per_year: Range;
  evidence: Citation[];
}

export interface Move {
  action: string;
  title: string;
  mode: Mode;
  risk_removed_per_year: Range;
  hours: Range;
  cash: Range;
  /** Risk removed (midpoint) per hour (upper bound), the ranking key. Drops rank first. */
  score: number;
  owner: string | null;
  due: string | null;
  why: string;
  evidence: Citation[];
}

export interface Deferred {
  action: string;
  title: string;
  reason: string;
}

export interface Decision {
  id: string; // digest of the inputs: same inputs, same decision
  inputs_hash: string;
  viewer: string;
  computed_at: string;
  next_moves: Move[];
  deferred: Deferred[];
  scenarios: ScenarioAssessment[];
  hours_back: { security_hours: number; engineering_hours: number };
  capacity_used: { security_hours: number; engineering_hours: number; cash: number };
  capacity: Capacity;
  method: string;
  authority: string;
}

/** Everything a company configures, plus its synthetic sources (prototype only). */
export interface CompanyFixture {
  synthetic: true;
  company: string;
  viewer: string;
  as_of: string;
  weights: SourceWeight[];
  scenarios: Scenario[];
  actions: Action[];
  capacity: Capacity;
  records: SourceRecord[];
  /** Scripted evidence that can arrive later, to show freshness. */
  events: { id: string; description: string; record: SourceRecord }[];
}
