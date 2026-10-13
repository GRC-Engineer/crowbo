import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Mark, artwork } from "../terminal-parts";
import { ArrowUpRight, CornerDownRight } from "../pixel-icons";
import {
  afterCall,
  brief,
  call,
  day,
  drafts,
  first,
  hhmm,
  layout,
  log,
  money,
  names,
  reads,
  totals,
  type Decide,
  type Layout,
} from "./data";
import { EngineView, type Progress } from "./engine-view";
import "../demo.css";

// The demo is one chat. A visitor sends a prepared message; the engine view
// unfolds beside the chat and plays what the engine does (pull, weigh, link,
// decide); then it folds back into the MCP call card and the answer lands in
// the chat. The card reopens the engine view. Every fact comes from the
// recorded engine output in data.ts.

const ASK =
  "Our top risk is still legacy admin access. What do we actually do about it this quarter?";
const unused = first.sources
  .find((source) => source.connector === "billing")
  ?.claim.match(/\d+/)?.[0];
const FOLLOW = {
  drafts: `Draft the notes to ${first.answer.decides} and ${first.answer.delivers}`,
  call: `${first.answer.delivers} says ${call.body.assertions[0]?.value} of the ${unused} are break-glass accounts and must keep admin`,
  brief: "Brief the board on this week",
} as const;
type FollowUp = keyof typeof FOLLOW;

type Turn =
  | { kind: "you"; text: string }
  | { kind: "decide"; decide: Decide; done: boolean }
  | { kind: "drafts" }
  | { kind: "call" }
  | { kind: "brief" };

const complete = (view: Layout): Progress => ({
  lit: view.rows.length,
  stage: 4,
  kept: true,
});

// Milliseconds for each beat of the run.
const BEAT = { read: 420, stage: 950, hold: 1300 };

export default function App() {
  const reduced = useReducedMotion() ?? false;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [view, setView] = useState<Layout | null>(null);
  const [progress, setProgress] = useState<Progress>({ lit: 0, stage: 0, kept: false });
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [turns, reduced]);

  const later = (ms: number, step: () => void) =>
    timers.current.push(window.setTimeout(step, ms));

  const finish = (decide: Decide) =>
    setTurns((list) =>
      list.map((turn) =>
        turn.kind === "decide" && turn.decide === decide ? { ...turn, done: true } : turn,
      ),
    );

  // Unfold the engine view, play the run, fold back into the call card.
  function run(decide: Decide) {
    const next = layout(decide);
    setView(next);
    setRunning(true);
    if (reduced) {
      setProgress(complete(next));
      finish(decide);
      setRunning(false);
      return;
    }
    setProgress({ lit: 0, stage: 0, kept: false });
    setOpen(true);
    let t = 500;
    for (let lit = 1; lit <= next.rows.length; lit += 1) {
      later(t, () => setProgress({ lit, stage: 0, kept: false }));
      t += BEAT.read;
    }
    for (let stage = 1; stage <= 3; stage += 1) {
      t += BEAT.stage;
      later(t, () => setProgress({ lit: next.rows.length, stage, kept: false }));
    }
    t += BEAT.stage;
    later(t, () => setProgress(complete(next)));
    t += BEAT.hold;
    later(t, () => setOpen(false));
    later(t + 450, () => {
      finish(decide);
      setRunning(false);
    });
  }

  function send(text: string) {
    setTurns([{ kind: "you", text }, { kind: "decide", decide: first, done: false }]);
    run(first);
  }

  function follow(key: FollowUp) {
    const you: Turn = { kind: "you", text: FOLLOW[key] };
    if (key === "drafts") setTurns((list) => [...list, you, { kind: "drafts" }]);
    if (key === "brief") setTurns((list) => [...list, you, { kind: "brief" }]);
    if (key === "call") {
      setTurns((list) => [...list, you, { kind: "call" }, { kind: "decide", decide: afterCall, done: false }]);
      run(afterCall);
    }
  }

  function reopen(decide: Decide) {
    const next = layout(decide);
    setView(next);
    setProgress(complete(next));
    setOpen(true);
  }

  const has = (kind: Turn["kind"]) => turns.some((turn) => turn.kind === kind);
  const done = turns.length > 0 && !running;
  const offered: FollowUp[] = !done
    ? []
    : has("call")
      ? has("brief") ? [] : ["brief"]
      : has("drafts") ? ["call"] : ["drafts", "call"];

  return (
    <div className="d-app" data-open={open}>
      <header className="d-head">
        <a className="d-wordmark" href="/">crowbo</a>
        <span className="d-surfaces">Runs in Claude Code, Cursor, Codex and Slack over MCP</span>
      </header>

      <div className="d-body">
        <main className="d-chat">
          {turns.length === 0 ? (
            <Start onSend={() => send(ASK)} />
          ) : (
            <div className="d-thread">
              {turns.map((turn, index) => (
                <TurnView key={index} turn={turn} onOpen={reopen} running={running} />
              ))}
              {offered.length > 0 && (
                <div className="d-next">
                  {offered.map((key, index) => (
                    <button
                      key={key}
                      type="button"
                      className="d-chip"
                      data-primary={index === 0}
                      onClick={() => follow(key)}
                    >
                      <span>{FOLLOW[key]}</span>
                      <CornerDownRight size={12} />
                    </button>
                  ))}
                </div>
              )}
              <div ref={end} />
            </div>
          )}
        </main>

        <aside className="d-engine" aria-hidden={!open} inert={!open}>
          {view && (
            <EngineView
              layout={view}
              progress={progress}
              onClose={running ? undefined : () => setOpen(false)}
            />
          )}
        </aside>
      </div>

      {turns.length === 0 && <ReadsStrip />}
    </div>
  );
}

// ───────── start

function Start({ onSend }: { onSend: () => void }) {
  return (
    <div className="d-start">
      <img className="d-crow" src={artwork.modular} width={96} height={96} alt="" />
      <div className="d-composer">
        <p>{ASK}</p>
        <button type="button" className="d-send" onClick={onSend} autoFocus>
          Send <span aria-hidden="true">↵</span>
        </button>
      </div>
    </div>
  );
}

// The engine reads on its own schedule; these ran before anyone asked.
function ReadsStrip() {
  const last = log.at(-1)!;
  return (
    <footer className="d-strip">
      <span className="d-label">Reads</span>
      <ol>
        {reads.map((read) => (
          <li key={read.at + read.connector}>
            <span>{hhmm(read.at)}</span>
            <SmallMark connector={read.connector} />
          </li>
        ))}
        <li data-now="true">
          <i aria-hidden="true" />
          <span>{hhmm(last.at)}</span>
        </li>
      </ol>
      <span className="d-totals">
        {totals.reads} reads · {totals.facts} facts · {totals.links} links
      </span>
    </footer>
  );
}

function SmallMark({ connector }: { connector: string }) {
  if (connector === "okta" || connector === "linear" || connector === "slack")
    return (
      <span className="d-mark d-mark-logo" title={names[connector]}>
        <Mark provider={connector} size={14} />
      </span>
    );
  return (
    <span className="d-mark" title={names[connector]}>
      {names[connector][0]}
    </span>
  );
}

// ───────── turns

function TurnView({
  turn,
  onOpen,
  running,
}: {
  turn: Turn;
  onOpen: (decide: Decide) => void;
  running: boolean;
}) {
  if (turn.kind === "you") return <p className="d-you">{turn.text}</p>;
  if (turn.kind === "decide") return <DecideTurn decide={turn.decide} done={turn.done} onOpen={onOpen} running={running} />;
  if (turn.kind === "drafts") return <DraftsTurn />;
  if (turn.kind === "call") return <CallTurn />;
  return <BriefTurn />;
}

function Card({ children, onOpen }: { children: ReactNode; onOpen?: () => void }) {
  if (!onOpen) return <div className="d-card">{children}</div>;
  return (
    <button type="button" className="d-card" data-open-able="true" onClick={onOpen}>
      {children}
      <span className="d-card-open">
        Open <ArrowUpRight size={12} />
      </span>
    </button>
  );
}

function Cites({ ns }: { ns: number[] }) {
  return <span className="d-cite">{ns.map((n) => `[${n}]`).join("")}</span>;
}

function DecideTurn({
  decide,
  done,
  onOpen,
  running,
}: {
  decide: Decide;
  done: boolean;
  onOpen: (decide: Decide) => void;
  running: boolean;
}) {
  const { answer } = decide;
  const { move } = answer;
  if (!done)
    return (
      <Card>
        <i className="d-pulse" aria-hidden="true" />
        <span>crowbo · decide {decide.topic}</span>
        <span className="d-card-meta">reading</span>
      </Card>
    );
  return (
    <>
      <Card onOpen={running ? undefined : () => onOpen(decide)}>
        <i className="d-dot" aria-hidden="true" />
        <span>crowbo · decide {decide.topic}</span>
        <span className="d-card-meta">
          {decide.sources.length} sources · {decide.lookup_ms} ms · decision {decide.decision_id.slice(0, 8)} kept
        </span>
      </Card>
      <div className="d-answer">
        <ul className="d-facts">
          {answer.finding
            .filter((part) => part.deciding)
            .map((part) => (
              <li key={part.fact_id}>
                {part.text}
                <Cites ns={part.cites} />
              </li>
            ))}
        </ul>
        <div className="d-move">
          <span className="d-move-meta">
            <b>{move.mode}</b>
            {money(move.risk_removed_per_year.low)}–{money(move.risk_removed_per_year.high)} a year ·{" "}
            {move.hours.low}–{move.hours.high} hours
          </span>
          <h2>
            {move.title}
            <Cites ns={move.cites} />
          </h2>
          <p className="d-who">
            <b>{answer.decides}</b> decides · <b>{answer.delivers}</b> delivers · {answer.due.text},{" "}
            {day(answer.due.date)}
            <Cites ns={answer.due.cites} />
          </p>
          <ol className="d-conditions">
            {answer.conditions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

// A draft is the text that would be posted; its [n] markers are its citations.
function Inline({ text }: { text: string }) {
  return text.split(/(\[\d+\])/).map((part, index) =>
    /^\[\d+\]$/.test(part) ? (
      <span key={index} className="d-cite">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function DraftsTurn() {
  return (
    <>
      <Card>
        <Mark provider="slack" size={14} />
        <span>crowbo · draft followups</span>
        <span className="d-card-meta">
          {drafts.drafts.length} drafts{drafts.sent === false ? " · nothing sent" : ""}
        </span>
      </Card>
      <ol className="d-drafts">
        {drafts.drafts.map((draft) => (
          <li key={draft.to}>
            <span className="d-draft-to">
              <Mark provider="slack" size={12} /> {draft.to}
            </span>
            <p>
              <Inline text={draft.text} />
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

function CallTurn() {
  return (
    <Card>
      <i className="d-dot" aria-hidden="true" />
      <span>crowbo · record_call · {call.body.call}</span>
      <span className="d-card-meta">memory #{call.seq} · {hhmm(call.at)}</span>
    </Card>
  );
}

function BriefTurn() {
  return (
    <>
      <Card>
        <i className="d-dot" aria-hidden="true" />
        <span>crowbo · weekly brief</span>
        <span className="d-card-meta">decision {brief.decision_id.slice(0, 8)}</span>
      </Card>
      <article className="d-brief">
        {brief.markdown.split("\n").map((line, index) => <BriefLine key={index} line={line} />)}
      </article>
    </>
  );
}

function Bold({ text }: { text: string }) {
  return text.split(/\*\*(.+?)\*\*/).map((part, index) =>
    index % 2 ? <b key={index}>{part}</b> : part,
  );
}

function BriefLine({ line }: { line: string }) {
  if (!line.trim()) return null;
  if (line.startsWith("# ")) return <h2>{line.slice(2)}</h2>;
  if (line.startsWith("## ")) return <h3>{line.slice(3)}</h3>;
  if (/^(\d+\.|-) /.test(line))
    return (
      <p className="d-brief-item">
        <Bold text={line} />
      </p>
    );
  return (
    <p>
      <Bold text={line} />
    </p>
  );
}
