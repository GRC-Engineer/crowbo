import { useRef, useState, type Dispatch } from "react";
import { caseGuides } from "./case-guides";
import type { DecisionView } from "./decision-view";
import {
  caseOwners,
  caseRecords,
  caseTrack,
  checkedOn,
  influenceLabel,
} from "./present";
import { providers, type Provider } from "./providers";
import {
  demoCases,
  researchSteps,
  type CaseId,
  type DemoAction,
  type DemoSource,
  type DemoState,
} from "./question-demo-model";
import { familyLanes } from "./source-families";
import { SourcePane } from "./source-pane";
import {
  Freshness,
  Key,
  Label,
  MarkChip,
  MiniRunner,
  ModularCrow,
  Runner,
  Shell,
  SourceFeather,
  Track,
  Window,
  type Area,
} from "./terminal-parts";

export type Chrome = {
  area: Area;
  onArea: (area: Area) => void;
  onHome: () => void;
};

export const caseOrder: CaseId[] = ["remediation", "access", "exceptions"];
const tools: Provider[] = [
  "zendesk",
  "okta",
  "slack",
  "calendar",
  "notion",
  "linear",
  "github",
  "aws",
  "datadog",
];

// ───────────────────────── Start

export function StartScreen({
  chrome,
  dispatch,
}: {
  chrome: Chrome;
  dispatch: Dispatch<DemoAction>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const choose = (key: string) => {
    dispatch({ type: "open" });
    dispatch({ type: "choose", caseId: caseOrder[Number(key) - 1] });
  };
  return (
    <Shell
      {...chrome}
      crumb={["Acme"]}
      screen="start"
      headingRef={heading}
      placeholder="Press ↵ to start"
      commands={[
        {
          keys: ["Enter"],
          show: "↵",
          label: "start",
          run: () => dispatch({ type: "open" }),
        },
        {
          keys: ["1", "2", "3"],
          show: "1–3",
          label: "prepared question",
          run: choose,
        },
      ]}
    >
      <div className="t-start">
        <Window
          title="crowbo start"
          meta="Acme"
          accent
          className="t-start-card"
        >
          <div className="t-start-top">
            <div className="t-start-copy">
              <h1 ref={heading} tabIndex={-1}>
                What needs <br />a decision?
              </h1>
              <p>
                Pick a security question and see the records behind the
                recommendation.
              </p>
              <div className="t-start-actions">
                <button
                  type="button"
                  className="t-primary"
                  onClick={() => dispatch({ type: "open" })}
                >
                  Start <Key>↵</Key>
                </button>
                <span>or press 1, 2 or 3 for a prepared question</span>
              </div>
            </div>
            <div className="t-start-art" aria-hidden="true">
              <ModularCrow size={300} />
            </div>
          </div>
          <div className="t-start-bottom">
            <pre className="t-boot" aria-hidden="true">
              <span data-tone="chalk">› crowbo start</span>
              {"\n"}
              {"  workspace   Acme\n"}
              {"  questions   remediation · access review · exception\n"}
              {"  sources     9 tools, read-only\n"}
              <span data-tone="sage">{"  ✓ ready"}</span>
            </pre>
            <div className="t-start-tools">
              <Label tone="quiet">Reads from</Label>
              <div>
                {tools.map((tool) => (
                  <MarkChip key={tool} provider={tool} />
                ))}
              </div>
              <p>Records are read where they already live.</p>
            </div>
          </div>
        </Window>
        <div className="t-start-lane" aria-hidden="true">
          <span>
            <i data-tone="sage" />
            records
          </span>
          <div className="t-lane" data-moving="true">
            {[0, 1.35, 2.7].map((delay) => (
              <span
                key={delay}
                className="t-lane-runner"
                style={{ animationDelay: `${delay}s` }}
              >
                <MiniRunner />
              </span>
            ))}
          </div>
          <span>
            <i data-tone="socket" />
            one recommendation, with who decides
          </span>
        </div>
      </div>
    </Shell>
  );
}

// ───────────────────────── Home

export function HomeScreen({
  chrome,
  state,
  dispatch,
  decisions,
}: {
  chrome: Chrome;
  state: Extract<DemoState, { kind: "question" }>;
  dispatch: Dispatch<DemoAction>;
  decisions: Record<CaseId, DecisionView>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const choose = (caseId: CaseId) => dispatch({ type: "choose", caseId });
  return (
    <Shell
      {...chrome}
      crumb={["Acme"]}
      screen="home"
      headingRef={heading}
      placeholder="Ask in your own words, or press 1, 2 or 3"
      value={state.draft}
      onValue={(value) => dispatch({ type: "edit", value })}
      onSubmit={() => dispatch({ type: "submit" })}
      error={state.error}
      commands={[
        {
          keys: ["1", "2", "3"],
          show: "1–3",
          label: "start a question",
          run: (key) => choose(caseOrder[Number(key) - 1]),
        },
        {
          keys: ["Escape"],
          show: "esc",
          label: "back",
          run: () => dispatch({ type: "home" }),
        },
      ]}
    >
      <div className="t-page t-home">
        <div className="t-page-head">
          <div>
            <Label>Tuesday 29 September</Label>
            <h1 ref={heading} tabIndex={-1}>
              What needs a decision?
            </h1>
            <p>
              Three kinds of question. Each one ends in one next move and the
              records behind it.
            </p>
          </div>
          <div className="t-page-art" aria-hidden="true">
            <Runner pose="up" width={190} />
          </div>
        </div>
        <div className="t-cases">
          {caseOrder.map((caseId, index) => {
            const decision = decisions[caseId];
            const entry = demoCases[caseId];
            return (
              <button
                type="button"
                key={caseId}
                className="t-case"
                onClick={() => choose(caseId)}
              >
                <span className="t-case-top">
                  <Key>{index + 1}</Key>
                  <span>
                    {entry.sources.length} sources ·{" "}
                    {decision.branches.length - 1} prepared updates
                  </span>
                </span>
                <Label>{entry.label}</Label>
                <strong>{caseGuides[caseId].title}</strong>
                <span className="t-case-text">
                  {caseGuides[caseId].invitation}
                </span>
                <span className="t-case-foot">
                  <span>{entry.scope}</span>
                  <span className="t-case-feathers">
                    {entry.sources.slice(0, 7).map((source) => (
                      <SourceFeather
                        key={source.id}
                        feather={source.feather}
                        provider={source.provider}
                        size={28}
                      />
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

// ───────────────────────── Ask: how the question was read

export function ConfirmScreen({
  chrome,
  caseId,
  dispatch,
}: {
  chrome: Chrome;
  caseId: CaseId;
  dispatch: Dispatch<DemoAction>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const entry = demoCases[caseId];
  const owner = caseOwners[caseId];
  const used = [...new Set(entry.sources.map((source) => source.provider))];
  const [subject, ...place] = entry.scope.split(" · ");
  const fields = [
    ["Workflow", entry.label, "From your question"],
    ["Subject", subject, place.join(" · ")],
    ["Decision", caseGuides[caseId].title, "What the answer settles"],
    ["Decides", owner.decides, owner.role],
    ["Needed by", owner.due, "From the work calendar"],
    [
      "Your authority",
      "You propose. The owner decides.",
      "From workspace roles",
    ],
  ];
  const start = () => dispatch({ type: "start" });
  return (
    <Shell
      {...chrome}
      crumb={["Acme", "New question"]}
      screen={`confirm-${caseId}`}
      headingRef={heading}
      placeholder={entry.question}
      commands={[
        { keys: ["Enter"], show: "↵", label: "start reading", run: start },
        {
          keys: ["Escape"],
          show: "esc",
          label: "edit question",
          run: () => dispatch({ type: "question" }),
        },
      ]}
    >
      <div className="t-page t-confirm">
        <div className="t-page-head">
          <div>
            <Label>Before it starts</Label>
            <h1 ref={heading} tabIndex={-1}>
              Crowbo read your question like this
            </h1>
            <p>{entry.question}</p>
          </div>
        </div>
        <div className="t-confirm-grid">
          <dl className="t-fields">
            {fields.map(([name, value, note]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
                <dd className="t-field-note">{note}</dd>
              </div>
            ))}
          </dl>
          <section className="t-panel t-will-read">
            <div className="t-panel-head">
              <Label>It will read {entry.sources.length} sources</Label>
              <span>{used.length} tools · read-only</span>
            </div>
            <ul>
              {entry.sources.map((source) => (
                <li key={source.id}>
                  <SourceFeather
                    feather={source.feather}
                    provider={source.provider}
                  />
                  <span>
                    <strong>{source.label}</strong>
                    <small>{providers[source.provider].name}</small>
                  </span>
                  <Freshness source={source} />
                </li>
              ))}
            </ul>
            <p>
              These {entry.sources.length} records are everything it opens.
              Access is read-only.
            </p>
          </section>
        </div>
        <div className="t-actions">
          <button type="button" className="t-primary" onClick={start}>
            Start reading <Key>↵</Key>
          </button>
          <button
            type="button"
            className="t-secondary"
            onClick={() => dispatch({ type: "question" })}
          >
            Edit question <Key>esc</Key>
          </button>
        </div>
      </div>
    </Shell>
  );
}

// ───────────────────────── Read the sources

function revealed(step: number, lanes: number) {
  return step === 0
    ? Math.ceil(lanes / 3)
    : step === 1
      ? Math.ceil((lanes * 2) / 3)
      : lanes;
}

export function ReadScreen({
  chrome,
  state,
  dispatch,
  reducedMotion,
}: {
  chrome: Chrome;
  state: Extract<DemoState, { kind: "research" }>;
  dispatch: Dispatch<DemoAction>;
  reducedMotion: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<DemoSource | null>(null);
  const entry = demoCases[state.caseId];
  const current = new Set(entry.sources.map((source) => source.id));
  const lanes = familyLanes(
    state.caseId,
    entry.sources,
    caseRecords(state.caseId).filter((record) => !current.has(record.id)),
  );
  // Lanes are read top to bottom; a lane with no record yet is passed over.
  const used = lanes.filter((lane) => lane.records.length > 0);
  const reached = used.slice(0, revealed(state.step, used.length));
  const read = reached.flatMap((lane) => lane.records);
  const moving = !state.paused && !reducedMotion;
  const counts = (
    ["deciding", "supporting", "context", "constraint"] as const
  ).map((kind) => ({
    kind,
    count: read.filter((source) => source.influence === kind).length,
  }));

  function inspect(source: DemoSource, element: HTMLElement) {
    trigger.current = element;
    if (!state.paused) dispatch({ type: "pause" });
    setOpen(source);
  }

  return (
    <Shell
      {...chrome}
      crumb={["Acme", entry.label, "Reading"]}
      screen={`read-${state.caseId}`}
      view={`${open?.id ?? ""}-${state.paused}`}
      headingRef={heading}
      placeholder={`Reading ${entry.sources.length} sources in ${used.length} families`}
      commands={[
        {
          keys: [" "],
          show: "space",
          label: state.paused ? "resume" : "pause",
          run: () => dispatch({ type: "pause" }),
        },
        {
          keys: ["Enter"],
          show: "↵",
          label: "skip to answer",
          run: () => dispatch({ type: "finish" }),
        },
        {
          keys: ["Escape"],
          show: "esc",
          label: open ? "close source" : "edit question",
          run: () => {
            if (open) {
              setOpen(null);
              trigger.current?.focus();
            } else dispatch({ type: "question" });
          },
        },
      ]}
    >
      <div className="t-page t-read">
        <div className="t-page-head">
          <div>
            <Label>{entry.label}</Label>
            <h1 ref={heading} tabIndex={-1}>
              {entry.question}
            </h1>
          </div>
          <ol className="t-steps">
            {researchSteps.map((step, index) => (
              <li
                key={step.label}
                data-state={
                  index < state.step
                    ? "done"
                    : index === state.step
                      ? "on"
                      : "todo"
                }
                aria-current={index === state.step ? "step" : undefined}
              >
                <i>{index < state.step ? "✓" : index + 1}</i>
                {step.label}
              </li>
            ))}
          </ol>
        </div>
        <div className="t-read-grid">
          <div className="t-lanes" data-moving={moving}>
            {lanes.map((lane) => {
              const live = reached.includes(lane);
              const index = used.indexOf(lane);
              return (
                <div className="t-lane-row" key={lane.id} data-waiting={!live}>
                  <div className="t-lane-source">
                    <div className="t-lane-name">
                      <strong>{lane.name}</strong>
                      <span>{lane.question}</span>
                    </div>
                    <div className="t-chips">
                      {lane.records.map((source) => (
                        <button
                          type="button"
                          key={source.id}
                          className="t-chip"
                          data-influence={source.influence}
                          disabled={!live}
                          onClick={(event) =>
                            inspect(source, event.currentTarget)
                          }
                        >
                          <SourceFeather
                            feather={source.feather}
                            provider={source.provider}
                            size={28}
                          />
                          {source.label}
                        </button>
                      ))}
                      {lane.later.map((source) => (
                        <span
                          key={source.id}
                          className="t-chip"
                          data-later="true"
                          title="A later update adds this record"
                        >
                          <SourceFeather
                            feather={source.feather}
                            provider={source.provider}
                            size={28}
                          />
                          {source.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="t-lane" aria-hidden="true">
                    {live && (
                      <span
                        className="t-lane-runner"
                        style={{
                          animationDelay: `${(index * 0.31).toFixed(2)}s`,
                        }}
                      >
                        <MiniRunner width={52} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {open ? (
            <SourcePane
              source={open}
              sources={entry.sources}
              context={`${entry.label} · advice v1`}
              onClose={() => {
                setOpen(null);
                trigger.current?.focus();
              }}
            />
          ) : (
            <section className="t-panel t-shape" aria-live="polite">
              <div className="t-panel-head">
                <Label>Taking shape</Label>
                <span>
                  {read.length} of {entry.sources.length} read
                </span>
              </div>
              <Track
                vertical
                steps={caseTrack(state.caseId, read, "initial")}
              />
              <dl className="t-counts">
                {counts.map(({ kind, count }) => (
                  <div key={kind} data-influence={kind}>
                    <dt>{influenceLabel[kind]}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
              <div className="t-shape-next">
                <Label tone="quiet">
                  {state.paused ? "Paused" : researchSteps[state.step].label}
                </Label>
                <p>
                  {state.paused
                    ? "Open a source, then resume when you are ready."
                    : caseGuides[state.caseId].research[state.step]}
                </p>
              </div>
            </section>
          )}
        </div>
        <pre className="t-log" aria-hidden="true">
          {read.slice(-3).map((source, index, list) => (
            <span
              key={source.id}
              data-tone={index === list.length - 1 ? "chalk" : "sage"}
            >
              {index === list.length - 1 && state.step < 2 ? "… " : "✓ "}
              {"read   "}
              {source.id.padEnd(20)}
              {providers[source.provider].name.padEnd(17)}
              {checkedOn(source)}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
    </Shell>
  );
}
