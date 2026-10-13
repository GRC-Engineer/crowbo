// The harness exchange: one question asked in an AI harness, answered by the
// Crowbo engine over MCP, and one follow-up that drafts notes in Slack.
//
// The engine side is recorded output from the real stdio MCP server
// (engine-recorded.json, a snapshot of docs/demo/engine-demo-recorded.json on
// the backend branch feat/engine-demo, commit 1451a4c). The types below are
// the contract agreed with the backend session on 13 October 2026. Only the
// two things the person types in the harness are written here; every number,
// claim, owner and date comes from the recording. Demo data built on a case a
// future customer raised.

import recorded from "./engine-recorded.json";

export type Range = { low: number; high: number };

export type Source = {
  n: number;
  connector: string;
  label: string;
  record: string;
  claim: string;
  /** ISO time of the read; null for facts kept in decision memory. */
  read_at: string | null;
  coverage: "full" | "partial";
  freshness: "fresh" | "stale";
  stale_reason?: string;
  conflicts_with?: number[];
  fact_id: string;
};

export type Finding = {
  text: string;
  cites: number[];
  /** True for the facts the move depends on. */
  deciding: boolean;
  fact_id: string;
};

export type Decide = {
  question: string;
  topic: string;
  elapsed_ms: number;
  lookup_ms: number;
  sources: Source[];
  answer: {
    finding: Finding[];
    move: {
      title: string;
      mode: "fix" | "fund" | "build" | "drop";
      why: string;
      risk_removed_per_year?: Range;
      hours?: Range;
      cash?: Range;
      cites: number[];
    };
    decides: string;
    delivers: string;
    due: { text: string; date?: string; cites: number[] };
    conditions: string[];
    unresolved: string[];
  };
  decision_id: string;
  synthetic: boolean;
  summary: { text: string; generated_by: string };
  models: { routing: string; summary: string; ingestion: string[] };
};

export type Drafts = {
  channel: string;
  sent: false;
  generated_by: string;
  drafts: { to: string; text: string; cites: number[] }[];
};

const engine = recorded as unknown as {
  engine_decide: Decide;
  engine_draft_followups: Drafts;
};

export const exchange = {
  session: "Legacy admin access",
  /** What the person types in the harness. */
  ask: "Our top risk is still legacy admin access. What do we actually do about it this quarter?",
  followup:
    "Yes. Draft the three notes in Slack and put them in front of me to review.",
  decide: engine.engine_decide,
  drafts: engine.engine_draft_followups,
};
