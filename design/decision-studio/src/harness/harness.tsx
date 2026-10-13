import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Mark, MiniRunner } from "../terminal-parts";
import {
  BookOpen,
  Check,
  Feather,
  History,
  LockKeyhole,
  RotateCcw,
  Users,
} from "../pixel-icons";
import { exchange, type Range, type Source } from "./exchange";
import "../harness.css";

const { decide, drafts } = exchange;
const { answer } = decide;

// The exchange plays as a sequence of beats. Each beat reveals one more part
// of the window; with reduced motion the page opens on the last beat.
const beats = [
  "question",
  "reading",
  "read",
  "answer",
  "request",
  "drafting",
  "drafts",
] as const;
type Beat = (typeof beats)[number];
const READ_EACH = 520;
const pause: Record<Beat, number> = {
  question: 900,
  reading: READ_EACH * decide.sources.length,
  read: 700,
  answer: 2200,
  request: 900,
  drafting: 1100,
  drafts: 0,
};

function useBeats(reduced: boolean) {
  const last = beats.length - 1;
  const [at, setAt] = useState(reduced ? last : 0);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (reduced) {
      setAt(last);
      return;
    }
    setAt(0);
    let step = 0;
    let timer = 0;
    const next = () => {
      step += 1;
      setAt(step);
      if (step < last) timer = window.setTimeout(next, pause[beats[step]]);
    };
    timer = window.setTimeout(next, pause.question);
    return () => window.clearTimeout(timer);
  }, [reduced, run, last]);
  const reached = (beat: Beat) => at >= beats.indexOf(beat);
  return { reached, replay: () => setRun((value) => value + 1) };
}

// How many sources have landed while the call is reading.
function useSourcesRead(reading: boolean, done: boolean) {
  const total = decide.sources.length;
  const [count, setCount] = useState(done ? total : 0);
  useEffect(() => {
    if (done) return setCount(total);
    if (!reading) return setCount(0);
    setCount(0);
    const timer = window.setInterval(
      () => setCount((value) => Math.min(total, value + 1)),
      READ_EACH,
    );
    return () => window.clearInterval(timer);
  }, [reading, done, total]);
  return count;
}

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const money = (value: number) =>
  Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
const span = (range: Range, unit: (value: number) => string) =>
  range.low === range.high
    ? unit(range.low)
    : `${unit(range.low)}–${unit(range.high)}`;

export default function Harness() {
  const reduced = useReducedMotion() ?? false;
  const { reached, replay } = useBeats(reduced);
  const read = useSourcesRead(
    reached("reading") && !reached("read"),
    reached("read"),
  );
  const [lit, setLit] = useState<number | null>(null);
  const cite = (ns: number[]) => <Cites ns={ns} onFocus={setLit} />;

  return (
    <main className="h-page">
      <header className="h-head">
        <span className="h-wordmark">crowbo</span>
        <h1>A question asked where the work happens</h1>
        <p className="h-lede">
          The engine reads five sources, names the next move, who decides and
          by when, and keeps the call. Demo data built on a case a future
          customer raised.
        </p>
      </header>

      <section className="h-window" aria-label="Harness session">
        <div className="h-bar">
          <span className="h-bar-name">harness</span>
          <span className="h-bar-session">{exchange.session}</span>
          <button className="h-replay" type="button" onClick={replay}>
            <RotateCcw size={12} /> Replay
          </button>
        </div>

        <div className="h-body">
          <div className="h-chat" aria-live="polite">
            <Prompt>{exchange.ask}</Prompt>

            {reached("reading") && (
              <ToolLine
                icon={<Feather size={16} />}
                tool="crowbo"
                call={`decide ${decide.topic}`}
                status={
                  reached("read")
                    ? `read ${decide.sources.length} sources · lookup ${decide.lookup_ms} ms`
                    : `reading ${read} of ${decide.sources.length}`
                }
                busy={!reached("read")}
              />
            )}

            {reached("answer") && (
              <div className="h-result">
                {decide.summary.text && (
                  <p className="h-summary">{decide.summary.text}</p>
                )}

                <ul className="h-findings">
                  {answer.finding.map((part) => (
                    <li key={part.fact_id} data-deciding={part.deciding}>
                      {part.deciding ? <strong>{part.text}</strong> : part.text}
                      {cite(part.cites)}
                    </li>
                  ))}
                </ul>

                <div className="h-move">
                  <span className="h-mode">{answer.move.mode}</span>
                  <p>
                    <strong>{answer.move.title}</strong>
                    {cite(answer.move.cites)}
                  </p>
                  <p className="h-why">{answer.move.why}</p>
                  <Figures />
                </div>

                <p className="h-who">
                  <b>{answer.decides}</b> decides · <b>{answer.delivers}</b>{" "}
                  delivers · {answer.due.text}
                  {answer.due.date &&
                    `, ${day.format(new Date(answer.due.date))}`}
                  {cite(answer.due.cites)}
                </p>

                {answer.conditions.length > 0 && (
                  <div className="h-conditions">
                    <span className="h-small">Must hold</span>
                    <ol>
                      {answer.conditions.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {reached("request") && <Prompt>{exchange.followup}</Prompt>}

            {reached("drafting") && (
              <ToolLine
                icon={<Mark provider="slack" size={16} />}
                tool="crowbo"
                call={`draft followups · ${drafts.channel}`}
                status={
                  reached("drafts")
                    ? `${drafts.drafts.length} drafts${
                        drafts.sent === false ? " · nothing sent" : ""
                      }`
                    : "drafting"
                }
                busy={!reached("drafts")}
              />
            )}

            {reached("drafts") && (
              <ol className="h-drafts">
                {drafts.drafts.map((draft) => (
                  <li key={draft.to} className="h-draft">
                    <span className="h-draft-to">
                      <Mark provider="slack" size={12} /> draft to {draft.to}
                    </span>
                    <span>
                      <DraftText text={draft.text} onFocus={setLit} />
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <div className="h-input" aria-hidden="true">
              <span>›</span> Write a message
            </div>
          </div>

          <aside className="h-rail" aria-label="Progress and sources">
            <h2 className="h-rail-title">Progress</h2>
            <ul className="h-progress">
              <Step done={reached("read")}>Read five sources</Step>
              <Step done={reached("answer")}>
                Match usage to the Billing Operator role
              </Step>
              <Step done={reached("drafts")}>Draft the owner notes in Slack</Step>
            </ul>

            <h2 className="h-rail-title">Sources</h2>
            <ol className="h-sources">
              {decide.sources.map((source) => (
                <SourceRow
                  key={source.n}
                  source={source}
                  landed={source.n <= read}
                  lit={lit === source.n}
                />
              ))}
            </ol>

            {reached("answer") && answer.unresolved.length > 0 && (
              <>
                <h2 className="h-rail-title">Left open</h2>
                <ul className="h-open">
                  {answer.unresolved.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}

            <h2 className="h-rail-title">Models</h2>
            <dl className="h-models">
              <div>
                <dt>routing</dt>
                <dd>{decide.models.routing}</dd>
              </div>
              <div>
                <dt>summary</dt>
                <dd>{decide.summary.generated_by}</dd>
              </div>
              <div>
                <dt>drafts</dt>
                <dd>{drafts.generated_by}</dd>
              </div>
              <div>
                <dt>ingestion</dt>
                <dd>{decide.models.ingestion.join(", ")}</dd>
              </div>
            </dl>
            <span className="h-decision">
              decision {decide.decision_id.slice(0, 12)}
            </span>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Prompt({ children }: { children: ReactNode }) {
  return (
    <p className="h-prompt">
      <span className="h-caret" aria-hidden="true">
        ›
      </span>
      {children}
    </p>
  );
}

function ToolLine({
  icon,
  tool,
  call,
  status,
  busy,
}: {
  icon: ReactNode;
  tool: string;
  call: string;
  status: string;
  busy: boolean;
}) {
  return (
    <p className="h-tool" data-busy={busy}>
      <span className="h-tool-icon">{icon}</span>
      <span>
        Used <b>{tool}</b> · {call} · {status}
      </span>
      {busy && <MiniRunner width={64} />}
    </p>
  );
}

function Cites({
  ns,
  onFocus,
}: {
  ns: number[];
  onFocus: (n: number | null) => void;
}) {
  return (
    <span className="h-nowrap">
      {ns.map((n) => (
        <Cite key={n} n={n} onFocus={onFocus} />
      ))}
    </span>
  );
}

function Cite({
  n,
  onFocus,
}: {
  n: number;
  onFocus: (n: number | null) => void;
}) {
  const source = decide.sources.find((item) => item.n === n);
  return (
    <button
      type="button"
      className="h-cite"
      onMouseEnter={() => onFocus(n)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(n)}
      onBlur={() => onFocus(null)}
      aria-label={`Source ${n}: ${source?.label}, ${source?.claim}`}
    >
      [{n}]
    </button>
  );
}

// A draft is the text that would be posted to Slack, citations inline. Its
// [n] markers become citation buttons in place; nothing is shown twice.
function DraftText({
  text,
  onFocus,
}: {
  text: string;
  onFocus: (n: number | null) => void;
}) {
  return text.split(/(\[\d+\])/).map((part, index) => {
    const marker = /^\[(\d+)\]$/.exec(part);
    return marker ? (
      <Cite key={index} n={Number(marker[1])} onFocus={onFocus} />
    ) : (
      part
    );
  });
}

// The engine's estimates, shown only when the tool output carries them.
function Figures() {
  const { move } = answer;
  const rows = [
    move.risk_removed_per_year && [
      "Risk removed a year",
      span(move.risk_removed_per_year, money),
    ],
    move.hours && ["Hours", span(move.hours, String)],
    move.cash && ["Cash", span(move.cash, money)],
  ].filter((row): row is string[] => Boolean(row));
  if (rows.length === 0) return null;
  return (
    <dl className="h-figures">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Step({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="h-step" data-done={done}>
      <span className="h-step-box" aria-hidden="true">
        {done && <Check size={10} />}
      </span>
      {children}
      <span className="sr-only">{done ? " (done)" : " (pending)"}</span>
    </li>
  );
}

function SourceMark({ connector }: { connector: string }) {
  switch (connector) {
    case "okta":
    case "linear":
    case "slack":
      return <Mark provider={connector} size={14} />;
    case "billing":
      return <LockKeyhole size={14} />;
    case "memory":
      return <History size={14} />;
    case "workday":
      return <Users size={14} />;
    default:
      return <BookOpen size={14} />;
  }
}

function SourceRow({
  source,
  landed,
  lit,
}: {
  source: Source;
  landed: boolean;
  lit: boolean;
}) {
  const notes = [
    source.read_at
      ? `read ${clock.format(new Date(source.read_at))} UTC`
      : "kept by decision",
    source.coverage,
    source.freshness === "stale" &&
      `stale${source.stale_reason ? `: ${source.stale_reason}` : ""}`,
    source.conflicts_with?.length &&
      `conflicts with ${source.conflicts_with.map((n) => `[${n}]`).join(" ")}`,
  ].filter(Boolean);
  return (
    <li className="h-source" data-landed={landed} data-lit={lit}>
      <span className="h-source-n">[{source.n}]</span>
      <span className="h-source-mark">
        <SourceMark connector={source.connector} />
      </span>
      <span className="h-source-text">
        <b>{source.label}</b> {source.claim}
        <span
          className="h-source-note"
          data-warn={
            source.freshness === "stale" || source.coverage === "partial"
          }
        >
          {notes.join(" · ")}
        </span>
      </span>
    </li>
  );
}
