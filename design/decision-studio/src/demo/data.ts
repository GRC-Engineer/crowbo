// The demo's only source of facts: the engine output recorded from the real
// stdio MCP server (docs/demo/engine-demo-recorded.json, owned by the backend).
// This module types it and lays it out for the engine view. Layout (which row,
// which column) is presentation; every number and name is read from the
// recording. Demo data built on a case a future customer raised.

import recorded from "../../../../docs/demo/engine-demo-recorded.json" with { type: "json" };

export type Range = { low: number; high: number };

export type Source = {
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
  /** Trust in the connector, 0–5. Rendered when the recording carries it. */
  weight?: number;
  /** Fresh and weighted 2 or more: counted in the arithmetic. */
  used?: boolean;
};

export type Decide = {
  question: string;
  topic: string;
  lookup_ms: number;
  sources: Source[];
  answer: {
    finding: { text: string; cites: number[]; deciding: boolean; fact_id: string }[];
    move: {
      title: string;
      mode: "fix" | "fund" | "build" | "drop";
      why: string;
      risk_removed_per_year: Range;
      hours: Range;
      cash: Range;
      cites: number[];
    };
    decides: string;
    delivers: string;
    due: { text: string; date: string; cites: number[] };
    conditions: string[];
    unresolved: string[];
  };
  decision_id: string;
};

export type Read = {
  at: string;
  connector: string;
  records_changed: number;
  facts_added: number;
  edges_added: { from: string; rel: string; to: string }[];
  decision_diff: { added: string[] } | null;
};

export type Drafts = {
  channel: string;
  sent: false;
  drafts: { to: string; text: string; cites: number[] }[];
};

export type Call = {
  seq: number;
  at: string;
  actor: string;
  body: {
    action: string;
    call: string;
    reason: string;
    assertions: { subject: string; predicate: string; value: number }[];
  };
};

const R = recorded as unknown as {
  engine_decide: Decide;
  engine_decide_after_call: Decide;
  engine_draft_followups: Drafts;
  engine_run_schedule: { log: Read[] };
  engine_record_call: { recorded: Call };
  engine_weekly_brief: { markdown: string; decision_id: string };
};

export const first = R.engine_decide;
export const afterCall = R.engine_decide_after_call;
export const drafts = R.engine_draft_followups;
export const call = R.engine_record_call.recorded;
export const brief = R.engine_weekly_brief;
export const log = R.engine_run_schedule.log;

/** Reads that changed something, in the order the schedule ran them. */
export const reads = log.filter((read) => read.records_changed > 0);
export const totals = {
  reads: log.length,
  facts: log.reduce((sum, read) => sum + read.facts_added, 0),
  links: log.reduce((sum, read) => sum + read.edges_added.length, 0),
};

export const names: Record<string, string> = {
  okta: "Okta",
  billing: "Billing apps",
  sheets: "Risk register",
  linear: "Linear",
  "vendor-docs": "Vendor docs",
  workday: "Workday",
  slack: "Slack",
  memory: "Memory",
};

export const hhmm = (iso: string) => iso.slice(11, 16);
export const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
export const money = (value: number) =>
  Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;

// ───────── the engine view: rows in time, facts in rows, links between them

export type Node = {
  id: string;
  row: number;
  col: number;
  text: string;
  sub?: string;
  cites: number[];
  stale?: boolean;
};
export type Edge = { from: string; to: string; rel: string };
export type Layout = {
  decide: Decide;
  rows: { at: string; connector: string; facts: number; links: number; note?: string }[];
  nodes: Node[];
  edges: Edge[];
  intoDecision: string[];
  /** Row at which the move first appeared in the schedule log. */
  moveRow: number;
};

const numbers = (text: string) => [...text.matchAll(/\d+/g)].map(([n]) => Number(n));
const short = (id: string) => id.split(":")[1] ?? id;
const edgeTo = (rel: string, to: string) =>
  log.flatMap((read) => read.edges_added).find((edge) => edge.rel === rel && edge.to === to);
const edgeFrom = (from: string, rel: string) =>
  log.flatMap((read) => read.edges_added).find((edge) => edge.from === from && edge.rel === rel);

export function layout(decide: Decide): Layout {
  const withMemory = decide === afterCall;
  const rowOf = (connector: string) =>
    reads.findIndex((read) => read.connector === connector);
  const source = (connector: string) =>
    decide.sources.find((item) => item.connector === connector);
  const cite = (connector: string) => {
    const found = source(connector);
    return found ? [found.n] : [];
  };

  const okta = source("okta")!;
  const billing = source("billing")!;
  const register = source("sheets")!;
  const [unused, holders] = numbers(billing.claim);
  const owner = edgeTo("business_owner", "person:priya") ? "person:priya" : "";
  const ownerTeam = edgeFrom(owner, "leads") ?? edgeFrom(owner, "member_of");
  const control = edgeFrom("launch:audit-prep", "depends_on")!.to;
  const assignee = edgeFrom(control, "assigned_to")!.to;
  const assigneeTeam = edgeFrom(assignee, "member_of");
  const name = (person: string) => {
    const id = short(person);
    return id[0].toUpperCase() + id.slice(1);
  };

  const nodes: Node[] = [
    { id: "group", row: rowOf("okta"), col: 0, text: `${short("group:billing-admins")} · ${numbers(okta.claim)[0]}`, cites: cite("okta") },
    { id: "app", row: rowOf("okta"), col: 1, text: `${short("app:billing")} app`, cites: [] },
    { id: "unused", row: rowOf("billing"), col: 0, text: `${unused} of ${holders} unused`, cites: cite("billing") },
    { id: "register", row: rowOf("sheets"), col: 2, text: `${numbers(register.claim).at(-1)} holders`, cites: cite("sheets"), stale: register.freshness === "stale" },
    { id: "launch", row: rowOf("linear"), col: 2, text: `${short("launch:audit-prep").replace("-", " ")} · ${day(decide.answer.due.date)}`, cites: cite("linear") },
    { id: "control", row: rowOf("linear"), col: 3, text: short(control), cites: [] },
    { id: "role", row: rowOf("vendor-docs"), col: 0, text: "Billing Operator role", cites: cite("vendor-docs") },
    { id: "priya", row: rowOf("workday"), col: 1, text: name(owner), sub: ownerTeam ? short(ownerTeam.to) : undefined, cites: [] },
    { id: "alex", row: rowOf("workday"), col: 3, text: name(assignee), sub: assigneeTeam ? short(assigneeTeam.to) : undefined, cites: [] },
  ];
  const rows: Layout["rows"] = reads.map((read) => ({
    at: read.at,
    connector: read.connector,
    facts: read.facts_added,
    links: read.edges_added.length,
  }));
  if (withMemory) {
    const kept = call.body.assertions[0]?.value;
    rows.push({
      at: call.at,
      connector: "memory",
      facts: call.body.assertions.length,
      links: 0,
      note: `${call.actor.split(" ")[0]} · ${call.body.call}`,
    });
    nodes.push({ id: "kept", row: rows.length - 1, col: 0, text: `${kept} break-glass kept`, cites: cite("memory") });
  }
  const added = log.find((read) => read.decision_diff?.added?.includes(call.body.action));
  return {
    decide,
    rows,
    nodes,
    edges: [
      { from: "group", to: "app", rel: "admin on" },
      { from: "group", to: "unused", rel: "" },
      { from: "unused", to: "role", rel: "covers" },
      { from: "app", to: "priya", rel: "owner" },
      { from: "launch", to: "control", rel: "depends on" },
      { from: "control", to: "alex", rel: "assigned to" },
    ],
    intoDecision: ["role", "priya", "launch", "alex", ...(withMemory ? ["kept"] : [])],
    moveRow: added ? rowOf(added.connector) : reads.length - 1,
  };
}

/** The source a read row contributed to this decision, if any. */
export const sourceForRow = (decide: Decide, connector: string) =>
  decide.sources.find((item) => item.connector === connector);
