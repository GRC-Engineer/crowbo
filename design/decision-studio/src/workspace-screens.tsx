import { useRef, useState } from "react";
import type { DecisionView } from "./decision-view";
import { caseOrder, type Chrome } from "./flow-screens";
import {
  caseOwners,
  caseSlug,
  caseTrack,
  checkedOn,
  conditions,
  freshness,
  influenceLabel,
  influenceSquares,
  tidy,
} from "./present";
import { providers, type Provider } from "./providers";
import { usePurity } from "./purity";
import type { CaseId } from "./question-demo-model";
import type { DemoSource } from "./source-model";
import { SourcePane } from "./source-pane";
import type { FeatherDesign } from "./identity";
import {
  Key,
  Label,
  Runner,
  Shell,
  SourceFeather,
  Squares,
  Window,
  type Command,
} from "./terminal-parts";

type Decisions = Record<CaseId, DecisionView>;

function standing(decision: DecisionView) {
  const steps = caseTrack(
    decision.caseId,
    decision.current.sources,
    decision.current.stage,
  );
  const done = steps.filter((step) => step.done);
  return done[done.length - 1]?.label ?? steps[0].label;
}

function evidence(decision: DecisionView) {
  const values = decision.current.sources.map(
    (source) => freshness(source).squares,
  );
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

// ───────────────────────── Decisions

export function QueueScreen({
  chrome,
  decisions,
  onOpen,
  onNew,
}: {
  chrome: Chrome;
  decisions: Decisions;
  onOpen: (caseId: CaseId) => void;
  onNew: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState<CaseId | "all">("all");
  const rows = caseOrder.filter((id) => filter === "all" || filter === id);
  // PROTOTYPE L3: the inbox opens with counts instead of filters.
  const purity = usePurity();
  const all = caseOrder.map((id) => decisions[id]);
  const strip = [
    ["Need you", all.filter((d) => !d.current.recorded).length],
    ["Staged", all.filter((d) => d.pending !== null).length],
    ["Handed off", all.filter((d) => d.current.recorded).length],
    ["Versions", all.reduce((sum, d) => sum + d.previous.length + 1, 0)],
  ] as const;
  const index = Math.min(selected, rows.length - 1);
  const move = (by: number) =>
    setSelected(Math.max(0, Math.min(rows.length - 1, index + by)));
  return (
    <Shell
      {...chrome}
      crumb={["Acme", "Decisions"]}
      screen="queue"
      view={filter}
      headingRef={heading}
      placeholder="Press ↵ to open the selected decision"
      commands={[
        {
          keys: ["j", "ArrowDown"],
          show: "j",
          label: "down",
          run: () => move(1),
        },
        { keys: ["k", "ArrowUp"], show: "k", label: "up", run: () => move(-1) },
        {
          keys: ["Enter"],
          show: "↵",
          label: "open",
          run: () => onOpen(rows[index]),
        },
        { keys: ["n"], show: "n", label: "new question", run: onNew },
      ]}
    >
      <div className="t-page t-queue">
        <div className="t-page-head">
          <div>
            <Label>
              {caseOrder.length} decisions · {caseOrder.length} waiting on you
            </Label>
            <h1 ref={heading} tabIndex={-1}>
              Decisions
            </h1>
          </div>
          {purity === 3 ? (
            <dl className="t-strip">
              {strip.map(([name, count]) => (
                <div key={name} data-on={count > 0}>
                  <dd>{count}</dd>
                  <dt>{name}</dt>
                </div>
              ))}
            </dl>
          ) : (
            <div
              className="t-filters"
              role="group"
              aria-label="Filter by workflow"
            >
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              {caseOrder.map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {decisions[id].label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="t-table">
          <div className="t-table-head" aria-hidden="true">
            {[
              "Decision",
              "Workflow",
              "Status",
              "Decides",
              "Due",
              "Evidence",
              "Ver",
            ].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
          {rows.map((id, row) => {
            const decision = decisions[id];
            const owner = caseOwners[id];
            const fresh = evidence(decision);
            return (
              <button
                type="button"
                key={id}
                data-selected={row === index}
                onFocus={() => setSelected(row)}
                onClick={() => onOpen(id)}
              >
                <strong>{decision.title}</strong>
                <span>{decision.label}</span>
                <span className="t-cell-status">
                  <i aria-hidden="true" />
                  {standing(decision)}
                </span>
                <span>{owner.decides}</span>
                <span>{owner.due.replace(/(\w{3})\w+$/, "$1")}</span>
                <span>
                  <Squares
                    filled={fresh}
                    of={7}
                    label={`Evidence freshness ${fresh} of 7`}
                  />
                </span>
                <span>v{decision.current.number}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

// ───────────────────────── Sources

const toolNotes: Record<Provider, [FeatherDesign, string]> = {
  zendesk: ["series", "Ticket activity and role definitions"],
  okta: ["cluster", "People and group membership"],
  slack: ["braid", "Messages from selected channels"],
  calendar: ["column", "Events from selected calendars"],
  notion: ["spine", "Policies, runbooks and requests"],
  github: ["merge", "Pull requests and reviews"],
  linear: ["vector", "Findings, issues and reviews"],
  aws: ["object", "Deployment inventory and receipts"],
  datadog: ["loop", "Monitoring checks and coverage"],
  drive: ["vector", "Shared documents"],
};

export function SourcesScreen({
  chrome,
  decisions,
}: {
  chrome: Chrome;
  decisions: Decisions;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [tool, setTool] = useState<Provider | null>(null);
  const [open, setOpen] = useState<{
    source: DemoSource;
    caseId: CaseId;
  } | null>(null);
  const records = caseOrder.flatMap((caseId) =>
    decisions[caseId].current.sources.map((source) => ({ source, caseId })),
  );
  const used = (Object.keys(toolNotes) as Provider[]).filter((provider) =>
    records.some(({ source }) => source.provider === provider),
  );
  const listed = records.filter(({ source }) => source.provider === tool);
  const close: Command = {
    keys: ["Escape"],
    show: "esc",
    label: open ? "close source" : "all tools",
    run: () => {
      if (open) {
        setOpen(null);
        trigger.current?.focus();
      } else setTool(null);
    },
  };
  return (
    <Shell
      {...chrome}
      crumb={["Acme", "Sources", ...(tool ? [providers[tool].name] : [])]}
      screen={`sources-${tool ?? "all"}`}
      view={open?.source.id ?? ""}
      headingRef={heading}
      placeholder="Press a number to open a tool"
      commands={[
        {
          keys: used.map((_, index) => String(index + 1)),
          show: `1–${used.length}`,
          label: "open a tool",
          run: (key) => {
            setOpen(null);
            setTool(used[Number(key) - 1]);
          },
        },
        ...(tool || open ? [close] : []),
      ]}
    >
      <div className="t-page t-sources">
        <div className="t-page-head">
          <div>
            <Label>{used.length} tools connected · all read-only</Label>
            <h1 ref={heading} tabIndex={-1}>
              {tool ? providers[tool].name : "Sources"}
            </h1>
          </div>
          <div className="t-page-art" aria-hidden="true">
            <Runner pose="up" width={130} />
          </div>
        </div>
        {tool ? (
          <div className="t-challenge-grid" data-open={open !== null}>
            <section className="t-block">
              <div className="t-panel-head t-rule">
                <Label>{listed.length} records</Label>
                <span>Checked</span>
              </div>
              {listed.map(({ source, caseId }) => (
                <button
                  type="button"
                  className="t-source-row"
                  key={`${caseId}-${source.id}`}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setOpen({ source, caseId });
                  }}
                >
                  <SourceFeather
                    feather={source.feather}
                    provider={source.provider}
                  />
                  <span className="t-source-row-text">
                    <span>
                      <strong>{source.label}</strong>
                      <small>{decisions[caseId].label}</small>
                    </span>
                    <span>{tidy(source.claim)}</span>
                  </span>
                  <span className="t-source-row-meta">
                    <span className="t-fresh">
                      <Squares
                        filled={freshness(source).squares}
                        of={7}
                        label={`Freshness ${freshness(source).squares} of 7`}
                      />
                      <span>{checkedOn(source)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </section>
            {open && (
              <SourcePane
                source={open.source}
                sources={decisions[open.caseId].current.sources}
                context={`${decisions[open.caseId].label} · advice v${decisions[open.caseId].current.number}`}
                onClose={() => {
                  setOpen(null);
                  trigger.current?.focus();
                }}
              />
            )}
          </div>
        ) : (
          <div className="t-tools">
            {used.map((provider, index) => {
              const mine = records.filter(
                ({ source }) => source.provider === provider,
              );
              const fresh = Math.max(
                ...mine.map(({ source }) => freshness(source).squares),
              );
              return (
                <button
                  type="button"
                  key={provider}
                  className="t-tool"
                  onClick={() => setTool(provider)}
                >
                  <span className="t-tool-top">
                    <SourceFeather
                      feather={toolNotes[provider][0]}
                      provider={provider}
                      size={56}
                    />
                    <span>
                      <Key>{index + 1}</Key>
                      {mine.length} {mine.length === 1 ? "record" : "records"}
                    </span>
                  </span>
                  <strong>{providers[provider].name}</strong>
                  <span>{toolNotes[provider][1]}</span>
                  <span className="t-wire" aria-hidden="true">
                    <i />
                  </span>
                  <span className="t-tool-foot">
                    <Squares
                      filled={fresh}
                      of={7}
                      label={`Freshness ${fresh} of 7`}
                    />
                    Connected, read-only
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}

// ───────────────────────── History

export function HistoryScreen({
  chrome,
  decisions,
  onOpen,
}: {
  chrome: Chrome;
  decisions: Decisions;
  onOpen: (caseId: CaseId) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const events = caseOrder.flatMap((caseId) => {
    const decision = decisions[caseId];
    const versions = [...decision.previous, decision.current];
    return [
      ...versions.flatMap((version) => [
        {
          key: `${caseId}-v${version.number}`,
          caseId,
          when: `v${version.number}`,
          kind: version.number === 1 ? "Recommendation" : "Reassessed",
          text: version.advice.title.replace(/\.$/, ""),
          note: `${version.sources.length} sources`,
          pose: version.number === 1 ? ("glide" as const) : ("down" as const),
          tone: "chalk",
        },
        ...(version.recorded
          ? [
              {
                key: `${caseId}-v${version.number}-next`,
                caseId,
                when: `v${version.number}`,
                kind: "Next step recorded",
                text: version.advice.next.replace(/\.$/, ""),
                note: `for ${caseOwners[caseId].decides}`,
                pose: null,
                tone: "sage",
              },
            ]
          : []),
      ]),
      ...(decision.note
        ? [
            {
              key: `${caseId}-note`,
              caseId,
              when: "note",
              kind: "Context added",
              text: decision.note,
              note: "by you",
              pose: null,
              tone: "oxide",
            },
          ]
        : []),
    ];
  });
  return (
    <Shell
      {...chrome}
      crumb={["Acme", "History"]}
      screen="history"
      headingRef={heading}
      placeholder="Press a number to open a decision"
      commands={[
        {
          keys: ["1", "2", "3"],
          show: "1–3",
          label: "open a decision",
          run: (key) => onOpen(caseOrder[Number(key) - 1]),
        },
      ]}
    >
      <div className="t-page t-log-page">
        <div className="t-page-head">
          <div>
            <Label>Every version is kept</Label>
            <h1 ref={heading} tabIndex={-1}>
              History
            </h1>
          </div>
        </div>
        <ol className="t-events">
          {events.map((event) => (
            <li key={event.key} data-tone={event.tone}>
              <span>{event.when}</span>
              <i aria-hidden="true" />
              <div>
                <Label>
                  {event.kind} <span>{event.note}</span>
                </Label>
                <button type="button" onClick={() => onOpen(event.caseId)}>
                  {event.text}
                </button>
                <small>{decisions[event.caseId].label}</small>
              </div>
              <span aria-hidden="true">
                {event.pose && (
                  <Runner pose={event.pose} width={110} heading="left" />
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Shell>
  );
}

// ───────────────────────── The same decision in a terminal and an assistant

export function OutsideScreen({
  chrome,
  decisions,
  onOpen,
}: {
  chrome: Chrome;
  decisions: Decisions;
  onOpen: (caseId: CaseId) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [caseId, setCaseId] = useState<CaseId>("access");
  const decision = decisions[caseId];
  const { current } = decision;
  const slug = caseSlug[caseId];
  const owner = caseOwners[caseId];
  const checks = conditions(current.advice.condition);
  const bars = (source: DemoSource) =>
    source.influence === "constraint"
      ? "must "
      : "■".repeat(influenceSquares[source.influence]) +
        "□".repeat(5 - influenceSquares[source.influence]);
  return (
    <Shell
      {...chrome}
      crumb={["Acme", "CLI and assistant"]}
      screen={`outside-${caseId}`}
      headingRef={heading}
      placeholder={`crowbo decide ${slug}`}
      commands={[
        {
          keys: ["1", "2", "3"],
          show: "1–3",
          label: "switch decision",
          run: (key) => setCaseId(caseOrder[Number(key) - 1]),
        },
        {
          keys: ["Enter"],
          show: "↵",
          label: "open in Crowbo",
          run: () => onOpen(caseId),
        },
      ]}
    >
      <div className="t-page t-outside">
        <div className="t-page-head">
          <div>
            <Label>Outside the app</Label>
            <h1 ref={heading} tabIndex={-1}>
              The same decision, same version, where the work happens
            </h1>
          </div>
          <div className="t-filters" role="group" aria-label="Decision">
            {caseOrder.map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={caseId === id}
                onClick={() => setCaseId(id)}
              >
                {decisions[id].label}
              </button>
            ))}
          </div>
        </div>
        <div className="t-outside-grid">
          <Window title="zsh · crowbo cli">
            <pre className="t-cli">
              <span data-tone="chalk">$ crowbo decide {slug}</span>
              {"\n\n"}
              <span data-tone="oxide">
                {"  "}RECOMMENDED MOVE{"  "}v{current.number}
              </span>
              {"\n"}
              <span data-tone="chalk">
                {"  "}
                {current.advice.title.replace(/\.$/, "")}
              </span>
              {"\n\n"}
              {checks.map((line, index) => (
                <span key={line}>
                  {index === 0 ? "  must hold   " : "              "}[ ] {line}
                  {"\n"}
                </span>
              ))}
              {"\n"}
              {decision.focus.slice(0, 4).map((source, index) => (
                <span key={source.id}>
                  {index === 0 ? "  decided by  " : "              "}
                  {bars(source)} {source.id.padEnd(20)}
                  {checkedOn(source)}
                  {"\n"}
                </span>
              ))}
              {"\n"}
              {"  decides     "}
              {owner.decides} · before {owner.due}
              {"\n\n"}
              <span data-tone="sage">
                {"  "}crowbo compare {slug}
                {"\n  "}crowbo challenge {slug}
                {"\n"}
              </span>
              {"\n"}
              <span data-tone="chalk">$ </span>
              <i className="t-cursor" aria-hidden="true" />
            </pre>
          </Window>
          <Window title="coding assistant · tool call">
            <div className="t-chat">
              <p data-tone="quiet">You</p>
              <p data-tone="chalk">{decision.question}</p>
              <p data-tone="quiet">Assistant</p>
              <p>That is a security decision. Asking Crowbo.</p>
              <pre data-tone="sage">
                {"  tool  crowbo.decision.get\n"}
                {`  args  { "id": "${slug}" }`}
              </pre>
              <section className="t-chat-card">
                <div className="t-panel-head">
                  <Label tone="oxide">Crowbo · v{current.number}</Label>
                  <span>
                    {influenceLabel.deciding}: {decision.focus.length} records
                  </span>
                </div>
                <strong>{current.advice.title.replace(/\.$/, "")}</strong>
                <p>{current.advice.reason}</p>
                <button
                  type="button"
                  className="t-link"
                  onClick={() => onOpen(caseId)}
                >
                  Open in Crowbo ↗
                </button>
              </section>
              <p>
                Crowbo recommends this next:{" "}
                {current.advice.next.replace(/\.$/, "")}. {owner.decides}{" "}
                decides. I have left the change as a draft for review.
              </p>
            </div>
          </Window>
        </div>
      </div>
    </Shell>
  );
}
