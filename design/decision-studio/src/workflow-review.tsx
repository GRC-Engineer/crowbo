import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  LockKeyhole,
  X,
} from "./pixel-icons";
import { Crow } from "./components";
import { FeatherGlyph } from "./identity";
import {
  ContextNote,
  SourceInspector,
  SourceNetwork,
} from "./question-components";
import type { DemoSource } from "./source-model";
import { workflowCases, type WorkflowId } from "./workflow-cases";
import {
  availableStages,
  initialWorkflow,
  workflowReducer,
  type WorkflowVersion,
} from "./workflow-model";
import "./workflow-review.css";

export function WorkflowReview({
  caseId,
  headingRef,
}: {
  caseId: WorkflowId;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [state, dispatch] = useReducer(
    workflowReducer,
    caseId,
    initialWorkflow,
  );
  const [inspection, setInspection] = useState<{
    source: DemoSource;
    sources: DemoSource[];
    context: string;
  } | null>(null);
  const sourceTrigger = useRef<HTMLElement | null>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const pendingHeading = useRef<HTMLHeadingElement>(null);
  const previousVersion = useRef(1);
  const data = workflowCases[caseId];
  const { stage, number } = state.current;
  const recorded = state.recordedVersions.includes(number);
  const changes =
    state.pending?.sources.filter(
      (source) =>
        !stage.sources.some(
          (old) => old.id === source.id && old.revision === source.revision,
        ),
    ) ?? [];
  function inspect(
    source: DemoSource,
    trigger: HTMLButtonElement,
    version: WorkflowVersion = state.current,
  ) {
    sourceTrigger.current = trigger;
    setInspection({
      source,
      sources: version.stage.sources,
      context: `${caseId} · advice v${version.number} · specification ${data.specVersion}`,
    });
  }
  useEffect(() => {
    if (state.pending) pendingHeading.current?.focus();
  }, [state.pending]);
  useEffect(() => {
    if (previousVersion.current !== number) {
      previousVersion.current = number;
      answerHeading.current?.focus();
    }
  }, [number]);
  return (
    <div className="ask-result workflow-review">
      <div className="ask-result-question">
        <div>
          <span className="ask-small">03 / Decide · {data.label}</span>
          <h1 ref={headingRef} tabIndex={-1}>
            {data.question}
          </h1>
          <p>{data.scope}</p>
        </div>
        <Crow pose="glide" />
      </div>
      <p className="workflow-status">
        <span>v{number.toString().padStart(2, "0")}</span>
        {stage.status}
      </p>
      <div className="ask-answer-grid">
        <section className="ask-answer">
          <div className="ask-answer-label">
            <span className="ask-small">Recommended next move</span>
            <span>Advice v{number}</span>
          </div>
          <h2 ref={answerHeading} tabIndex={-1}>
            {stage.advice.title}
          </h2>
          <p>{stage.advice.reason}</p>
          <div className="ask-condition">
            <LockKeyhole size={16} />
            <span>{stage.advice.condition}</span>
          </div>
          <Dialog.Root key={number}>
            <Dialog.Trigger className="ask-primary ask-answer-action">
              Review next action <ArrowRight size={16} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog-content ask-choice-dialog">
                <div className="ask-dialog-top">
                  <span className="ask-small">
                    Simulation · advice v{number}
                  </span>
                  <Dialog.Close
                    className="ask-icon"
                    aria-label="Close next action"
                  >
                    <X size={20} />
                  </Dialog.Close>
                </div>
                <Dialog.Title>Make the next step explicit.</Dialog.Title>
                <Dialog.Description>
                  Save a proposed next step for this version. This does not
                  approve a deviation, close an issue, contact anyone or change
                  a system.
                </Dialog.Description>
                <p className="ask-chosen-step">{stage.advice.next}</p>
                <button
                  className="ask-primary"
                  aria-disabled={recorded}
                  onClick={() => dispatch({ type: "record" })}
                >
                  {recorded ? (
                    <>
                      <Check size={16} /> Recorded for this version
                    </>
                  ) : (
                    <>
                      Record simulated next step <ArrowRight size={16} />
                    </>
                  )}
                </button>
                <p className="ask-fine" role="status">
                  {recorded
                    ? "Saved in this tab. No implementation or outcome record has been created."
                    : "The conditions in the advice still apply."}
                </p>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {recorded && (
            <p className="ask-recorded">
              <Check size={13} /> Simulated next step recorded
            </p>
          )}
        </section>
        <aside className="ask-basis">
          <span className="ask-small">Why this move</span>
          {stage.sources
            .filter((source) => stage.focus.includes(source.id))
            .map((source) => (
              <button
                key={source.id}
                onClick={(event) => inspect(source, event.currentTarget)}
              >
                <FeatherGlyph kind={source.feather} />
                <span>
                  <small>{source.label}</small>
                  <strong>{source.claim}</strong>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          <details className="ask-confidence">
            <summary>
              How well supported is this? <ChevronDown size={14} />
            </summary>
            <p>{stage.advice.support}</p>
            <p>
              Authored synthetic advice. No measured confidence or live
              reasoning.
            </p>
          </details>
        </aside>
      </div>
      {number > 1 && (
        <div className="workflow-change" role="status">
          <span className="ask-small">Why the advice changed</span>
          <p>{stage.change}</p>
        </div>
      )}
      <div className="ask-result-details">
        <details className="ask-disclosure workflow-updates">
          <summary>
            <span>See what could change the decision</span>
            <ChevronDown size={16} />
          </summary>
          <div className="ask-disclosure-body">
            <p className="workflow-challenge">
              <strong>{data.challenge.title}</strong> {data.challenge.body}{" "}
              {data.challenge.check}
            </p>
            <div className="workflow-update-options">
              {availableStages(state).map((next) => (
                <button
                  key={next.id}
                  disabled={state.pending !== null}
                  onClick={() => dispatch({ type: "stage", id: next.id })}
                >
                  <span>{next.label}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            <p className="ask-fine">
              Prepared updates and alternative outcomes. Inspect first, then
              reassess. Nothing is monitored automatically.
            </p>
            {state.pending && (
              <section className="workflow-pending">
                <span className="ask-small">
                  Staged update · advice v{number} retained
                </span>
                <h3 ref={pendingHeading} tabIndex={-1}>
                  {state.pending.label}
                </h3>
                <p>{state.pending.change}</p>
                {changes.map((source) => (
                  <button
                    className="ask-text-button"
                    key={source.id}
                    onClick={(event) => {
                      sourceTrigger.current = event.currentTarget;
                      setInspection({
                        source,
                        sources: state.pending?.sources ?? [],
                        context: `${caseId} · staged basis for v${number + 1} · not applied`,
                      });
                    }}
                  >
                    Inspect {source.label.toLowerCase()}{" "}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
                <div className="workflow-pending-actions">
                  <button
                    className="ask-primary"
                    onClick={() => dispatch({ type: "reassess" })}
                  >
                    Reassess with this update <ArrowRight size={16} />
                  </button>
                  <button
                    className="access-secondary"
                    onClick={() => dispatch({ type: "discard" })}
                  >
                    Keep current advice
                  </button>
                </div>
              </section>
            )}
          </div>
        </details>
        <details className="ask-disclosure">
          <summary>
            <span>Explore the sources</span>
            <span className="ask-disclosure-hint">
              {stage.sources.length} selected records · v{number}{" "}
              <ChevronDown size={16} />
            </span>
          </summary>
          <SourceNetwork sources={stage.sources} onInspect={inspect} />
        </details>
        <details className="ask-disclosure">
          <summary>
            <span>Compare the options</span>
            <ChevronDown size={16} />
          </summary>
          <div className="ask-disclosure-body ask-options">
            {data.alternatives.map((option) => (
              <div key={option.title}>
                <h3>{option.title}</h3>
                <p>{option.tradeoff}</p>
              </div>
            ))}
          </div>
        </details>
        {state.previous.length > 0 && (
          <details className="ask-disclosure">
            <summary>
              <span>Earlier advice</span>
              <span className="ask-disclosure-hint">
                {state.previous.length} retained versions{" "}
                <ChevronDown size={16} />
              </span>
            </summary>
            <div className="workflow-history">
              {state.previous.map((version) => (
                <section key={version.number}>
                  <span className="ask-small">
                    v{version.number} · {version.stage.label}
                  </span>
                  <h3>{version.stage.advice.title}</h3>
                  <p>{version.stage.advice.reason}</p>
                  <p className="ask-fine">{version.stage.advice.condition}</p>
                  {state.recordedVersions.includes(version.number) && (
                    <p className="ask-recorded">
                      Simulated next step recorded for this version.
                    </p>
                  )}
                  <details>
                    <summary>Sources used for v{version.number}</summary>
                    <div className="workflow-history-sources">
                      {version.stage.sources.map((source) => (
                        <button
                          key={source.id}
                          onClick={(event) =>
                            inspect(source, event.currentTarget, version)
                          }
                        >
                          {source.label}
                          <small>{source.revision}</small>
                          <ArrowUpRight size={12} />
                        </button>
                      ))}
                    </div>
                  </details>
                </section>
              ))}
            </div>
          </details>
        )}
        <ContextNote
          note={state.note}
          onSave={(value) => dispatch({ type: "note", value })}
        />
      </div>
      {inspection && (
        <SourceInspector
          source={inspection.source}
          sources={inspection.sources}
          scope={data.scope}
          context={inspection.context}
          onClose={() => setInspection(null)}
          returnFocus={sourceTrigger}
        />
      )}
    </div>
  );
}
