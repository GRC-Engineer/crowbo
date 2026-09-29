import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  CornerDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Pause,
  Play,
} from "./pixel-icons";
import { WorkflowReview } from "./workflow-review";
import { Crow } from "./components";
import { FeatherGlyph } from "./identity";
import { SourceNetwork, SourceInspector } from "./question-components";
import { AccessReview } from "./access-review";
import {
  demoCases,
  demoInitialState,
  demoReducer,
  researchSteps,
  type DemoSource,
} from "./question-demo-model";
import "./question-demo.css";

export default function QuestionDemo() {
  const [state, dispatch] = useReducer(demoReducer, demoInitialState);
  const [source, setSource] = useState<DemoSource | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const sourceTrigger = useRef<HTMLElement | null>(null);
  const previousStage = useRef("welcome");
  const reducedMotion = useReducedMotion();
  const caseData = "caseId" in state ? demoCases[state.caseId] : null;
  const viewKey = state.kind;

  useEffect(() => {
    document.title = "Crowbo · Ask a question";
  }, []);

  useEffect(() => {
    if (previousStage.current !== viewKey) {
      previousStage.current = viewKey;
      if (state.kind === "question")
        input.current?.focus({ preventScroll: true });
      else heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [state.kind, viewKey]);

  useEffect(() => {
    if (state.kind !== "research" || state.paused) return;
    const timer = window.setTimeout(() => dispatch({ type: "tick" }), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);

  function inspect(record: DemoSource, trigger: HTMLButtonElement) {
    sourceTrigger.current = trigger;
    if (state.kind === "research" && !state.paused) dispatch({ type: "pause" });
    setSource(record);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "submit" });
  }

  const phase =
    state.kind === "welcome"
      ? 0
      : state.kind === "question"
        ? 1
        : state.kind === "research"
          ? 2
          : 3;
  return (
    <div className="ask-app">
      <a className="skip-link" href="#ask-main">
        Skip to question
      </a>
      <header className="ask-header">
        <a href="../" className="ask-wordmark" aria-label="Crowbo home">
          crowbo
        </a>
        <span className="ask-demo-label">
          <i />
          Synthetic walkthrough
        </span>
        <a className="ask-workspace-link" href="?view=workspace">
          Open workspace <ArrowUpRight size={14} />
        </a>
      </header>
      <main id="ask-main" className={`ask-main ask-stage-${state.kind}`}>
        {state.kind !== "welcome" && (
          <div className="ask-breadcrumb">
            <button
              onClick={() =>
                dispatch({
                  type: state.kind === "question" ? "home" : "question",
                })
              }
            >
              <ArrowLeft size={14} />
              {state.kind === "question" ? "Back" : "Edit question"}
            </button>
            <span>
              0{phase} / 03{" "}
              <span className="ask-breadcrumb-name">
                {state.kind === "question"
                  ? "ASK"
                  : state.kind === "research"
                    ? "EXPLORE"
                    : "DECIDE"}
              </span>
            </span>
          </div>
        )}
        <motion.section
          className="ask-shell"
          layout={!reducedMotion}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {state.kind === "welcome" && (
            <div className="ask-welcome">
              <div className="ask-welcome-art" aria-hidden="true">
                <div className="ask-quiet-grid" />
                <Crow />
                <span className="ask-art-coordinate">
                  01 / A LITTLE PERSPECTIVE
                </span>
              </div>
              <span className="ask-small">Decisions, with context.</span>
              <h1 ref={heading} tabIndex={-1}>
                What needs <br />a decision?
              </h1>
              <p>
                Start with a question.
                <br />
                Put the context around it.
              </p>
              <button
                className="ask-primary"
                onClick={() => dispatch({ type: "open" })}
              >
                Ask Crowbo <ArrowRight size={18} />
              </button>
            </div>
          )}

          {state.kind === "question" && (
            <form className="ask-composer" onSubmit={submit}>
              <div className="ask-composer-heading">
                <div>
                  <span className="ask-small">01 / Ask</span>
                  <h1 ref={heading} tabIndex={-1}>
                    What’s your question?
                  </h1>
                </div>
                <Crow pose="up" />
              </div>
              <label className="sr-only" htmlFor="decision-question">
                Your question
              </label>
              <div className="ask-input-frame">
                <span aria-hidden="true">&gt;</span>
                <textarea
                  ref={input}
                  id="decision-question"
                  value={state.draft}
                  maxLength={500}
                  rows={3}
                  placeholder="What are you trying to decide?"
                  aria-describedby={
                    state.error ? "ask-question-error" : "ask-prepared-note"
                  }
                  aria-invalid={Boolean(state.error)}
                  onChange={(event) =>
                    dispatch({ type: "edit", value: event.target.value })
                  }
                />
              </div>
              {state.error && (
                <p
                  className="ask-question-error"
                  id="ask-question-error"
                  role="alert"
                >
                  {state.error}
                </p>
              )}
              <div className="ask-example-heading">
                <span>Try a prepared question</span>
                <span className="ask-small">03 EXAMPLES</span>
              </div>
              <div className="ask-examples">
                {Object.values(demoCases).map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    aria-pressed={state.draft === entry.question}
                    onClick={() => {
                      // Choosing a prepared question starts its journey
                      // directly; the composer stays for typed questions.
                      dispatch({ type: "edit", value: entry.question });
                      dispatch({ type: "submit" });
                    }}
                  >
                    <span>
                      <FeatherGlyph
                        kind={
                          entry.id === "access"
                            ? "branch"
                            : entry.id === "exceptions"
                              ? "spine"
                              : "merge"
                        }
                      />
                    </span>
                    <span>
                      <strong>{entry.label}</strong>
                      <small>{entry.question}</small>
                    </span>
                    <CornerDownRight size={16} />
                  </button>
                ))}
              </div>
              <div className="ask-compose-footer">
                <p id="ask-prepared-note">
                  A scripted demo with fictional sources.
                  <br />
                  Choose an example to start its journey.
                </p>
                <button
                  className="ask-primary"
                  type="submit"
                  disabled={!state.draft.trim()}
                >
                  Explore this question <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {state.kind === "research" && caseData && (
            <div className="ask-research">
              <div className="ask-research-header">
                <div>
                  <span className="ask-small">
                    02 / Explore · {caseData.label}
                  </span>
                  <h1 ref={heading} tabIndex={-1}>
                    Putting the context together.
                  </h1>
                  <p>{caseData.question}</p>
                </div>
                <span className="ask-illustration">Illustrative sequence</span>
              </div>
              <ol className="ask-step-list">
                {researchSteps.map((step, index) => (
                  <li
                    key={step.label}
                    className={
                      index === state.step
                        ? "current"
                        : index < state.step
                          ? "complete"
                          : ""
                    }
                    aria-current={index === state.step ? "step" : undefined}
                  >
                    <span>
                      {index < state.step ? (
                        <Check size={12} />
                      ) : (
                        `0${index + 1}`
                      )}
                    </span>
                    {step.label}
                  </li>
                ))}
              </ol>
              <SourceNetwork
                sources={caseData.sources}
                step={state.step}
                moving={!state.paused && !reducedMotion}
                onInspect={inspect}
              />
              <div className="ask-terminal">
                <div role="status" aria-live="polite">
                  <span className="ask-prompt" aria-hidden="true">
                    &gt;_
                  </span>
                  <span>
                    <strong>
                      {state.paused
                        ? "Sequence paused"
                        : researchSteps[state.step].label}
                    </strong>
                    <small>
                      {state.paused
                        ? "Explore a source, then resume when you’re ready."
                        : researchSteps[state.step].detail}
                    </small>
                  </span>
                </div>
                <div className="ask-terminal-controls">
                  <button onClick={() => dispatch({ type: "pause" })}>
                    {state.paused ? <Play size={14} /> : <Pause size={14} />}
                    {state.paused ? "Resume" : "Pause"}
                  </button>
                  <button onClick={() => dispatch({ type: "finish" })}>
                    Skip to answer <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {state.kind === "result" && state.caseId === "access" && (
            <AccessReview headingRef={heading} />
          )}
          {state.kind === "result" && state.caseId !== "access" && (
            <WorkflowReview caseId={state.caseId} headingRef={heading} />
          )}
        </motion.section>
        <footer className="ask-footer">
          <span>
            <i />
            {state.kind === "welcome"
              ? "Three questions to explore."
              : "Prepared examples · resets on reload."}
          </span>
          <span>NO LIVE CONNECTIONS</span>
        </footer>
      </main>
      {source && caseData && (
        <SourceInspector
          source={source}
          scope={caseData.scope}
          onClose={() => setSource(null)}
          returnFocus={sourceTrigger}
          sources={caseData.sources}
          context={`${caseData.id} · initial selected basis`}
        />
      )}
    </div>
  );
}
