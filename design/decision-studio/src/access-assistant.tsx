import { useId, useRef, type Dispatch, type RefObject } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  CodeXml,
  CornerDownRight,
  LockKeyhole,
  MessageCircle,
} from "./pixel-icons";
import { Crow } from "./components";
import { FeatherGlyph } from "./identity";
import { ProviderMark } from "./providers";
import { ContextNote } from "./question-components";
import {
  CompareOptions,
  NextStep,
  PendingContextCard,
} from "./access-review-actions";
import {
  accessAdvice,
  availableFollowups,
  basisLabels,
  conversationPrompts,
  versionSources,
  type AccessAction,
  type AccessState,
} from "./access-review-model";
import { demoCases, type DemoSource } from "./question-demo-model";
import "./access-assistant.css";

export function AccessAssistant({
  state,
  dispatch,
  answerRef,
  pendingRef,
  onInspect,
  onDiscard,
  onOpenDecision,
}: {
  state: AccessState;
  dispatch: Dispatch<AccessAction>;
  answerRef: RefObject<HTMLHeadingElement | null>;
  pendingRef: RefObject<HTMLHeadingElement | null>;
  onInspect: (record: DemoSource, trigger: HTMLButtonElement) => void;
  onDiscard: () => void;
  onOpenDecision: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const advice = accessAdvice[state.current.basis];
  const sources = versionSources(state.current);
  const prompts = availableFollowups(state.current.basis);
  const recorded = state.recordedVersions.includes(state.current.number);
  return (
    <section
      className="assistant-preview"
      aria-label="Illustrative coding-assistant conversation"
    >
      <div className="assistant-window-bar">
        <span>
          <CodeXml size={15} /> Coding assistant
        </span>
        <span>UI preview · no agent connected</span>
      </div>
      <div className="assistant-layout">
        <div className="assistant-thread">
          {state.previous.length === 0 && (
            <>
              <article className="assistant-user-turn">
                <span className="assistant-speaker">You</span>
                <p>{demoCases.access.question}</p>
              </article>
              <div className="assistant-routing">
                <span className="assistant-speaker">
                  <MessageCircle size={13} /> Assistant · illustrative response
                </span>
                <p>
                  This is a security decision. I'll ask Crowbo to compare the
                  options against the work.
                </p>
                <span className="assistant-tool-selection">
                  <CornerDownRight size={13} />
                  <FeatherGlyph kind="branch" /> Crowbo selected for this
                  question
                </span>
              </div>
            </>
          )}

          {state.previous.length > 0 && (
            <details className="assistant-earlier">
              <summary>
                {state.previous.length} earlier{" "}
                {state.previous.length === 1 ? "step" : "steps"} in this
                conversation
                <ChevronDown size={14} />
              </summary>
              {state.previous.map((version) => (
                <article key={version.number}>
                  <span className="ask-small">
                    v{version.number} · {basisLabels[version.basis]}
                  </span>
                  <p className="assistant-earlier-question">
                    {conversationPrompts[version.basis]}
                  </p>
                  <strong>{accessAdvice[version.basis].title}</strong>
                  <p>{accessAdvice[version.basis].reason}</p>
                  <p>{accessAdvice[version.basis].condition}</p>
                  {state.recordedVersions.includes(version.number) && (
                    <small>
                      Simulated next step: {accessAdvice[version.basis].next}.
                    </small>
                  )}
                  <details>
                    <summary>
                      {versionSources(version).length} sources used
                      <ChevronDown size={12} />
                    </summary>
                    <div className="assistant-source-links">
                      {versionSources(version).map((record) => (
                        <button
                          key={record.id}
                          onClick={(event) =>
                            onInspect(record, event.currentTarget)
                          }
                        >
                          <ProviderMark provider={record.provider} />
                          {record.label}
                          <span>{record.revision}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </details>
          )}

          {state.current.basis !== "daily" && (
            <article className="assistant-user-turn assistant-followup-turn">
              <span className="assistant-speaker">
                You · prepared follow-up
              </span>
              <p>{conversationPrompts[state.current.basis]}</p>
            </article>
          )}

          <article className="assistant-result">
            <div className="assistant-result-header">
              <span className="assistant-crowbo">
                <Crow pose="glide" /> crowbo
              </span>
              <span>Decision 001 · v{state.current.number}</span>
            </div>
            <div className="ask-answer assistant-answer">
              <span className="ask-small">Recommended move</span>
              <h2 ref={answerRef} tabIndex={-1}>
                {advice.title}
              </h2>
              <p>{advice.reason}</p>
              <div className="ask-condition">
                <LockKeyhole size={15} />
                <span>
                  <strong>What must hold</strong>
                  {advice.condition}
                </span>
              </div>
              <details className="assistant-support">
                <summary>
                  What supports this?
                  <ChevronDown size={13} />
                </summary>
                <p>{advice.support}</p>
              </details>
              <span className="access-field-label">Next action</span>
              <p className="access-next-description">{advice.next}.</p>
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
            </div>
            <div className="assistant-result-tools">
              <CompareOptions basis={state.current.basis} />
              <button className="ask-text-button" onClick={onOpenDecision}>
                Open in Crowbo <ArrowUpRight size={14} />
              </button>
            </div>
          </article>

          {state.pending ? (
            <div
              className="assistant-staged"
              key={
                state.pending.kind === "annual-task"
                  ? "annual"
                  : state.pending.status
              }
            >
              <span className="assistant-speaker">
                <CornerDownRight size={13} /> Follow-up ready for review
              </span>
              <PendingContextCard
                context={state.pending}
                version={state.current.number}
                headingRef={pendingRef}
                onInspect={onInspect}
                onReassess={() => dispatch({ type: "reassess" })}
                onDiscard={onDiscard}
              />
            </div>
          ) : (
            <form
              className="assistant-composer"
              onSubmit={(event) => {
                event.preventDefault();
                dispatch({ type: "send-followup" });
              }}
            >
              <label htmlFor={inputId}>Keep the conversation going</label>
              <div className="assistant-input">
                <textarea
                  ref={input}
                  id={inputId}
                  value={state.followup.draft}
                  rows={2}
                  maxLength={500}
                  aria-invalid={Boolean(state.followup.error)}
                  aria-describedby={
                    state.followup.error ? `${hintId} ${errorId}` : hintId
                  }
                  placeholder="Ask a follow-up..."
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      if (state.followup.draft.trim())
                        dispatch({ type: "send-followup" });
                    }
                  }}
                  onChange={(event) =>
                    dispatch({
                      type: "edit-followup",
                      value: event.target.value,
                    })
                  }
                />
                <button
                  type="submit"
                  aria-label="Send prepared follow-up"
                  disabled={!state.followup.draft.trim()}
                >
                  <ArrowUp size={18} />
                </button>
              </div>
              {state.followup.error && (
                <p id={errorId} className="assistant-input-error" role="alert">
                  {state.followup.error}
                </p>
              )}
              <div
                className="assistant-suggestions"
                aria-label="Prepared follow-ups"
              >
                {prompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt.question}
                    onClick={() => {
                      dispatch({
                        type: "edit-followup",
                        value: prompt.question,
                      });
                      input.current?.focus({ preventScroll: true });
                    }}
                  >
                    <ArrowRight size={12} /> {prompt.label}
                  </button>
                ))}
              </div>
              <p id={hintId}>
                Choose a prepared follow-up. Enter sends; Shift+Enter adds a new
                line. No live model runs.
              </p>
            </form>
          )}
        </div>
        <aside className="assistant-context">
          <span className="ask-small">Context for this question</span>
          <h2>Support access</h2>
          <p>Acme · 12 support staff</p>
          <div className="assistant-context-facts">
            <span>
              <FeatherGlyph kind="branch" />
              <strong>Tickets</strong>Daily work
            </span>
            <span>
              <FeatherGlyph kind="column" />
              <strong>Reports</strong>Quarter-end exports
            </span>
            <span>
              <FeatherGlyph kind="spine" />
              <strong>Own queue only</strong>A firm constraint
            </span>
          </div>
          <details className="assistant-sources">
            <summary>
              {sources.length} source records
              <ChevronDown size={14} />
            </summary>
            <div className="assistant-source-links">
              {sources.map((record) => (
                <button
                  key={record.id}
                  onClick={(event) => onInspect(record, event.currentTarget)}
                >
                  <ProviderMark provider={record.provider} /> {record.label}
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
          </details>
          <p className="assistant-context-note">
            Same sources and advice as the decision view. Switching views keeps
            your place.
          </p>
          <ContextNote
            note={state.note}
            onSave={(value) => dispatch({ type: "note", value })}
          />
        </aside>
      </div>
    </section>
  );
}
