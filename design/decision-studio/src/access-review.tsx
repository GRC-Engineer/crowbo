import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  History,
  LockKeyhole,
  MessageCircle,
  Pause,
  Play,
  Search,
} from "./pixel-icons";
import { Crow } from "./components";
import { FeatherGlyph } from "./identity";
import { ProviderMark } from "./providers";
import {
  ContextNote,
  SourceInspector,
  SourceNetwork,
} from "./question-components";
import { demoCases, type DemoSource } from "./question-demo-model";
import {
  accessAdvice,
  availableFollowups,
  isAccessCheck,
  accessInitialState,
  accessReducer,
  basisLabels,
  pendingSource,
  recoveryPaths,
  revisionReasons,
  versionSources,
  type AccessVersion,
  type RecoveryPath,
} from "./access-review-model";
import {
  CompareOptions,
  NextStep,
  PendingContextCard,
} from "./access-review-actions";
import { AccessAssistant } from "./access-assistant";
import "./access-review.css";
import "./workflow-review.css";

type Inspect = (record: DemoSource, trigger: HTMLButtonElement) => void;

function ChangedSources({
  version,
  onInspect,
}: {
  version: AccessVersion;
  onInspect: Inspect;
}) {
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  if (version.basis === "daily") return null;
  if (isAccessCheck(version.basis))
    return (
      <section className="workflow-change">
        <span className="ask-small">Why the advice changed</span>
        <p>{revisionReasons[version.basis]}</p>
      </section>
    );
  const records = versionSources(version).filter(
    (record) =>
      record.id === "activity" ||
      record.id === "annual-task" ||
      !demoCases.access.sources.some(
        (original) =>
          original.id === record.id && original.revision === record.revision,
      ),
  );
  return (
    <section
      className="access-relationship"
      aria-label="Changed source relationship"
    >
      <div className="access-section-label">
        <span className="ask-small">What changed the advice</span>
        {!reducedMotion && (
          <button
            className="access-motion"
            onClick={() => setPaused(!paused)}
            aria-label={
              paused ? "Resume source highlight" : "Pause source highlight"
            }
          >
            {paused ? <Play size={12} /> : <Pause size={12} />} Highlight
          </button>
        )}
      </div>
      <div
        className="access-source-path"
        key={version.number}
        data-moving={!paused && !reducedMotion}
      >
        {records.map((record, index) => (
          <div className="access-path-step" key={record.id}>
            {index > 0 && (
              <span className="access-path-wire" aria-hidden="true">
                <i />
              </span>
            )}
            <button
              onClick={(event) => {
                setPaused(true);
                onInspect(record, event.currentTarget);
              }}
            >
              <FeatherGlyph kind={record.feather} />
              <span>
                <small>{record.label}</small>
                <strong>{record.claim}</strong>
              </span>
              <ArrowUpRight size={13} />
            </button>
          </div>
        ))}
      </div>
      <p>{revisionReasons[version.basis]}</p>
    </section>
  );
}

export function AccessReview({
  headingRef,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [state, dispatch] = useReducer(accessReducer, accessInitialState);
  const [view, setView] = useState<"decision" | "assistant">("decision");
  const previousView = useRef(view);
  const [source, setSource] = useState<DemoSource | null>(null);
  const [inspectionBasis, setInspectionBasis] = useState<{
    sources: DemoSource[];
    context: string;
  }>({ sources: [], context: "" });
  const sourceTrigger = useRef<HTMLElement | null>(null);
  const pendingHeading = useRef<HTMLHeadingElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const challengePanel = useRef<HTMLElement>(null);
  const previousNumber = useRef(state.current.number);
  const advice = accessAdvice[state.current.basis];
  const sources = versionSources(state.current);
  const pending = state.pending ? pendingSource(state.pending) : null;
  const recorded = state.recordedVersions.includes(state.current.number);
  const hasRecovery = sources.some((record) => record.id === "annual-task");
  const decidingSources = sources.filter((record) =>
    isAccessCheck(state.current.basis)
      ? [
          "policy",
          state.current.basis === "identity-unknown"
            ? "directory"
            : state.current.basis === "observed"
              ? "access-outcome"
              : state.current.basis === "irrelevant"
                ? "roles"
                : "daily-test",
        ].includes(record.id)
      : hasRecovery
        ? record.id === "policy" ||
          record.id === "annual-task" ||
          record.id.startsWith("recovery-") ||
          record.id === "daily-test" ||
          record.id === "access-outcome"
        : ["roles", "owner", "policy"].includes(record.id),
  );

  useEffect(() => {
    if (state.pending) {
      pendingHeading.current?.focus({ preventScroll: true });
      pendingHeading.current?.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
    }
  }, [state.pending]);

  useEffect(() => {
    if (previousNumber.current !== state.current.number) {
      previousNumber.current = state.current.number;
      answerHeading.current?.focus({ preventScroll: true });
      answerHeading.current?.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
    }
  }, [state.current.number]);

  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current
      ?.closest(".access-review")
      ?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [view, headingRef]);

  function discardContext() {
    dispatch({ type: "discard" });
    answerHeading.current?.focus({ preventScroll: true });
    answerHeading.current?.scrollIntoView({
      block: "center",
      behavior: "instant",
    });
  }

  function inspect(
    record: DemoSource,
    trigger: HTMLButtonElement,
    version: AccessVersion = state.current,
  ) {
    sourceTrigger.current = trigger;
    const isStaged =
      state.pending &&
      pending &&
      record.id === pending.id &&
      record.revision === pending.revision;
    const selectedVersion =
      isStaged && state.pending
        ? ({
            number: state.current.number + 1,
            basis:
              state.pending.kind === "annual-task"
                ? "recovery-known"
                : state.pending.status,
          } satisfies AccessVersion)
        : version;
    setInspectionBasis({
      sources: versionSources(selectedVersion),
      context: `access · advice v${selectedVersion.number}${isStaged ? " · staged basis, not applied" : ""}`,
    });
    setSource(record);
  }

  return (
    <div className={`ask-result access-review access-view-${view}`}>
      <div className="ask-result-question">
        <div>
          <span className="ask-small">03 / Decide · Access reviews</span>
          <h1 ref={headingRef} tabIndex={-1}>
            {view === "decision"
              ? demoCases.access.question
              : "Your coding assistant"}
          </h1>
          <p>{demoCases.access.scope}</p>
        </div>
        <Crow pose="glide" />
      </div>
      <div className="access-view-controls">
        <div role="group" aria-label="Decision presentation">
          <button
            aria-pressed={view === "decision"}
            onClick={() => setView("decision")}
          >
            Decision view
          </button>
          <button
            aria-pressed={view === "assistant"}
            onClick={() => setView("assistant")}
          >
            Assistant preview
          </button>
        </div>
        <span>Same decision · v{state.current.number}</span>
      </div>
      {view === "assistant" ? (
        <AccessAssistant
          state={state}
          dispatch={dispatch}
          answerRef={answerHeading}
          pendingRef={pendingHeading}
          onInspect={inspect}
          onDiscard={discardContext}
          onOpenDecision={() => setView("decision")}
        />
      ) : (
        <>
          <div className="access-objective">
            <span aria-hidden="true">&gt;_</span> Reduce unnecessary access
            without breaking the work.
          </div>
          <div className="ask-answer-grid">
            <section className="ask-answer">
              <div className="ask-answer-label">
                <span className="ask-small">Recommended move</span>
                <span>
                  v{state.current.number} ·{" "}
                  {state.current.number > 1 ? "Revised" : "Initial view"}
                </span>
              </div>
              <h2 ref={answerHeading} tabIndex={-1}>
                {advice.title}
              </h2>
              <span className="access-field-label">Why this option</span>
              <p>{advice.reason}</p>
              <div className="ask-condition">
                <LockKeyhole size={16} />
                <span>
                  <strong>What must hold</strong>
                  {advice.condition}
                </span>
              </div>
              <span className="access-field-label">Next action</span>
              <p className="access-next-description">{advice.next}</p>
              <NextStep
                version={state.current}
                recorded={recorded}
                onRecord={() => dispatch({ type: "record" })}
              />
              {recorded && (
                <p className="ask-recorded">
                  <Check size={13} /> Simulated next step recorded for v
                  {state.current.number}
                </p>
              )}
            </section>
            <aside className="ask-basis">
              <div className="access-answer-tools">
                <CompareOptions basis={state.current.basis} />
                {(!isAccessCheck(state.current.basis) ||
                  state.current.basis === "irrelevant") && (
                  <button
                    className="access-secondary access-challenge-button"
                    onClick={() => {
                      if (
                        state.current.basis === "daily" ||
                        state.current.basis === "irrelevant"
                      )
                        dispatch({ type: "challenge" });
                      else {
                        challengePanel.current?.scrollIntoView({
                          block: "center",
                          behavior: "instant",
                        });
                        challengePanel.current?.focus({ preventScroll: true });
                      }
                    }}
                  >
                    <MessageCircle size={16} /> Challenge this
                  </button>
                )}
              </div>
              <span className="ask-small">The deciding inputs</span>
              {decidingSources.map((record) => (
                <button
                  key={record.id}
                  onClick={(event) => inspect(record, event.currentTarget)}
                >
                  <FeatherGlyph kind={record.feather} />
                  <span>
                    <small>
                      <ProviderMark provider={record.provider} /> {record.label}
                    </small>
                    <strong>{record.claim}</strong>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
              <details className="ask-confidence">
                <summary>
                  How well is this supported?
                  <ChevronDown size={14} />
                </summary>
                <p>{advice.support}</p>
              </details>
            </aside>
          </div>

          <ChangedSources version={state.current} onInspect={inspect} />

          {((hasRecovery && !isAccessCheck(state.current.basis)) ||
            pending) && (
            <section
              className="access-conversation"
              ref={challengePanel}
              tabIndex={-1}
              aria-label="Challenge the recommendation"
            >
              <div className="access-conversation-label">
                <MessageCircle size={15} />
                <span className="ask-small">
                  A question that changes the picture
                </span>
                <span>Prepared example</span>
              </div>
              <blockquote>
                {state.pending?.kind === "check"
                  ? "Does the selected basis still support this choice?"
                  : "What about the annual recovery task?"}
              </blockquote>
              {hasRecovery && !isAccessCheck(state.current.basis) && (
                <p>
                  The task needs more than the daily role. Is there a working
                  way to provide that capability only when it’s needed?
                </p>
              )}

              {state.pending && (
                <PendingContextCard
                  context={state.pending}
                  version={state.current.number}
                  headingRef={pendingHeading}
                  onInspect={inspect}
                  onReassess={() => dispatch({ type: "reassess" })}
                  onDiscard={discardContext}
                />
              )}

              {hasRecovery &&
                !pending &&
                !isAccessCheck(state.current.basis) && (
                  <div className="access-prepared-paths">
                    <span className="access-field-label">
                      Explore a prepared evidence outcome
                    </span>
                    <div>
                      {(["tested", "unverified", "unavailable"] as const).map(
                        (status: RecoveryPath) => (
                          <button
                            key={status}
                            className="access-path-choice"
                            aria-disabled={state.current.basis === status}
                            onClick={() => {
                              if (state.current.basis !== status)
                                dispatch({ type: "prepare-path", status });
                            }}
                          >
                            <FeatherGlyph
                              kind={recoveryPaths[status].feather}
                            />
                            <strong>
                              {status === "tested"
                                ? "Tested path"
                                : status === "unverified"
                                  ? "Runbook only"
                                  : "No path available"}
                            </strong>
                            <small>
                              {state.current.basis === status
                                ? "Current example"
                                : status === "tested"
                                  ? "A recorded rehearsal"
                                  : status === "unverified"
                                    ? "A process on paper"
                                    : "A platform constraint"}
                            </small>
                            {state.current.basis === status ? (
                              <Check size={14} />
                            ) : (
                              <ArrowRight size={14} />
                            )}
                          </button>
                        ),
                      )}
                    </div>
                    <p className="ask-fine">
                      Fictional alternatives. Selecting one previews a record;
                      reassessment applies it.
                    </p>
                  </div>
                )}
            </section>
          )}

          <div className="ask-result-details">
            {availableFollowups(state.current.basis).some(
              (prompt) => prompt.action.type === "prepare-check",
            ) && (
              <details className="ask-disclosure">
                <summary>
                  Test the deciding facts <ChevronDown size={16} />
                </summary>
                <div className="workflow-update-options">
                  {availableFollowups(state.current.basis)
                    .filter((prompt) => prompt.action.type === "prepare-check")
                    .map((prompt) => (
                      <button
                        disabled={state.pending !== null}
                        key={prompt.label}
                        onClick={() => dispatch(prompt.action)}
                      >
                        {prompt.label}
                        <ArrowRight size={16} />
                      </button>
                    ))}
                </div>
                <p className="ask-fine">
                  Prepared alternative records. Each update needs explicit
                  reassessment.
                </p>
              </details>
            )}
            {state.previous.length > 0 && (
              <details className="ask-disclosure access-history">
                <summary>
                  <span>
                    <History size={17} /> Previous advice
                  </span>
                  <span className="ask-disclosure-hint">
                    {state.previous.length} retained <ChevronDown size={16} />
                  </span>
                </summary>
                <div className="ask-disclosure-body">
                  {state.previous.map((version) => (
                    <article key={version.number}>
                      <span className="ask-small">
                        v{version.number} · {basisLabels[version.basis]}
                      </span>
                      <h3>{accessAdvice[version.basis].title}</h3>
                      <p>{accessAdvice[version.basis].reason}</p>
                      <p>
                        <strong>Condition at the time: </strong>
                        {accessAdvice[version.basis].condition}
                      </p>
                      {state.recordedVersions.includes(version.number) && (
                        <p className="access-old-choice">
                          A simulated next step was recorded for this version.
                        </p>
                      )}
                      <details>
                        <summary>
                          Sources behind v{version.number}
                          <ChevronDown size={13} />
                        </summary>
                        <ul>
                          {versionSources(version).map((record) => (
                            <li key={record.id}>
                              <button
                                onClick={(event) =>
                                  inspect(record, event.currentTarget, version)
                                }
                              >
                                {record.label}
                                <span>{record.revision}</span>
                                <ArrowUpRight size={12} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </article>
                  ))}
                </div>
              </details>
            )}
            <details className="ask-disclosure">
              <summary>
                <span>
                  <Search size={17} /> Explore the sources
                </span>
                <span className="ask-disclosure-hint">
                  {sources.length} records · v{state.current.number}{" "}
                  <ChevronDown size={16} />
                </span>
              </summary>
              <div className="ask-disclosure-body ask-source-body">
                <SourceNetwork sources={sources} onInspect={inspect} />
              </div>
            </details>
            <ContextNote
              note={state.note}
              onSave={(value) => dispatch({ type: "note", value })}
            />
          </div>
        </>
      )}
      {source && (
        <SourceInspector
          source={source}
          scope={demoCases.access.scope}
          sources={inspectionBasis.sources}
          context={inspectionBasis.context}
          onClose={() => setSource(null)}
          returnFocus={sourceTrigger}
        />
      )}
    </div>
  );
}
