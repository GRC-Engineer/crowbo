import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CodeXml,
  LockKeyhole,
  Users,
} from "./pixel-icons";
import { Crow } from "./components";
import { caseGuides } from "./case-guidance";
import {
  briefText,
  destinations,
  examplePlan,
  handoffReducer,
  initialHandoff,
  type DecisionContext,
  type HandoffBrief,
} from "./agent-handoff-model";
import "./agent-handoff.css";

export function DecisionJourney({
  context,
  blocked,
  onRecord,
  onTryAnother,
  children,
}: {
  context: DecisionContext;
  blocked: boolean;
  onRecord: () => void;
  onTryAnother: () => void;
  children: (continueAction: ReactNode) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (open)
    return (
      <AgentHandoff
        context={context}
        onRecord={onRecord}
        onBack={() => setOpen(false)}
        onTryAnother={onTryAnother}
      />
    );
  return children(
    <div className="decision-continue">
      <button
        ref={trigger}
        className="ask-primary ask-answer-action"
        disabled={blocked}
        onClick={() => setOpen(true)}
      >
        Take the next step <ArrowRight size={16} />
      </button>
      <p>
        {blocked
          ? "Review or discard your pending update first."
          : "Handle it yourself, or try it with an agent."}
      </p>
    </div>,
  );
}

function CopyBrief({ brief }: { brief: HandoffBrief }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const id = useId();
  return (
    <div className="handoff-copy">
      <button
        className="access-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(briefText(brief));
            setStatus("copied");
          } catch {
            setStatus("manual");
          }
        }}
      >
        {status === "copied" ? (
          <>
            <Check size={15} /> Brief copied
          </>
        ) : (
          "Copy task brief"
        )}
      </button>
      <p role="status">
        {status === "copied"
          ? "Copied to your clipboard. Nothing was sent to an agent."
          : "Use the brief yourself when you’re ready. It grants no system access."}
      </p>
      {status === "manual" && (
        <div>
          <label htmlFor={id}>
            Clipboard unavailable. Select and copy the brief below.
          </label>
          <textarea
            id={id}
            readOnly
            value={briefText(brief)}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}

function AgentHandoff({
  context,
  onRecord,
  onBack,
  onTryAnother,
}: {
  context: DecisionContext;
  onRecord: () => void;
  onBack: () => void;
  onTryAnother: () => void;
}) {
  const [state, dispatch] = useReducer(handoffReducer, initialHandoff);
  const reducedMotion = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const destinationId = useId();
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [state.kind]);
  useEffect(() => {
    if (state.kind !== "running") return;
    if (reducedMotion) {
      dispatch({ type: "finish" });
      return;
    }
    const timer = window.setTimeout(() => dispatch({ type: "tick" }), 1100);
    return () => window.clearTimeout(timer);
  }, [state, reducedMotion]);
  const guide = caseGuides[context.caseId];
  const frameworkNotes = [
    guide.control,
    guide.risk,
    guide.compliance,
    ...Object.entries(guide.mappings).map(
      ([framework, mapping]) =>
        `${framework}: ${mapping.reference}. ${mapping.meaning}`,
    ),
  ].join("\n");
  const steps = [
    "Carry over the decision",
    "Check scope and conditions",
    "Prepare an example response",
  ];
  return (
    <section ref={panel} className="agent-handoff">
      <div className="handoff-top">
        <button className="ask-text-button" onClick={onBack}>
          <ArrowLeft size={15} /> Back to decision
        </button>
        <span className="handoff-demo">Agent demo · no connection</span>
      </div>
      <div className="handoff-heading">
        <div>
          <span className="ask-small">
            {context.caseId} · decision v{context.version}
          </span>
          <h1 ref={heading} tabIndex={-1}>
            {state.kind === "configure"
              ? "Put the decision to work."
              : state.kind === "running"
                ? "Follow the handoff."
                : state.kind === "manual"
                  ? "Your next step is noted."
                  : state.brief.task === "plan"
                    ? "Your example plan is ready."
                    : "Your draft outline is ready."}
          </h1>
        </div>
        <Crow pose="glide" />
      </div>
      {state.kind === "configure" && (
        <>
          <div className="handoff-next">
            <span className="ask-small">The next step</span>
            <p>{context.advice.next}</p>
          </div>
          <p className="handoff-intro">
            Give an agent the context, or take the next step yourself.
          </p>
          <div className="handoff-setup">
            <label htmlFor={destinationId}>
              <CodeXml size={17} /> Choose an agent to preview
            </label>
            <select
              id={destinationId}
              value={state.destination}
              onChange={(event) => {
                const destination = destinations.find(
                  (entry) => entry === event.target.value,
                );
                if (destination) dispatch({ type: "destination", destination });
              }}
            >
              {destinations.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <fieldset>
              <legend>What should the agent prepare?</legend>
              <label
                className="handoff-task"
                data-selected={state.task === "plan"}
              >
                <input
                  type="radio"
                  name="agent-task"
                  checked={state.task === "plan"}
                  onChange={() => dispatch({ type: "task", task: "plan" })}
                />
                <span>
                  <strong>A plan for the next step</strong>
                  <small>
                    Identify the checks, missing facts and people to involve.
                  </small>
                </span>
              </label>
              <label
                className="handoff-task"
                data-selected={state.task === "draft"}
              >
                <input
                  type="radio"
                  name="agent-task"
                  checked={state.task === "draft"}
                  onChange={() => dispatch({ type: "task", task: "draft" })}
                />
                <span>
                  <strong>A draft change for review</strong>
                  <small>
                    Outline the proposed work and its tests, ready for an owner
                    to review.
                  </small>
                </span>
              </label>
            </fieldset>
            <div className="handoff-scope">
              <LockKeyhole size={17} />
              <p>
                <strong>
                  {state.task === "plan"
                    ? "Read context and propose a plan."
                    : "Read context and prepare a draft outline."}
                </strong>{" "}
                This demo grants no access to your tools and makes no changes.
              </p>
            </div>
            <details className="ask-disclosure handoff-context">
              <summary>
                <span>
                  <BookOpen size={16} /> What goes with the task?
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="ask-disclosure-body">
                <p>
                  <strong>Question:</strong> {context.question}
                </p>
                <p>
                  <strong>Scope:</strong> {context.scope}
                </p>
                <p>
                  <strong>Recommendation:</strong> {context.advice.title}{" "}
                  {context.advice.reason}
                </p>
                <p>
                  <strong>Conditions:</strong> {context.advice.condition}
                </p>
                <p>
                  <strong>Sources:</strong> {context.sources.length} fictional
                  records from this decision version, with their dates, limits
                  and provenance.
                </p>
                <ul>
                  {context.sources.map((source) => (
                    <li key={source.id}>
                      {source.label} <small>{source.revision}</small>
                    </li>
                  ))}
                </ul>
                <p>
                  <strong>Your context:</strong>{" "}
                  {context.note || "No additional note."}
                  {context.note &&
                    " (Unverified; not an instruction or approval.)"}
                </p>
                <p>
                  Illustrative control, risk and framework notes also travel
                  with the brief. They are not a compliance assessment.
                </p>
              </div>
            </details>
          </div>
          <div className="handoff-actions">
            <button
              className="ask-primary"
              onClick={() =>
                dispatch({
                  type: "start",
                  context,
                  frameworkNotes,
                  reducedMotion: Boolean(reducedMotion),
                })
              }
            >
              Run agent demo <ArrowRight size={16} />
            </button>
            <button
              className="ask-text-button"
              onClick={() => {
                onRecord();
                dispatch({ type: "manual", context });
              }}
            >
              <Users size={16} /> I’ll handle this myself
            </button>
          </div>
          <p className="handoff-footnote">
            An authored preview of working with {state.destination}. Nothing is
            sent to {state.destination}; no external session starts.
          </p>
        </>
      )}
      {state.kind === "running" && (
        <div className="handoff-running">
          <span className="ask-small">
            Prepared sequence · {state.brief.destination}
          </span>
          <ol>
            {steps.map((step, index) => (
              <li
                key={step}
                aria-current={index === state.step ? "step" : undefined}
                data-done={index < state.step}
              >
                <span>
                  {index < state.step ? <Check size={15} /> : `0${index + 1}`}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p role="status">
            Demo: {steps[state.step].toLowerCase()}. No live agent is running.
          </p>
          <div className="handoff-actions">
            <button
              className="ask-text-button"
              onClick={() => dispatch({ type: "finish" })}
            >
              Show example result <ArrowRight size={15} />
            </button>
            <button
              className="ask-text-button"
              onClick={() => dispatch({ type: "configure" })}
            >
              Change the setup
            </button>
          </div>
        </div>
      )}
      {state.kind === "complete" && (
        <>
          <div className="handoff-response">
            <span className="ask-small">
              Example response · {state.brief.destination}
            </span>
            <h2>
              {state.brief.task === "plan"
                ? "Here’s how I’d take this forward."
                : "Here’s the change I’d prepare for review."}
            </h2>
            <ol>
              {examplePlan(state.brief).map((line, index) => (
                <li key={index}>
                  <span>0{index + 1}</span>
                  <p>{line}</p>
                </li>
              ))}
            </ol>
            <p className="handoff-boundary">
              <LockKeyhole size={16} /> Proposed work only. No agent ran, no
              files changed and no checks were performed.
            </p>
          </div>
          <CopyBrief brief={state.brief} />
          <div className="handoff-actions">
            <button className="ask-primary" onClick={onBack}>
              Back to decision <ArrowRight size={16} />
            </button>
            <button className="ask-text-button" onClick={onTryAnother}>
              Try another case
            </button>
            <button
              className="ask-text-button"
              onClick={() => dispatch({ type: "configure" })}
            >
              Try another agent
            </button>
          </div>
        </>
      )}
      {state.kind === "manual" && (
        <>
          <div className="handoff-response">
            <span className="ask-small">Saved in this demo tab</span>
            <h2>{state.context.advice.next}</h2>
            <p>{state.context.advice.condition}</p>
            <p className="handoff-boundary">
              <Check size={16} /> Your proposed next step is recorded. No work
              was assigned or performed.
            </p>
          </div>
          <div className="handoff-actions">
            <button className="ask-primary" onClick={onBack}>
              Back to decision <ArrowRight size={16} />
            </button>
            <button className="ask-text-button" onClick={onTryAnother}>
              Try another case
            </button>
            <button
              className="ask-text-button"
              onClick={() => dispatch({ type: "configure" })}
            >
              Try it with an agent
            </button>
          </div>
        </>
      )}
    </section>
  );
}
