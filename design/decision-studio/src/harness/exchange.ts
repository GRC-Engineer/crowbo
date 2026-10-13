// The harness exchange: one question asked in an AI harness, answered by the
// Crowbo engine over MCP, and one follow-up that drafts notes in Slack.
//
// The types mirror the tool output agreed with the backend session on
// 13 October 2026 (`engine_decide` and `engine_draft_followups`). Until those
// tools return it, the exchange below is a hand-written fixture of the same
// shape: demo data built on a case a future customer raised. Swap it for
// recorded tool output when the tools exist; do not derive numbers here.
//
// Optional fields (elapsed time, risk removed, hours, cash) are left out of
// the fixture on purpose. The engine computes them, and the page shows them
// only when the tool output carries them.

export type Connector = "okta" | "billing" | "register" | "linear" | "vendor";

export type Source = {
  n: number;
  fact_id: string;
  connector: Connector;
  /** What the harness shows as the source name. */
  label: string;
  record: string;
  claim: string;
  read_at: string;
  coverage: "full" | "partial";
  /** Shown beside a partial read, e.g. "90-day window · 97% coverage". */
  coverage_note?: string;
  freshness: "fresh" | "stale";
  stale_reason?: string;
  conflicts_with?: number[];
};

export type Cited = { text: string; cites: number[] };
export type Range = { low: number; high: number };

export type Answer = {
  /** Sentences of the finding; strong ones are the facts the move rests on. */
  finding: (Cited & { strong?: boolean })[];
  move: {
    title: string;
    mode: "fix" | "fund" | "build" | "drop";
    why: Cited[];
    risk_removed_per_year?: Range;
    hours?: Range;
    cash?: Range;
  };
  decides: string;
  delivers: string;
  /** When, and the source that sets the deadline. */
  due: Cited;
  conditions: string[];
  unresolved: string[];
};

export type Decide = {
  tool: "engine_decide";
  question: string;
  topic: string;
  elapsed_ms?: number;
  sources: Source[];
  answer: Answer;
  decision_id: string;
};

export type Drafts = {
  tool: "engine_draft_followups";
  request: string;
  channel: string;
  drafts: { to: string; text: string; cites: number[] }[];
  sent: false;
};

export type Exchange = { session: string; decide: Decide; followup: Drafts };

export const exchange: Exchange = {
  session: "Legacy admin access",
  decide: {
    tool: "engine_decide",
    question:
      "Our top risk is still legacy admin access. What do we actually do about it this quarter?",
    topic: "billing-admin",
    sources: [
      {
        n: 1,
        fact_id: "okta:billing-admins:count",
        connector: "okta",
        label: "Okta",
        record: "okta:group/billing-admins",
        claim: "40 accounts hold billing admin",
        read_at: "read 2 min ago",
        coverage: "full",
        freshness: "fresh",
      },
      {
        n: 2,
        fact_id: "billing:admin-usage:90d",
        connector: "billing",
        label: "Billing apps",
        record: "billing:audit-log/admin-actions",
        claim: "31 unused in 90 days",
        read_at: "read 2 min ago",
        coverage: "partial",
        coverage_note: "90-day window · 97% coverage, 3 days missing",
        freshness: "fresh",
      },
      {
        n: 3,
        fact_id: "register:legacy-admin:score",
        connector: "register",
        label: "Risk register",
        record: "register:risk/legacy-admin-access",
        claim: "scored high, last edit March",
        read_at: "read 2 min ago",
        coverage: "full",
        freshness: "stale",
        stale_reason: "not edited since March",
        conflicts_with: [1],
      },
      {
        n: 4,
        fact_id: "linear:audit-prep:start",
        connector: "linear",
        label: "Linear",
        record: "linear:project/audit-prep",
        claim: "audit prep starts in 6 weeks",
        read_at: "read 2 min ago",
        coverage: "full",
        freshness: "fresh",
      },
      {
        n: 5,
        fact_id: "vendor:billing-operator:actions",
        connector: "vendor",
        label: "Vendor docs",
        record: "vendor:docs/roles/billing-operator",
        claim: "billing-operator role, shipped September",
        read_at: "covers every action the 31 used in 90 days",
        coverage: "full",
        freshness: "fresh",
      },
    ],
    answer: {
      finding: [
        { text: "40 people hold admin to billing", cites: [1], strong: true },
        { text: "and 31 have not used it in 90 days", cites: [2], strong: true },
        {
          text: "The register scored it high in March and nobody has touched it since",
          cites: [3],
        },
      ],
      move: {
        title: "Move the 31 to the vendor's new billing-operator role.",
        mode: "fix",
        why: [
          {
            text: "It covers every action they actually used in 90 days, so nothing they do breaks.",
            cites: [5],
          },
        ],
      },
      decides: "Priya",
      delivers: "Alex",
      due: { text: "before audit prep", cites: [4] },
      conditions: [
        "the owner confirms the week",
        "the role is tested on one account first",
      ],
      unresolved: [
        "Billing apps: 3 days of the 90-day window are missing.",
        "Risk register: stale since March, and its count disagrees with Okta.",
      ],
    },
    decision_id: "fixture",
  },
  followup: {
    tool: "engine_draft_followups",
    request:
      "Yes. Draft the three notes and put them in #billing-owners for me to review.",
    channel: "#billing-owners",
    drafts: [
      {
        to: "Priya",
        text: "31 of the 40 billing admins have not used admin in 90 days. Proposal: move them to billing-operator, tested on one account first. Can you confirm the week?",
        cites: [1, 2, 5],
      },
      {
        to: "Alex",
        text: "Once Priya confirms, move the 31 to billing-operator. Test on one account first, then the rest, before audit prep starts in 6 weeks.",
        cites: [2, 4, 5],
      },
      {
        to: "Register owner",
        text: "Legacy admin access was scored high in March. Okta now shows 40 billing admins and a fix is planned. Please update the entry after the move.",
        cites: [1, 3],
      },
    ],
    sent: false,
  },
};
