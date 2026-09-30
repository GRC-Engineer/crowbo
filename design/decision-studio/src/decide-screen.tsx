import { useEffect, useRef, useState, type ReactNode } from "react";
import { caseGuides, frameworks, type Framework } from "./case-guides";
import type { DecisionView, VersionView } from "./decision-view";
import type { Chrome } from "./flow-screens";
import { HandoffScreen } from "./handoff-screen";
import { caseOwners, caseSlug, caseTrack, conditions, tidy } from "./present";
import { providers } from "./providers";
import { usePurity } from "./purity";
import { familyLanes } from "./source-families";
import type { DemoSource } from "./source-model";
import { SourcePane } from "./source-pane";
import {
  DecisionRecord,
  Freshness,
  Influence,
  Key,
  Label,
  Runner,
  Shell,
  SourceFeather,
  StatusItem,
  Tag,
  Track,
  finePointer,
  type Command,
} from "./terminal-parts";

type Pane =
  | "overview"
  | "why"
  | "sources"
  | "frameworks"
  | "updates"
  | "options"
  | "history";

const paneName: Record<Pane, string> = {
  overview: "",
  why: "Why",
  sources: "Sources",
  frameworks: "Frameworks",
  updates: "Updates",
  options: "Options",
  history: "History",
};

function SourceRow({
  source,
  onOpen,
}: {
  source: DemoSource;
  onOpen: (source: DemoSource, element: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      className="t-source-row"
      onClick={(event) => onOpen(source, event.currentTarget)}
    >
      <SourceFeather feather={source.feather} provider={source.provider} />
      <span className="t-source-row-text">
        <span>
          <strong>{source.label}</strong>
          <small>{providers[source.provider].name}</small>
        </span>
        <span>{tidy(source.claim)}</span>
      </span>
      <span className="t-source-row-meta">
        <Influence source={source} />
        <Freshness source={source} />
      </span>
    </button>
  );
}

function PaneFrame({
  label,
  title,
  onClose,
  children,
}: {
  label: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!finePointer()) heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside className="t-pane" aria-label={title}>
      <div className="t-pane-head">
        <Label>{label}</Label>
        <button type="button" className="t-close" onClick={onClose}>
          Close <Key>esc</Key>
        </button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </aside>
  );
}

function FrameworksPane({
  decision,
  framework,
  onFramework,
  onClose,
}: {
  decision: DecisionView;
  framework: Framework;
  onFramework: (id: Framework) => void;
  onClose: () => void;
}) {
  const guide = caseGuides[decision.caseId];
  return (
    <PaneFrame
      label="Explanation"
      title="Controls, risk and compliance"
      onClose={onClose}
    >
      <dl className="t-parts">
        <div>
          <dt>The control</dt>
          <dd>{guide.control}</dd>
        </div>
        <div>
          <dt>The risk</dt>
          <dd>{guide.risk}</dd>
        </div>
        <div>
          <dt>The record to keep</dt>
          <dd>{guide.compliance}</dd>
        </div>
      </dl>
      <div className="t-frameworks">
        {(Object.keys(frameworks) as Framework[]).map((id, index) => {
          const mapping = guide.mappings[id];
          return id === framework ? (
            <section key={id} data-open="true" aria-live="polite">
              <p>
                <Key>{index + 1}</Key>
                <strong>{frameworks[id].label}</strong>
                <small>{frameworks[id].edition}</small>
              </p>
              <h3>{mapping.reference}</h3>
              <p>{mapping.meaning}</p>
              <p>
                <strong>Ask your control owner</strong> {mapping.check}
              </p>
              <a
                href={frameworks[id].url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the reference ↗
              </a>
            </section>
          ) : (
            <button type="button" key={id} onClick={() => onFramework(id)}>
              <Key>{index + 1}</Key>
              <strong>{frameworks[id].label}</strong>
              <span>{mapping.reference}</span>
            </button>
          );
        })}
      </div>
      <p className="t-fine">
        Confirm applicability against your own controls and scope.
      </p>
    </PaneFrame>
  );
}

function diffLines(current: VersionView, decision: DecisionView) {
  const next = decision.pending;
  if (!next) return [];
  const lines: { sign: "+" | "-" | ""; name: string; text: string }[] = [];
  for (const source of next.added)
    lines.push({
      sign: "+",
      name: "source",
      text: `${source.id} · ${providers[source.provider].name} · ${tidy(source.claim)}`,
    });
  const pair = (name: string, before: string, after: string) => {
    if (before === after) lines.push({ sign: "", name, text: before });
    else {
      lines.push({ sign: "-", name, text: before });
      lines.push({ sign: "+", name, text: after });
    }
  };
  pair(
    "move",
    current.advice.title.replace(/\.$/, ""),
    next.advice.title.replace(/\.$/, ""),
  );
  pair("next", current.advice.next, next.advice.next);
  const before = conditions(current.advice.condition);
  const after = conditions(next.advice.condition);
  for (const line of before)
    lines.push({
      sign: after.includes(line) ? "" : "-",
      name: "holds",
      text: line,
    });
  for (const line of after)
    if (!before.includes(line))
      lines.push({ sign: "+", name: "holds", text: line });
  return lines;
}

export function DecideScreen({
  chrome,
  decision,
  onTryAnother,
  reducedMotion,
}: {
  chrome: Chrome;
  decision: DecisionView;
  onTryAnother: () => void;
  reducedMotion: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [pane, setPane] = useState<Pane>("overview");
  const [framework, setFramework] = useState<Framework>("soc2");
  const [handoff, setHandoff] = useState(false);
  const [line, setLine] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState<{
    source: DemoSource;
    sources: DemoSource[];
    context: string;
  } | null>(null);
  const { current, pending } = decision;
  const purity = usePurity();
  const owner = caseOwners[decision.caseId];
  const slug = caseSlug[decision.caseId];
  const checks = conditions(current.advice.condition);
  const rest = current.sources.filter(
    (source) => !decision.focus.includes(source),
  );

  // A new version or a staged update starts from the overview.
  useEffect(() => {
    setPane("overview");
    setOpen(null);
  }, [current.number, pending === null]);

  if (handoff)
    return (
      <HandoffScreen
        chrome={chrome}
        decision={decision}
        reducedMotion={reducedMotion}
        onBack={() => setHandoff(false)}
        onTryAnother={onTryAnother}
      />
    );

  function inspect(
    source: DemoSource,
    element: HTMLElement,
    version: { sources: DemoSource[]; context: string } = {
      sources: current.sources,
      context: `advice v${current.number}`,
    },
  ) {
    trigger.current = element;
    setOpen({ source, ...version });
  }
  function closeSource() {
    setOpen(null);
    trigger.current?.focus();
  }
  function show(next: Pane) {
    setOpen(null);
    setPane(next);
  }
  function submit(text: string) {
    setSaved(false);
    if (decision.ask) {
      const error = decision.ask(text);
      setLineError(error);
      if (!error) setLine("");
      return;
    }
    decision.saveNote(text);
    setLine("");
    setSaved(true);
  }

  const back: Command = {
    keys: ["Escape"],
    show: "esc",
    label: open
      ? "close source"
      : pane === "overview"
        ? "new question"
        : "close",
    run: () => {
      if (open) closeSource();
      else if (pane !== "overview") setPane("overview");
      else onTryAnother();
    },
  };

  // ── a staged update: the current advice beside the proposed one
  if (pending) {
    const lines = diffLines(current, decision);
    return (
      <Shell
        {...chrome}
        crumb={[
          "Acme",
          decision.label,
          `v${current.number} to v${current.number + 1}`,
        ]}
        screen={`challenge-${decision.caseId}-${current.number}`}
        view={open?.source.id ?? ""}
        headingRef={heading}
        placeholder={pending.label}
        commands={[
          {
            keys: ["Enter"],
            show: "↵",
            label: "reassess",
            run: decision.reassess,
          },
          {
            keys: ["k"],
            show: "k",
            label: `keep v${current.number}`,
            run: decision.discard,
          },
          ...(pending.added[0]
            ? [
                {
                  keys: ["s"],
                  show: "s",
                  label: "inspect source",
                  run: () =>
                    setOpen({
                      source: pending.added[0],
                      sources: pending.sources,
                      context: `staged for v${current.number + 1}`,
                    }),
                },
              ]
            : []),
          ...(open ? [back] : []),
        ]}
      >
        <div className="t-page t-challenge">
          <div className="t-page-head">
            <div>
              <Label>{decision.label} · one update staged</Label>
              <h1 ref={heading} tabIndex={-1}>
                {pending.added.length > 0
                  ? "This would change the advice"
                  : "This leaves the advice as it is"}
              </h1>
              <p>{tidy(pending.change)}</p>
            </div>
            <Tag tone="oxide">Staged</Tag>
          </div>
          <div className="t-versions">
            <section className="t-panel" data-dim="true">
              <div className="t-panel-head">
                <Label>v{current.number} · current</Label>
                <span>{current.sources.length} sources</span>
              </div>
              <h2>{current.advice.title.replace(/\.$/, "")}</h2>
              <p>{current.advice.reason}</p>
            </section>
            <div className="t-arrive" aria-hidden="true">
              <span>
                <Runner pose="down" width={140} bob={purity === 0} />
              </span>
            </div>
            <section className="t-panel" data-proposed="true">
              <div className="t-panel-head">
                <Label tone="oxide">v{current.number + 1} · proposed</Label>
                <span>{pending.sources.length} sources</span>
              </div>
              <h2>{pending.advice.title.replace(/\.$/, "")}</h2>
              <p>{pending.advice.reason}</p>
            </section>
          </div>
          <div className="t-challenge-grid" data-open={open !== null}>
            <section className="t-diff">
              <div className="t-panel-head">
                <Label>What changed</Label>
                <span>v{current.number} stays in history either way</span>
              </div>
              <ul>
                {lines.map((entry, index) => (
                  <li key={index} data-sign={entry.sign}>
                    <span aria-hidden="true">{entry.sign || " "}</span>
                    <span className="sr-only">
                      {entry.sign === "+"
                        ? "added"
                        : entry.sign === "-"
                          ? "removed"
                          : "kept"}
                    </span>
                    <span>{entry.name}</span>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            </section>
            {open && (
              <SourcePane
                source={open.source}
                sources={open.sources}
                context={open.context}
                onClose={closeSource}
              />
            )}
          </div>
          <div className="t-actions">
            <button
              type="button"
              className="t-primary"
              onClick={decision.reassess}
            >
              Reassess with this update <Key>↵</Key>
            </button>
            <button
              type="button"
              className="t-secondary"
              onClick={decision.discard}
            >
              Keep v{current.number} <Key>k</Key>
            </button>
            {pending.added.map((source) => (
              <button
                type="button"
                className="t-secondary"
                key={source.id}
                onClick={(event) =>
                  inspect(source, event.currentTarget, {
                    sources: pending.sources,
                    context: `staged for v${current.number + 1}`,
                  })
                }
              >
                Inspect {source.label.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  const keys: {
    key: string;
    pane: Pane;
    hint: string;
    name: string;
    note: string;
  }[] = [
    {
      key: "w",
      pane: "why",
      hint: "why",
      name: "Why this recommendation",
      note: tidy(current.advice.support),
    },
    {
      key: "f",
      pane: "frameworks",
      hint: "frameworks",
      name: "Controls, risk and compliance",
      note: "SOC 2, ISO 27001 and NIST CSF 2.0 references",
    },
    {
      key: "u",
      pane: "updates",
      hint: "updates",
      name: "What could change this",
      note: `${decision.updates.length} prepared updates`,
    },
    {
      key: "o",
      pane: "options",
      hint: "options",
      name: "Compare the options",
      note: `${decision.options.length} options`,
    },
    {
      key: "h",
      pane: "history",
      hint: "history",
      name: "History",
      note: `${decision.previous.length + 1} ${decision.previous.length ? "versions" : "version"}`,
    },
  ];

  return (
    <Shell
      {...chrome}
      crumb={[
        "Acme",
        decision.label,
        `v${current.number}`,
        ...(open
          ? [open.source.id]
          : pane === "overview"
            ? []
            : [paneName[pane]]),
      ]}
      screen={`decide-${decision.caseId}-${current.number}`}
      view={`${pane}-${open?.source.id ?? ""}-${framework}`}
      headingRef={heading}
      placeholder={
        decision.ask
          ? "Ask a follow-up, or press a key"
          : "Add context for the reviewer, or press a key"
      }
      value={line}
      onValue={(value) => {
        setLine(value);
        setLineError(null);
      }}
      onSubmit={submit}
      error={lineError}
      commands={[
        ...keys.map(({ key, pane: target, hint }): Command => ({
          keys: [key],
          show: key,
          label: hint,
          run: () => show(target),
        })),
        {
          keys: ["s"],
          show: "s",
          label: "sources",
          run: () => show("sources"),
        },
        ...(pane === "frameworks"
          ? [
              {
                keys: ["1", "2", "3"],
                show: "1–3",
                label: "framework",
                run: (key: string) =>
                  setFramework(
                    (Object.keys(frameworks) as Framework[])[Number(key) - 1],
                  ),
              },
            ]
          : []),
        {
          keys: ["Enter"],
          show: "↵",
          label: "next step",
          run: () => setHandoff(true),
        },
        back,
      ]}
    >
      <div className="t-page t-decide">
        <div className="t-page-head">
          <div>
            <Label>
              {decision.label} <span>{decision.scope}</span>
            </Label>
            <h1 ref={heading} tabIndex={-1}>
              {decision.question}
            </h1>
          </div>
          <div className="t-page-art" aria-hidden="true">
            <Runner pose="glide" width={150} heading="left" />
          </div>
        </div>
        <div className="t-decide-grid" data-pane={open ? "source" : pane}>
          <DecisionRecord
            title={`crowbo decide ${slug}`}
            meta={`advice v${current.number} · ${current.label}`}
            advice={current.advice}
            action={
              <div className="t-record-action">
                <dl className="t-who">
                  <div>
                    <dt>Decides</dt>
                    <dd>{owner.decides}</dd>
                  </div>
                  <div>
                    <dt>Delivers</dt>
                    <dd>{owner.delivers}</dd>
                  </div>
                  <div>
                    <dt>Before</dt>
                    <dd>{owner.due}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="t-primary"
                  onClick={() => setHandoff(true)}
                >
                  Take the next step <Key>↵</Key>
                </button>
                <p>Yourself, or as a brief for an agent.</p>
              </div>
            }
            status={
              <>
                <StatusItem tone="oxide">
                  {checks.length}{" "}
                  {checks.length === 1 ? "condition" : "conditions"} open
                </StatusItem>
                <StatusItem>{current.sources.length} sources read</StatusItem>
                {purity < 3 && current.recorded && (
                  <StatusItem>next step recorded</StatusItem>
                )}
                {purity < 3 && decision.note && (
                  <StatusItem tone="quiet">context added</StatusItem>
                )}
              </>
            }
          />
          {open ? (
            <SourcePane
              source={open.source}
              sources={open.sources}
              context={open.context}
              onClose={closeSource}
            />
          ) : pane === "overview" ? (
            <section className="t-over">
              <div>
                <div className="t-panel-head">
                  <Label>Where this stands</Label>
                  <span>from the records read</span>
                </div>
                <Track
                  steps={caseTrack(
                    decision.caseId,
                    current.sources,
                    current.stage,
                  )}
                />
              </div>
              <div>
                <div className="t-panel-head t-rule">
                  <Label>What decided this</Label>
                  <span>Influence · Freshness</span>
                </div>
                {decision.focus.slice(0, 4).map((source) => (
                  <SourceRow key={source.id} source={source} onOpen={inspect} />
                ))}
                {rest.length > 0 && (
                  <button
                    type="button"
                    className="t-more"
                    onClick={() => show("sources")}
                  >
                    +{" "}
                    {current.sources.length -
                      Math.min(decision.focus.length, 4)}{" "}
                    more <span>all {current.sources.length} sources</span>
                  </button>
                )}
              </div>
              <ul className="t-keys">
                {keys.map(({ key, pane: target, name, note }) => (
                  <li key={key}>
                    <button type="button" onClick={() => show(target)}>
                      <Key>{key}</Key>
                      <strong>{name}</strong>
                      <span>{note}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="t-saved" role="status">
                {saved && `Context saved with v${current.number}.`}
              </p>
            </section>
          ) : pane === "frameworks" ? (
            <FrameworksPane
              decision={decision}
              framework={framework}
              onFramework={setFramework}
              onClose={() => setPane("overview")}
            />
          ) : pane === "why" ? (
            <PaneFrame
              label={`advice v${current.number}`}
              title="Why this recommendation"
              onClose={() => setPane("overview")}
            >
              <p className="t-lead">{tidy(current.advice.support)}</p>
              {current.change && (
                <div className="t-block">
                  <Label tone="oxide">Why the advice changed</Label>
                  <p>{tidy(current.change)}</p>
                </div>
              )}
              <div className="t-block">
                <div className="t-panel-head t-rule">
                  <Label>The deciding inputs</Label>
                  <span>Influence · Freshness</span>
                </div>
                {decision.focus.map((source) => (
                  <SourceRow key={source.id} source={source} onOpen={inspect} />
                ))}
              </div>
            </PaneFrame>
          ) : pane === "sources" ? (
            <PaneFrame
              label={`advice v${current.number}`}
              title={`All ${current.sources.length} sources`}
              onClose={() => setPane("overview")}
            >
              {familyLanes(decision.caseId, current.sources).map((lane) => (
                <div className="t-block" key={lane.id}>
                  <div className="t-panel-head t-rule">
                    <Label>{lane.name}</Label>
                    <span>{lane.records.length}</span>
                  </div>
                  {lane.records.map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      onOpen={inspect}
                    />
                  ))}
                </div>
              ))}
            </PaneFrame>
          ) : pane === "updates" ? (
            <PaneFrame
              label="Staged first, then applied by reassessing"
              title="What could change this"
              onClose={() => setPane("overview")}
            >
              <p className="t-lead">
                <strong>{decision.challenge.title}</strong>{" "}
                {decision.challenge.body} {decision.challenge.check}
              </p>
              <div className="t-block">
                <div className="t-panel-head t-rule">
                  <Label>Add a record</Label>
                  <span>{decision.updates.length} prepared</span>
                </div>
                <div className="t-updates">
                  {decision.updates.map((update) => (
                    <button
                      type="button"
                      key={update.id}
                      onClick={update.stage}
                    >
                      {update.label
                        .replace(/^Try (an? )?/i, "")
                        .replace(/^./, (c) => c.toUpperCase())}
                      <Key>→</Key>
                    </button>
                  ))}
                </div>
              </div>
              <div className="t-block">
                <div className="t-panel-head t-rule">
                  <Label>Every prepared branch</Label>
                  <span>sources</span>
                </div>
                <ul className="t-branches">
                  {decision.branches.map((branch) => (
                    <li
                      key={branch.id}
                      data-current={branch.current}
                      style={{ paddingLeft: 8 + branch.depth * 20 }}
                    >
                      <i aria-hidden="true" />
                      <span>
                        <strong>{branch.label}</strong>
                        <small>{branch.title}</small>
                      </span>
                      <span>{branch.sources}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </PaneFrame>
          ) : pane === "options" ? (
            <PaneFrame
              label="Options for the same work"
              title="What each option does"
              onClose={() => setPane("overview")}
            >
              <div className="t-options">
                {decision.options.map((option) => (
                  <section key={option.name} data-proposed={option.proposed}>
                    <Label tone={option.proposed ? "oxide" : "quiet"}>
                      {option.proposed ? "Recommended" : "Option"}
                    </Label>
                    <h3>{option.name}</h3>
                    <p>{tidy(option.result)}</p>
                    {option.gap && (
                      <p>
                        <strong>Still needed</strong> {option.gap}
                      </p>
                    )}
                  </section>
                ))}
              </div>
              <p className="t-fine">
                Every option still needs an accountable decision.
              </p>
            </PaneFrame>
          ) : (
            <PaneFrame
              label="Every version is kept"
              title="History"
              onClose={() => setPane("overview")}
            >
              <ol className="t-history">
                {[...decision.previous, current].map((version) => (
                  <li key={version.number} data-current={version === current}>
                    <span>v{version.number}</span>
                    <i aria-hidden="true" />
                    <div>
                      <Label>
                        {version.number === 1 ? "Recommendation" : "Reassessed"}{" "}
                        <span>{version.label}</span>
                      </Label>
                      <strong>{version.advice.title.replace(/\.$/, "")}</strong>
                      {version.change && <p>{tidy(version.change)}</p>}
                      <p>
                        <button
                          type="button"
                          className="t-link"
                          onClick={(event) =>
                            inspect(version.sources[0], event.currentTarget, {
                              sources: version.sources,
                              context: `advice v${version.number}`,
                            })
                          }
                        >
                          {version.sources.length} sources
                        </button>
                        {version.recorded && " · next step recorded"}
                      </p>
                    </div>
                  </li>
                ))}
                {decision.note && (
                  <li>
                    <span>note</span>
                    <i aria-hidden="true" />
                    <div>
                      <Label>Context added</Label>
                      <p>{decision.note}</p>
                    </div>
                  </li>
                )}
              </ol>
            </PaneFrame>
          )}
        </div>
      </div>
    </Shell>
  );
}
