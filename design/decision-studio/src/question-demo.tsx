import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CornerDownRight,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "./pixel-icons";
import { Crow } from "./components";
import { FeatherGlyph } from "./identity";
import {
  SourceNetwork,
  SourceInspector,
  ContextNote,
} from "./question-components";
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
  const viewKey =
    state.kind === "result" && state.caseId === "upgrade"
      ? `${state.kind}-${state.version}`
      : state.kind;

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
              </div>
              <h1 ref={heading} tabIndex={-1}>
                What needs <br />a decision?
              </h1>
              <p>
                Pick a prepared security question and see the records behind the
                recommendation.
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
                <span className="ask-small">2 examples</span>
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
                        kind={entry.id === "access" ? "branch" : "merge"}
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
                  Choosing an example starts its walkthrough.
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
                  <span className="ask-small">Explore · {caseData.label}</span>
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
          {state.kind === "result" &&
            state.caseId === "upgrade" &&
            caseData?.id === "upgrade" && (
              <div className="ask-result">
                <div className="ask-result-question">
                  <div>
                    <span className="ask-small">
                      03 / Decide · {caseData.label}
                    </span>
                    <h1 ref={heading} tabIndex={-1}>
                      {caseData.question}
                    </h1>
                    <p>{caseData.scope}</p>
                  </div>
                  <Crow pose="glide" />
                </div>
                {state.version === "changed" && (
                  <div className="ask-version-change" role="status">
                    <span className="ask-small">Prepared what-if</span>
                    <strong>{caseData.whatIf}</strong>
                    <p>
                      Before: {caseData.baseline.title}
                      <br />
                      Now: {caseData.changed.title}
                    </p>
                    <button onClick={() => dispatch({ type: "restore" })}>
                      <RotateCcw size={14} />
                      Return to original
                    </button>
                  </div>
                )}
                <div className="ask-answer-grid">
                  <section className="ask-answer">
                    <div className="ask-answer-label">
                      <span className="ask-small">Recommended next move</span>
                      <span>0{state.version === "baseline" ? 1 : 2}</span>
                    </div>
                    <h2>{caseData[state.version].title}</h2>
                    <p>{caseData[state.version].reason}</p>
                    <div className="ask-condition">
                      <LockKeyhole size={16} />
                      <span>{caseData[state.version].condition}</span>
                    </div>
                    <Dialog.Root>
                      <Dialog.Trigger className="ask-primary ask-answer-action">
                        Choose a next step <ArrowRight size={16} />
                      </Dialog.Trigger>
                      <Dialog.Portal>
                        <Dialog.Overlay className="dialog-overlay" />
                        <Dialog.Content className="dialog-content ask-choice-dialog">
                          <div className="ask-dialog-top">
                            <span className="ask-small">Simulation only</span>
                            <Dialog.Close
                              className="ask-icon"
                              aria-label="Close next step"
                            >
                              <X size={20} />
                            </Dialog.Close>
                          </div>
                          <Dialog.Title>
                            Make the next step explicit.
                          </Dialog.Title>
                          <Dialog.Description>
                            This records a preference in this tab. It does not
                            approve a change, contact an owner or create work.
                          </Dialog.Description>
                          <p className="ask-chosen-step">
                            {caseData[state.version].next}
                          </p>
                          <button
                            className="ask-primary"
                            aria-disabled={state.recorded}
                            onClick={() => {
                              if (!state.recorded) dispatch({ type: "record" });
                            }}
                          >
                            {state.recorded ? (
                              <>
                                <Check size={16} />
                                Recorded in this tab
                              </>
                            ) : (
                              <>
                                Record simulated next step{" "}
                                <ArrowRight size={16} />
                              </>
                            )}
                          </button>
                          <div role="status">
                            {state.recorded && (
                              <p className="ask-fine">
                                The owner’s review is still needed. No action
                                has been taken.
                              </p>
                            )}
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                    {state.recorded && (
                      <p className="ask-recorded">
                        <Check size={13} />
                        Simulated next step recorded
                      </p>
                    )}
                  </section>
                  <aside className="ask-basis">
                    <span className="ask-small">Why this move</span>
                    {caseData.sources
                      .filter(
                        (record) =>
                          record.influence === "deciding" ||
                          record.influence === "constraint",
                      )
                      .map((record) => (
                        <button
                          key={record.id}
                          onClick={(event) =>
                            inspect(record, event.currentTarget)
                          }
                        >
                          <FeatherGlyph kind={record.feather} />
                          <span>
                            <small>
                              {record.influence === "constraint"
                                ? "Must hold"
                                : record.label}
                            </small>
                            <strong>{record.claim}</strong>
                          </span>
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    <details className="ask-confidence">
                      <summary>
                        How confident is this?
                        <ChevronDown size={14} />
                      </summary>
                      <p>{caseData[state.version].support}</p>
                      <p>
                        This is conditional support for a next step, not a
                        measured probability that the decision is correct.
                      </p>
                    </details>
                  </aside>
                </div>
                <div className="ask-result-details">
                  <details className="ask-disclosure ask-challenge">
                    <summary>
                      <span>
                        <Sparkles size={17} />
                        What might we be missing?
                      </span>
                      <span className="ask-disclosure-hint">
                        Challenge the view <ChevronDown size={16} />
                      </span>
                    </summary>
                    <div className="ask-disclosure-body">
                      <span className="ask-small">Another angle</span>
                      <h2>{caseData.challenge.title}</h2>
                      <p>{caseData.challenge.body}</p>
                      <div className="ask-challenge-check">
                        <CornerDownRight size={17} />
                        <p>
                          <strong>The check that would help</strong>
                          {caseData.challenge.check}
                        </p>
                      </div>
                      <button
                        className="ask-text-button"
                        onClick={(event) => {
                          const record = caseData.sources.find(
                            (item) => item.id === caseData.challenge.sourceId,
                          );
                          if (record) inspect(record, event.currentTarget);
                        }}
                      >
                        Inspect the source behind this{" "}
                        <ArrowUpRight size={14} />
                      </button>
                      <div className="ask-what-if">
                        <span>See how the next move changes</span>
                        <button
                          onClick={() => dispatch({ type: "what-if" })}
                          disabled={state.version === "changed"}
                        >
                          Try: {caseData.whatIf} <ArrowRight size={15} />
                        </button>
                        <small>A prepared scenario. No inference runs.</small>
                      </div>
                      <ContextNote
                        note={state.note}
                        onSave={(value) => dispatch({ type: "note", value })}
                      />
                    </div>
                  </details>
                  <details className="ask-disclosure">
                    <summary>
                      <span>
                        <Search size={17} />
                        Explore the sources
                      </span>
                      <span className="ask-disclosure-hint">
                        6 example records <ChevronDown size={16} />
                      </span>
                    </summary>
                    <div className="ask-disclosure-body ask-source-body">
                      {state.version === "changed" && (
                        <p className="ask-network-note">
                          Original source set. The prepared what-if above
                          overrides the owner’s test availability for this
                          illustration.
                        </p>
                      )}
                      <SourceNetwork
                        sources={caseData.sources}
                        onInspect={inspect}
                      />
                    </div>
                  </details>
                  <details className="ask-disclosure">
                    <summary>
                      <span>
                        <CornerDownRight size={17} />
                        What else could we do?
                      </span>
                      <ChevronDown size={16} />
                    </summary>
                    <div className="ask-disclosure-body ask-options">
                      {caseData.alternatives.map((option) => (
                        <div key={option.title}>
                          <h3>{option.title}</h3>
                          <p>{option.tradeoff}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            )}
        </motion.section>
        <footer className="ask-footer">
          <span>
            <i />
            {state.kind === "welcome"
              ? "Two questions to explore."
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
          override={
            state.kind === "result" &&
            state.caseId === "upgrade" &&
            caseData.id === "upgrade" &&
            state.version === "changed" &&
            source.id === "capacity"
              ? caseData.whatIf
              : undefined
          }
        />
      )}
    </div>
  );
}
