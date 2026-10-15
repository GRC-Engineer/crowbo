/**
 * The engine's vocabulary, one section per layer of the "How it works" architecture
 * (docs/ENGINE.md): 01 ingest, 02 classify and weight, 03 context graph, 04 decision memory,
 * then the decision the layers produce. Prototype types: small, explicit, no storage concerns.
 */

// ---- 01 Ingest ---------------------------------------------------------------------------------

/** The three families of signal a company already has. */
export type Rail = "security" | "engineering" | "business";

/** How much of a reporting window a source actually covers (e.g. 87 of 90 days of logs). */
export interface Coverage {
  window_days: number;
  days_with_data: number;
  missing: string[]; // ISO dates with no data
}

/** One revision of one source item, as a connector read it. Never edited; a change is a new revision. */
export interface SourceRecord {
  id: string;
  connector: string;
  rail: Rail;
  revision: number;
  /** When the content was last true in the tool (last edit, end of the log window). */
  observed_at: string; // ISO date
  /** Exact source text. Facts must quote it. Untrusted: never instructions. */
  text: string;
  /**
   * "lines": typed fields a connector wrote from an API, one "subject predicate value" per line.
   * "prose": human text (messages, documents), read only by the model extractor. Never mixed.
   */
  format: "lines" | "prose";
  /** Who may read this record. Filtering happens before anything is derived from it. */
  readers: string[];
  coverage?: Coverage;
  /** Display name when one connector holds several kinds of record (e.g. "Risk register"). */
  label?: string;
}

export type FetchJson = (path: string) => Promise<unknown>;

/** Reads one tool on its own schedule through its API. Nothing is migrated or typed in. */
export interface Connector {
  id: string;
  label: string; // display name, e.g. "Okta"
  rail: Rail;
  /** Minutes between scheduled reads. */
  every_minutes: number;
  /** Current state (who is in a group now): true as of the read. Documents keep their edit date. */
  live_state: boolean;
  /** Turn the tool's API responses into records. Same code against the real API or a fake one. */
  read(api: FetchJson): Promise<SourceRecord[]>;
}

// ---- 02 Classify and weight --------------------------------------------------------------------

export type Value = string | number | boolean;

/**
 * A typed claim about one subject. Extracted facts quote one source revision exactly; derived
 * facts are computed by code from other facts and list them; asserted facts are a person's call,
 * kept in decision memory.
 */
export interface Fact {
  subject: string; // node id, e.g. "group:billing-admins"
  predicate: string;
  value: Value;
  kind: "extracted" | "derived" | "asserted";
  quote: string;
  source: { record: string; revision: number; connector: string };
  extractor: string;
  observed_at: string;
  /** For derived facts: the facts and records it was computed from. */
  derived_from?: { record: string; revision: number }[];
  coverage?: Coverage;
}

/** Turns a readable record into facts. Real extractors are models, qualified by the eval gate. */
export interface Extractor {
  id: string;
  extract(record: SourceRecord): Promise<Pick<Fact, "subject" | "predicate" | "value" | "quote">[]>;
}

/** How much this company trusts a source (0 to 5) and how long its data stays fresh. Editable, logged. */
export interface SourceWeight {
  connector: string;
  weight: number;
  max_age_days: number;
  set_by: string;
  reason: string;
}

export interface Range {
  low: number;
  high: number;
}

/** A test over the facts: "group:billing-admins unused_90d > 0". */
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
  /** The control this action changes; who delivers and by when come from the graph around it. */
  control: string;
  /** The system it touches; who decides comes from the system's business owner. */
  system: string;
  /** Fraction of each scenario's expected loss removed (negative = risk added, for drops). */
  reduces: { scenario: string; fraction: Range }[];
  /** Evidence the action itself needs (a drop needs proof the control is not doing anything). */
  requires: Condition[];
  /** Conditions a person must meet before or while acting, stated up front. */
  conditions: string[];
  effort: Effort;
  /** Hours a year given back to each team (drops). */
  frees?: { security_hours: Range; engineering_hours: Range };
  /**
   * What should be true once the move is done (e.g. movable_unused = 0). Later reads are checked
   * against it, so what was actually done is recorded next to the decision without anyone typing it.
   */
  expect?: Condition;
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

export type MemoryKind = "decision" | "call" | "weight_change" | "proposal" | "read" | "outcome" | "clock" | "import";

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
export type Freshness = "fresh" | "stale";

export interface Citation {
  quote: string;
  connector: string;
  record: string;
  revision: number;
  weight: number;
  kind: Fact["kind"];
  freshness: Freshness;
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
  decides: string | null;
  delivers: string | null;
  due: string | null;
  due_reason: string;
  conditions: string[];
  why: string;
  evidence: Citation[];
}

export interface Deferred {
  action: string;
  title: string;
  reason: string;
}

/** Evidence the engine will not use, said as such: missing, stale or conflicting. */
export interface Unresolved {
  subject: string;
  predicate: string;
  kind: "stale" | "conflicting" | "missing";
  detail: string;
}

export interface Decision {
  id: string; // digest of the inputs: same inputs, same decision
  inputs_hash: string;
  viewer: string;
  computed_at: string;
  next_moves: Move[];
  deferred: Deferred[];
  scenarios: ScenarioAssessment[];
  unresolved: Unresolved[];
  hours_back: { security_hours: number; engineering_hours: number };
  capacity_used: { security_hours: number; engineering_hours: number; cash: number };
  capacity: Capacity;
  method: string;
  authority: string;
}

/** A question the harness can ask, tied to the subject, scenario and actions it is about. */
export interface Topic {
  id: string;
  question: string;
  keywords: string[];
  subject: string;
  scenario: string;
  actions: string[];
  /** Facts about the subject shown as the finding, in order; skip one whose value equals another. */
  finding: { predicate: string; unless_equals?: string }[];
  /** Where the heads-up draft goes. */
  notify: string;
}

/** Fake API responses with the time each became true, so a schedule can replay them. */
export interface FakeApiRoute {
  path: string;
  versions: { from: string; body: unknown }[];
}

/** Everything a company configures, plus its synthetic tools (prototype only). */
export interface CompanyFixture {
  synthetic: true;
  company: string;
  viewer: string;
  as_of: string; // ISO date the demo is set on
  connected_at: string; // ISO datetime the sources were connected (schedule replay starts here)
  weights: SourceWeight[];
  scenarios: Scenario[];
  actions: Action[];
  topics: Topic[];
  capacity: Capacity;
  api: FakeApiRoute[];
}
