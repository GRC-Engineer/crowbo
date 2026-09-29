import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  GitCompareArrows,
  Search,
  ChevronDown,
  LockKeyhole,
} from "./pixel-icons";
import { CaseGuidance, caseGuides } from "./case-guidance";
import { DecisionJourney } from "./agent-handoff";
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
  onTryAnother,
}: {
  caseId: WorkflowId;
  onTryAnother: () => void;
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
    <DecisionJourney
      key={`${caseId}:${number}`}
      context={{
        caseId,
        specification: data.specVersion,
        version: number,
        question: data.question,
        scope: data.scope,
        advice: stage.advice,
        sources: stage.sources,
        note: state.note,
      }}
      blocked={state.pending !== null}
      onRecord={() => dispatch({ type: "record" })}
      onTryAnother={onTryAnother}
    >
      {(continueAction) => (
        <div className="ask-result workflow-review">
          <div className="ask-result-question">
            <div>
              <span className="ask-small">03 / Decide · {data.label}</span>
              <h1 ref={headingRef} tabIndex={-1}>
                {caseGuides[caseId].title}
              </h1>
            </div>
            <Crow pose="glide" />
          </div>
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
              {continueAction}
            </section>
          </div>
          <div className="ask-result-details">
            <details className="ask-disclosure">
              <summary>
                <span>
                  <BookOpen size={17} /> Why this recommendation?
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="ask-disclosure-body">
                <p className="decision-scope">
                  <strong>{data.question}</strong>
                  <br />
                  {data.scope}
                </p>
                <p className="workflow-status">
                  v{number} · {stage.status}
                </p>
                <aside className="ask-basis">
                  <span className="ask-small">Why this move</span>
                  {stage.sources
                    .filter((source) => stage.focus.includes(source.id))
                    .map((source) => (
                      <button
                        key={source.id}
                        onClick={(event) =>
                          inspect(source, event.currentTarget)
                        }
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
                {number > 1 && (
                  <div className="workflow-change" role="status">
                    <span className="ask-small">Why the advice changed</span>
                    <p>{stage.change}</p>
                  </div>
                )}
                <details className="ask-disclosure decision-source-explorer">
                  <summary>
                    <span>
                      <Search size={16} /> Explore all {stage.sources.length}{" "}
                      sources
                    </span>
                    <ChevronDown size={16} />
                  </summary>
                  <SourceNetwork sources={stage.sources} onInspect={inspect} />
                </details>
              </div>
            </details>
            <CaseGuidance caseId={caseId} />
            <details className="ask-disclosure workflow-updates">
              <summary>
                <span>
                  <GitCompareArrows size={17} /> What could change this?
                </span>
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
            <details className="ask-disclosure decision-more">
              <summary>
                <span>
                  <GitCompareArrows size={17} /> Options, context & history
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="ask-disclosure-body">
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
                          <p className="ask-fine">
                            {version.stage.advice.condition}
                          </p>
                          {state.recordedVersions.includes(version.number) && (
                            <p className="ask-recorded">
                              Simulated next step recorded for this version.
                            </p>
                          )}
                          <details>
                            <summary>
                              Sources used for v{version.number}
                            </summary>
                            <div className="workflow-history-sources">
                              {version.stage.sources.map((source) => (
                                <button
                                  key={source.id}
                                  onClick={(event) =>
                                    inspect(
                                      source,
                                      event.currentTarget,
                                      version,
                                    )
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
            </details>
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
      )}
    </DecisionJourney>
  );
}
