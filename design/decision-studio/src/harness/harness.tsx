import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Mark, MiniRunner } from "../terminal-parts";
import {
  BookOpen,
  Check,
  Feather,
  LockKeyhole,
  RotateCcw,
} from "../pixel-icons";
import { exchange, type Cited, type Connector, type Source } from "./exchange";
import "../harness.css";

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
const pause: Record<Beat, number> = {
  question: 900,
  reading: 520,
  read: 700,
  answer: 1800,
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
      // "reading" holds once per source so the reads land one by one.
      const hold =
        beats[step] === "reading"
          ? pause.reading * exchange.decide.sources.length
          : pause[beats[step]];
      if (step < last) timer = window.setTimeout(next, hold);
    };
    timer = window.setTimeout(next, pause.question);
    return () => window.clearTimeout(timer);
  }, [reduced, run, last]);
  const reached = (beat: Beat) => at >= beats.indexOf(beat);
  return { at, reached, replay: () => setRun((value) => value + 1) };
}

// How many sources have landed while the call is reading.
function useSourcesRead(reading: boolean, done: boolean) {
  const total = exchange.decide.sources.length;
  const [count, setCount] = useState(done ? total : 0);
  useEffect(() => {
    if (done) return setCount(total);
    if (!reading) return setCount(0);
    setCount(0);
    const timer = window.setInterval(
      () => setCount((value) => Math.min(total, value + 1)),
      pause.reading,
    );
    return () => window.clearInterval(timer);
  }, [reading, done, total]);
  return count;
}

export default function Harness() {
  const reduced = useReducedMotion() ?? false;
  const { reached, replay } = useBeats(reduced);
  const read = useSourcesRead(
    reached("reading") && !reached("read"),
    reached("read"),
  );
  const [focus, setFocus] = useState<number | null>(null);
  const { decide, followup } = exchange;

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
            <Prompt>{decide.question}</Prompt>

            {reached("reading") && (
              <ToolLine
                icon={<Feather size={16} />}
                tool="crowbo"
                call={`decide ${decide.topic}`}
                status={
                  reached("read")
                    ? `read ${decide.sources.length} sources${
                        decide.elapsed_ms
                          ? ` · ${(decide.elapsed_ms / 1000).toFixed(1)}s`
                          : ""
                      }`
                    : `reading ${read} of ${decide.sources.length}`
                }
                busy={!reached("read")}
              />
            )}

            {reached("answer") && (
              <div className="h-answer">
                <p>
                  {decide.answer.finding.map((part, index) => (
                    <Sentence
                      key={index}
                      part={part}
                      strong={part.strong}
                      onFocus={setFocus}
                      end={joiner(decide.answer.finding[index + 1]?.text)}
                    />
                  ))}
                </p>
                <p>
                  <strong>{decide.answer.move.title}</strong>{" "}
                  {decide.answer.move.why.map((part, index) => (
                    <Sentence key={index} part={part} onFocus={setFocus} />
                  ))}{" "}
                  <span className="h-who">
                    {decide.answer.decides} decides,{" "}
                    {decide.answer.delivers} delivers,{" "}
                    {decide.answer.due.text}
                  </span>
                  <span className="h-nowrap">
                    {decide.answer.due.cites.map((n) => (
                      <Cite key={n} n={n} onFocus={setFocus} />
                    ))}
                    .
                  </span>{" "}
                  Two things must hold:{" "}
                  {decide.answer.conditions.join(", and ")}.
                </p>
                <Figures />
              </div>
            )}

            {reached("request") && <Prompt>{followup.request}</Prompt>}

            {reached("drafting") && (
              <ToolLine
                icon={<Mark provider="slack" size={16} />}
                tool="slack"
                call={`draft ${followup.channel}`}
                status={
                  reached("drafts")
                    ? `${followup.drafts.length} drafts · nothing sent`
                    : "drafting"
                }
                busy={!reached("drafts")}
              />
            )}

            {reached("drafts") && (
              <div className="h-answer">
                <p>
                  Three drafts are in {followup.channel}, one per owner, with
                  the role change and the test date. Nothing goes out until you
                  say so.
                </p>
                <ol className="h-drafts">
                  {followup.drafts.map((draft) => (
                    <li key={draft.to} className="h-draft">
                      <span className="h-draft-to">
                        <Mark provider="slack" size={12} /> draft to{" "}
                        {draft.to}
                      </span>
                      <span>
                        {draft.text}
                        {draft.cites.map((n) => (
                          <Cite key={n} n={n} onFocus={setFocus} />
                        ))}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
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
                Match usage to the vendor's new role
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
                  lit={focus === source.n}
                />
              ))}
            </ol>

            {reached("answer") && decide.answer.unresolved.length > 0 && (
              <>
                <h2 className="h-rail-title">Left open</h2>
                <ul className="h-open">
                  {decide.answer.unresolved.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}

            <h2 className="h-rail-title">Context</h2>
            <span className="h-context">
              <Feather size={14} /> Crowbo over MCP
            </span>
          </aside>
        </div>
      </section>
    </main>
  );
}

// Parts of the finding run on with a space when the next part continues the
// sentence (starts lower case) and end with a full stop otherwise.
function joiner(next?: string) {
  if (next === undefined) return ".";
  return next[0] === next[0].toLowerCase() ? " " : ". ";
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

function Sentence({
  part,
  strong,
  end = " ",
  onFocus,
}: {
  part: Cited;
  strong?: boolean;
  end?: string;
  onFocus: (n: number | null) => void;
}) {
  const text = strong ? <strong>{part.text}</strong> : part.text;
  // The citations and the stop that follows them never wrap apart.
  const stop = end.trimEnd();
  return (
    <>
      {text}
      <span className="h-nowrap">
        {part.cites.map((n) => (
          <Cite key={n} n={n} onFocus={onFocus} />
        ))}
        {stop}
      </span>
      {end.slice(stop.length)}
    </>
  );
}

function Cite({
  n,
  onFocus,
}: {
  n: number;
  onFocus: (n: number | null) => void;
}) {
  const source = exchange.decide.sources.find((item) => item.n === n);
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

// The engine's estimates, shown only when the tool output carries them.
function Figures() {
  const { move } = exchange.decide.answer;
  const money = (value: number) =>
    value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
  const rows = [
    move.risk_removed_per_year && [
      "Risk removed a year",
      `${money(move.risk_removed_per_year.low)}–${money(move.risk_removed_per_year.high)}`,
    ],
    move.hours && ["Hours", `${move.hours.low}–${move.hours.high}`],
    move.cash && [
      "Cash",
      `${money(move.cash.low)}–${money(move.cash.high)}`,
    ],
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

const marks: Record<Connector, ReactNode> = {
  okta: <Mark provider="okta" size={14} />,
  linear: <Mark provider="linear" size={14} />,
  billing: <LockKeyhole size={14} />,
  register: <BookOpen size={14} />,
  vendor: <BookOpen size={14} />,
};

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
    source.coverage_note ?? source.read_at,
    source.coverage === "full" && !source.coverage_note && "full",
    source.freshness === "stale" && "stale",
    source.conflicts_with?.length &&
      `conflicts with ${source.conflicts_with.map((n) => `[${n}]`).join(" ")}`,
  ].filter(Boolean);
  return (
    <li className="h-source" data-landed={landed} data-lit={lit}>
      <span className="h-source-n">[{source.n}]</span>
      <span className="h-source-mark">{marks[source.connector]}</span>
      <span className="h-source-text">
        <b>{source.label}</b> {source.claim}
        <span
          className="h-source-note"
          data-warn={source.freshness === "stale" || source.coverage === "partial"}
        >
          {notes.join(" · ")}
        </span>
      </span>
    </li>
  );
}
