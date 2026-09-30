import { useEffect, useId, useReducer, useRef, useState } from "react";
import {
  briefText,
  destinations,
  examplePlan,
  handoffReducer,
  initialHandoff,
  type DecisionContext,
  type HandoffBrief,
} from "./agent-handoff-model";
import { caseGuides } from "./case-guides";
import type { DecisionView } from "./decision-view";
import type { Chrome } from "./flow-screens";
import { conditions } from "./present";
import {
  Label,
  Runner,
  Shell,
  SourceFeather,
  Window,
  type Command,
} from "./terminal-parts";

const steps = [
  "Carry over the decision",
  "Check scope and conditions",
  "Prepare the response",
];

export function HandoffScreen({
  chrome,
  decision,
  reducedMotion,
  onBack,
  onTryAnother,
}: {
  chrome: Chrome;
  decision: DecisionView;
  reducedMotion: boolean;
  onBack: () => void;
  onTryAnother: () => void;
}) {
  const [state, dispatch] = useReducer(handoffReducer, initialHandoff);
  const [copied, setCopied] = useState<"idle" | "copied" | "manual">("idle");
  const heading = useRef<HTMLHeadingElement>(null);
  const briefId = useId();
  const { current } = decision;
  const guide = caseGuides[decision.caseId];
  const context: DecisionContext = {
    caseId: decision.caseId,
    specification: decision.specification,
    version: current.number,
    question: decision.question,
    scope: decision.scope,
    advice: current.advice,
    sources: current.sources,
    note: decision.note,
  };
  const frameworkNotes = [
    guide.control,
    guide.risk,
    guide.compliance,
    ...Object.entries(guide.mappings).map(
      ([framework, mapping]) =>
        `${framework}: ${mapping.reference}. ${mapping.meaning}`,
    ),
  ].join("\n");
  const brief: HandoffBrief =
    state.kind === "running" || state.kind === "complete"
      ? state.brief
      : {
          destination: state.kind === "configure" ? state.destination : "Codex",
          task: state.kind === "configure" ? state.task : "plan",
          context,
          frameworkNotes,
        };
  const agent = brief.destination.toLowerCase().replace(/ /g, "-");

  useEffect(() => {
    if (state.kind !== "running") return;
    const timer = window.setTimeout(() => dispatch({ type: "tick" }), 1100);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(briefText(brief));
      setCopied("copied");
    } catch {
      setCopied("manual");
    }
  }
  function run() {
    dispatch({ type: "start", context, frameworkNotes, reducedMotion });
  }
  function myself() {
    decision.record();
    dispatch({ type: "manual", context });
  }
  function nextAgent() {
    if (state.kind !== "configure") return;
    const index = destinations.indexOf(state.destination);
    dispatch({
      type: "destination",
      destination: destinations[(index + 1) % destinations.length],
    });
  }

  const commands: Command[] =
    state.kind === "configure"
      ? [
          { keys: ["Enter"], show: "↵", label: "run", run },
          { keys: ["a"], show: "a", label: "change agent", run: nextAgent },
          {
            keys: ["t"],
            show: "t",
            label: "change task",
            run: () =>
              dispatch({
                type: "task",
                task: state.task === "plan" ? "draft" : "plan",
              }),
          },
          { keys: ["y"], show: "y", label: "copy brief", run: copy },
          { keys: ["m"], show: "m", label: "do it myself", run: myself },
          { keys: ["Escape"], show: "esc", label: "back", run: onBack },
        ]
      : state.kind === "running"
        ? [
            {
              keys: ["Enter"],
              show: "↵",
              label: "show the response",
              run: () => dispatch({ type: "finish" }),
            },
            {
              keys: ["Escape"],
              show: "esc",
              label: "change the setup",
              run: () => dispatch({ type: "configure" }),
            },
          ]
        : [
            {
              keys: ["Enter"],
              show: "↵",
              label: "back to decision",
              run: onBack,
            },
            ...(state.kind === "complete"
              ? [{ keys: ["y"], show: "y", label: "copy brief", run: copy }]
              : []),
            {
              keys: ["a"],
              show: "a",
              label: state.kind === "manual" ? "try an agent" : "another agent",
              run: () => dispatch({ type: "configure" }),
            },
            {
              keys: ["n"],
              show: "n",
              label: "new question",
              run: onTryAnother,
            },
          ];

  const title =
    state.kind === "configure"
      ? "Put the decision to work"
      : state.kind === "running"
        ? "Handing over"
        : state.kind === "manual"
          ? "Your next step is recorded"
          : brief.task === "plan"
            ? "The plan is ready"
            : "The draft outline is ready";

  return (
    <Shell
      {...chrome}
      crumb={["Acme", decision.label, `v${current.number}`, "Next step"]}
      screen={`handoff-${state.kind}`}
      view={`${brief.destination}-${brief.task}-${copied}`}
      headingRef={heading}
      placeholder={
        state.kind === "manual"
          ? "next-step --by me"
          : `handoff --to ${agent} --task ${brief.task}`
      }
      commands={commands}
    >
      <div className="t-page t-handoff">
        <div className="t-page-head">
          <div>
            <Label>
              {decision.label} · advice v{current.number}
            </Label>
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
          </div>
        </div>
        <div className="t-handoff-grid">
          <div className="t-handoff-setup">
            {state.kind === "configure" ? (
              <>
                <fieldset>
                  <legend>
                    <Label>Agent</Label>
                  </legend>
                  <div className="t-choices">
                    {destinations.map((name) => (
                      <label key={name} data-on={state.destination === name}>
                        <input
                          type="radio"
                          name="agent"
                          checked={state.destination === name}
                          onChange={() =>
                            dispatch({ type: "destination", destination: name })
                          }
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>
                    <Label>Prepare</Label>
                  </legend>
                  <div className="t-choices t-choices-wide">
                    {(
                      [
                        ["plan", "A plan for the next step"],
                        ["draft", "A draft change for review"],
                      ] as const
                    ).map(([task, name]) => (
                      <label key={task} data-on={state.task === task}>
                        <input
                          type="radio"
                          name="task"
                          checked={state.task === task}
                          onChange={() => dispatch({ type: "task", task })}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : (
              <div>
                <Label>
                  {state.kind === "manual" ? "By you" : brief.destination}
                </Label>
                <p className="t-lead">
                  {state.kind === "manual"
                    ? "Recorded with this version of the advice."
                    : brief.task === "plan"
                      ? "A plan for the next step"
                      : "A draft change for review"}
                </p>
              </div>
            )}
            <div className="t-goes">
              <Label>Goes with the task</Label>
              <strong>{current.advice.title}</strong>
              <ul>
                {conditions(current.advice.condition).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="t-case-feathers">
                {current.sources.map((source) => (
                  <SourceFeather
                    key={source.id}
                    feather={source.feather}
                    provider={source.provider}
                    size={28}
                  />
                ))}
              </div>
              <small>
                {current.sources.length} records, each with its revision and
                dates
              </small>
            </div>
            <div className="t-may">
              <Label>The agent may</Label>
              <ul>
                <li>Read the supplied records</li>
                <li>Prepare text for review</li>
              </ul>
            </div>
            <div className="t-actions">
              {state.kind === "configure" ? (
                <>
                  <button type="button" className="t-primary" onClick={run}>
                    Hand over{" "}
                  </button>
                  <button
                    type="button"
                    className="t-secondary"
                    onClick={myself}
                  >
                    I’ll do it myself{" "}
                  </button>
                </>
              ) : state.kind === "running" ? (
                <button
                  type="button"
                  className="t-secondary"
                  onClick={() => dispatch({ type: "finish" })}
                >
                  Show the response{" "}
                </button>
              ) : (
                <>
                  <button type="button" className="t-primary" onClick={onBack}>
                    Back to decision{" "}
                  </button>
                  <button
                    type="button"
                    className="t-secondary"
                    onClick={onTryAnother}
                  >
                    New question{" "}
                  </button>
                </>
              )}
              {state.kind !== "manual" && state.kind !== "running" && (
                <button type="button" className="t-secondary" onClick={copy}>
                  {copied === "copied" ? "Brief copied" : "Copy brief"}
                </button>
              )}
            </div>
            <p className="t-saved" role="status">
              {copied === "copied" && "The brief is on your clipboard."}
            </p>
            {copied === "manual" && (
              <div className="t-manual-copy">
                <label htmlFor={briefId}>Select and copy the brief</label>
                <textarea
                  id={briefId}
                  readOnly
                  value={briefText(brief)}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
            )}
          </div>
          <div
            className="t-give"
            data-moving={state.kind === "running" && !reducedMotion}
            aria-hidden="true"
          >
            <span>
              <Runner pose="glide" width={130} bob />
            </span>
          </div>
          <Window
            title={
              state.kind === "manual"
                ? "next step"
                : `${state.kind === "complete" ? "response" : "brief"} · ${brief.destination.toLowerCase()}`
            }
            className="t-response"
          >
            <div className="t-response-body" aria-live="polite">
              <p data-tone="quiet">
                brief {"  "}crowbo task brief
                <br />
                {"       "}
                {decision.caseId} · advice v{current.number} · packet{" "}
                {decision.specification}
              </p>
              {state.kind === "configure" && (
                <>
                  <p data-tone="chalk">
                    {current.advice.next.replace(/\.$/, "")}.
                  </p>
                  <p data-tone="sage">
                    question {decision.question}
                    <br />
                    scope {"   "}
                    {decision.scope}
                  </p>
                </>
              )}
              {state.kind === "running" && (
                <ol className="t-run-steps">
                  {steps.map((step, index) => (
                    <li
                      key={step}
                      data-state={
                        index < state.step
                          ? "done"
                          : index === state.step
                            ? "on"
                            : "todo"
                      }
                      aria-current={index === state.step ? "step" : undefined}
                    >
                      <span>{index < state.step ? "✓" : `0${index + 1}`}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              {state.kind === "complete" && (
                <>
                  <p data-tone="chalk">
                    {brief.task === "plan"
                      ? "Here is how I would take this forward."
                      : "Here is the change I would prepare for review."}
                  </p>
                  <ol className="t-plan">
                    {examplePlan(brief).map((line, index) => (
                      <li key={index}>
                        <span>0{index + 1}</span>
                        {line}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {state.kind === "manual" && (
                <>
                  <p data-tone="chalk">
                    {state.context.advice.next.replace(/\.$/, "")}.
                  </p>
                  <ol className="t-plan">
                    {conditions(state.context.advice.condition).map(
                      (line, index) => (
                        <li key={line}>
                          <span>0{index + 1}</span>
                          {line}
                        </li>
                      ),
                    )}
                  </ol>
                </>
              )}
            </div>
          </Window>
        </div>
      </div>
    </Shell>
  );
}
