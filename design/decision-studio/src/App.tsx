import { FeatherGlyph, sourceDesign } from "./identity";
import {
  ProviderMark,
  providers,
  sourceProvider,
  type Provider,
} from "./providers";
import { Integrations } from "./integrations";
import { DecisionOverview } from "./decision-overview";
import { useEffect, useReducer, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Feather,
  History,
  Home,
  LockKeyhole,
  Menu,
  MessageSquare,
  Pause,
  Play,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "./pixel-icons";
import { Badge, Crow, Eyebrow, FeatherRow } from "./components";
import Panels, { type Panel } from "./dialogs";
import {
  advice,
  decisionReducer,
  feathers,
  initialState,
  type DecisionState,
  type FlightEvent,
  type Page,
  type Scenario,
} from "./domain";

const navigation: { id: Page; label: string; icon: typeof Home }[] = [
  { id: "nest", label: "Decisions", icon: Home },
  { id: "feathers", label: "Sources", icon: Feather },
  { id: "flock", label: "People", icon: Users },
  { id: "log", label: "History", icon: History },
];

function FlightLog({
  state,
  onOpen,
}: {
  state: DecisionState;
  onOpen: (panel: Panel) => void;
}) {
  function entry(event: FlightEvent) {
    switch (event.kind) {
      case "recommendation":
        return (
          <>
            <span className="event-icon sage">
              <BookOpen size={17} />
            </span>
            <div>
              <Eyebrow>Recommendation · V{event.version.number}</Eyebrow>
              <h3>{advice(event.version.scenario).role}</h3>
              <p>
                {event.version.correction
                  ? "Reassessed using the selected scenario fact."
                  : "Original synthetic source basis."}
              </p>
              <button
                className="text-button"
                onClick={() =>
                  onOpen({ kind: "version", version: event.version })
                }
              >
                Inspect version {event.version.number}
                <ArrowUpRight size={14} />
              </button>
            </div>
            <Badge>
              {event.version.number === state.current.number
                ? "Current"
                : "Retained"}
            </Badge>
          </>
        );
      case "correction": {
        const used = [state.current, ...state.previous].find(
          (version) => version.correction?.id === event.correction.id,
        );
        return (
          <>
            <span className="event-icon oxide">
              <MessageSquare size={17} />
            </span>
            <div>
              <Eyebrow>Correction · {event.correction.source}</Eyebrow>
              <h3>{event.correction.note}</h3>
              <p>
                {used
                  ? `Selected fact used in version ${used.number}. Note retained as context.`
                  : state.pending?.id === event.correction.id
                    ? "Saved. Waiting for explicit reassessment."
                    : "Retained. A later correction replaced the pending selection."}
              </p>
            </div>
            <Badge tone="oxide">
              {used
                ? "Applied"
                : state.pending?.id === event.correction.id
                  ? "Pending"
                  : "Retained"}
            </Badge>
          </>
        );
      }
      case "preference":
        return (
          <>
            <span className="event-icon">
              <Check size={17} />
            </span>
            <div>
              <Eyebrow>Simulated preference · V{event.version}</Eyebrow>
              <h3>{event.option}</h3>
              <p>
                A view was recorded. No owner authority or execution is
                established.
              </p>
            </div>
            <Badge>Simulation</Badge>
          </>
        );
    }
  }
  return (
    <div className="flight-log">
      {[...state.events].reverse().map((event, index) => (
        <article
          className={`flight-entry event-${event.kind}`}
          key={state.events.length - index}
        >
          <span className="flight-index" aria-hidden="true">
            {String(state.events.length - index).padStart(2, "0")}
          </span>
          {entry(event)}
        </article>
      ))}
      <div className="log-end">
        <Crow pose="down" />
        <span>Earlier versions stay available.</span>
      </div>
    </div>
  );
}

function People({ onOpen }: { onOpen: (panel: Panel) => void }) {
  const people = [
    {
      initials: "MC",
      sources: ["owner", "directory"],

      name: "Maya Chen",
      role: "Accountable support owner",
      task: "Confirm the necessary work and review the proposed role.",
      scope: "Review required",
      tone: "sage",
    },
    {
      initials: "AR",
      sources: ["roles", "calendar"],

      name: "Alex Rivera",
      role: "Platform delivery lead",
      task: "Check feasibility and test effective permissions in a controlled setting.",
      scope: "Capacity unconfirmed",
      tone: "oxide",
    },
    {
      initials: "JL",
      sources: ["activity", "policy"],

      name: "Jordan Lee",
      role: "Security reviewer",
      task: "Propose the change and preserve the policy boundary.",
      scope: "Proposes, does not authorise",
      tone: "",
    },
  ];
  return (
    <>
      <div className="people-grid">
        {people.map((person) => (
          <article className="person-card" key={person.name}>
            <span className={`person-avatar ${person.tone}`}>
              {person.initials}
            </span>
            <Eyebrow>{person.role}</Eyebrow>
            <h2>{person.name}</h2>
            <p>{person.task}</p>
            <Badge tone={person.tone}>{person.scope}</Badge>
            <details className="person-evidence">
              <summary>
                View sources <ChevronRight size={15} />
              </summary>
              {feathers
                .filter((item) => person.sources.includes(item.id))
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onOpen({ kind: "evidence", feather: item })}
                  >
                    <FeatherGlyph kind={sourceDesign(item.id)} />
                    <span>{item.source}</span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
            </details>
          </article>
        ))}
      </div>
      <div className="scope-note">
        <Users size={19} />
        <span>
          <strong>12 support members</strong> are in scope. Their membership
          comes from a synthetic directory snapshot, not a permissions grant.
        </span>
      </div>
    </>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(decisionReducer, initialState);
  const [page, setPage] = useState<Page>("nest");
  const [selected, setSelected] = useState(feathers[4]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [visible, setVisible] = useState(!document.hidden);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState<Provider | null>(null);
  const [toast, setToast] = useState("");
  const visibleFeathers = feathers.filter(
    (item) =>
      (filter === "all" || item.kind === filter) &&
      (providerFilter === null || sourceProvider(item.id) === providerFilter) &&
      `${item.title} ${item.source} ${item.summary} ${item.quote} ${providers[sourceProvider(item.id)].name}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const reducedMotion = useReducedMotion();
  const canMove = motionEnabled && !reducedMotion && visible;
  const returnFocus = useRef<HTMLElement | null>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const focusOnArrival = useRef(false);
  const navigationFromDialog = useRef(false);
  const main = useRef<HTMLElement>(null);
  const current = advice(state.current.scenario);

  function openPanel(next: Panel) {
    navigationFromDialog.current = false;
    if (!panel && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement;
    setPanel(next);
  }
  function navigate(next: Page) {
    navigationFromDialog.current = Boolean(panel) || mobileNav;
    focusOnArrival.current = next !== page;
    setPage(next);
    setPanel(null);
    setMobileNav(false);
    main.current?.scrollTo({ top: 0, behavior: "instant" });
    if (next === page)
      requestAnimationFrame(() => pageHeading.current?.focus());
  }
  function viewIntegrationSources(provider: Provider) {
    setProviderFilter(provider);
    setQuery("");
    setFilter("all");
    navigate("feathers");
  }
  function saveCorrection(scenario: Scenario, note: string, source: string) {
    dispatch({ type: "save", scenario, note, source });
    setPanel(null);
    setToast("Correction saved. Reassess when you are ready.");
  }
  function prefer(option: string) {
    dispatch({ type: "prefer", option });
    setPanel(null);
    setToast("Simulated preference recorded in History. No access changed.");
  }
  function reassess() {
    if (state.pending)
      setSelected(
        feathers.find(
          (feather) =>
            feather.id ===
            (state.pending?.scenario === "roles-unavailable"
              ? "roles"
              : "owner"),
        ) ?? feathers[4],
      );
    dispatch({ type: "reassess" });
    navigate("nest");
    setToast(
      `Version ${state.current.number + 1} created. The earlier recommendation is retained.`,
    );
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (panel && panel.kind !== "command") return;
        if (document.activeElement instanceof HTMLElement && !panel)
          returnFocus.current = document.activeElement;
        setPanel((value) =>
          value?.kind === "command" ? null : { kind: "command" },
        );
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [panel]);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("motion-off", !canMove);
    return () => document.documentElement.classList.remove("motion-off");
  }, [canMove]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    document.title = `Crowbo · ${page === "settings" ? "Settings · Integrations" : (navigation.find((item) => item.id === page)?.label ?? "Decisions")}`;
  }, [page]);

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: canMove ? 0.22 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <Dialog.Root
        open={mobileNav}
        onOpenChange={(open) => {
          if (open) navigationFromDialog.current = false;
          setMobileNav(open);
        }}
      >
        <div className="app-shell">
          <a className="skip-link" href="#workspace">
            Skip to workspace
          </a>
          <aside className="sidebar" aria-label="Workspace navigation">
            <div className="sidebar-brand">
              <a className="wordmark" href="../" aria-label="Crowbo home">
                crowbo
                <span className="brand-dot" />
              </a>
              <button
                className="icon-button mobile-close"
                aria-label="Close navigation"
                onClick={() => setMobileNav(false)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="workspace-identity">
              <span className="workspace-monogram">
                a<span>↗</span>
              </span>
              <span>
                <strong>Acme</strong>
                <small>Your workspace</small>
              </span>
              <LockKeyhole size={13} />
            </div>
            <Eyebrow className="navigation-label">Workspace</Eyebrow>
            <nav>
              {navigation.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`nav-item ${page === id ? "active" : ""}`}
                  onClick={() => navigate(id)}
                  aria-current={page === id ? "page" : undefined}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {page === id && (
                    <motion.span
                      layoutId="navigation-marker"
                      className="navigation-marker"
                    />
                  )}
                </button>
              ))}
            </nav>
            <nav className="sidebar-settings" aria-label="Settings">
              <a className="nav-item" href="./">
                <Sparkles size={17} />
                <span>Ask a question</span>
              </a>
              <button
                className={`nav-item ${page === "settings" ? "active" : ""}`}
                onClick={() => navigate("settings")}
                aria-current={page === "settings" ? "page" : undefined}
              >
                <Settings size={17} />
                <span>Settings</span>
              </button>
            </nav>
          </aside>

          <div className="workspace">
            <header className="topbar">
              <div className="breadcrumbs">
                <Dialog.Trigger asChild>
                  <button
                    className="icon-button mobile-menu"
                    aria-label="Open navigation"
                  >
                    <Menu size={20} />
                  </button>
                </Dialog.Trigger>
                <span>Acme</span>
                <ChevronRight size={12} />
                <strong>
                  {page === "nest"
                    ? "Decisions"
                    : page === "settings"
                      ? "Settings"
                      : navigation.find((item) => item.id === page)?.label}
                </strong>
                {page === "settings" && (
                  <>
                    <ChevronRight
                      size={12}
                      className="settings-breadcrumb-detail"
                    />
                    <span className="settings-breadcrumb-detail">
                      Integrations
                    </span>
                  </>
                )}
              </div>
              <div className="topbar-actions">
                <span className="demo-label">
                  <span />
                  Synthetic study
                </span>
                <button
                  className="search-trigger"
                  aria-label="Search workspace"
                  onClick={() => openPanel({ kind: "command" })}
                >
                  <Search size={15} />
                  <span>Search</span>
                  <kbd>⌘ K</kbd>
                </button>
                <button
                  className="icon-button motion-toggle"
                  aria-label={
                    canMove ? "Pause animations" : "Enable animations"
                  }
                  title={
                    reducedMotion
                      ? "System reduced-motion preference is respected"
                      : canMove
                        ? "Pause animations"
                        : "Enable animations"
                  }
                  aria-pressed={canMove}
                  disabled={Boolean(reducedMotion)}
                  onClick={() => setMotionEnabled((value) => !value)}
                >
                  {canMove ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <span className="viewer-avatar" title="Synthetic reviewer">
                  JL
                </span>
              </div>
            </header>

            <main
              ref={main}
              id="workspace"
              className="main-scroll"
              tabIndex={-1}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  onAnimationComplete={(animation) => {
                    if (animation === "enter" && focusOnArrival.current) {
                      pageHeading.current?.focus();
                      focusOnArrival.current = false;
                    }
                  }}
                  key={page}
                  className="page"
                  initial={{ opacity: 0, y: canMove ? 9 : 0 }}
                  variants={{
                    enter: { opacity: 1, y: 0 },
                    leave: { opacity: 0, y: canMove ? -5 : 0 },
                  }}
                  animate="enter"
                  exit="leave"
                >
                  {page !== "nest" && page !== "settings" && (
                    <div className="decision-thread">
                      <button onClick={() => navigate("nest")}>
                        <span className="thread-pixel" />
                        Support access
                        <ArrowUpRight size={13} />
                      </button>
                      <span>Decision 001 · V{state.current.number}</span>
                      <span className="thread-state">
                        {state.pending ? "Context waiting" : current.status}
                      </span>
                    </div>
                  )}
                  {page === "settings" ? (
                    <>
                      <div className="page-heading">
                        <Eyebrow>Workspace settings</Eyebrow>
                        <h1 ref={pageHeading} tabIndex={-1}>
                          Integrations
                        </h1>
                        <p>
                          Tools supply records. Sources shows the records behind
                          a decision.
                        </p>
                      </div>
                      <Integrations
                        onInspect={(provider) =>
                          openPanel({ kind: "integration", provider })
                        }
                      />
                    </>
                  ) : page === "nest" ? (
                    <DecisionOverview
                      state={state}
                      selected={selected}
                      headingRef={pageHeading}
                      onSelect={setSelected}
                      onOpen={openPanel}
                      onReassess={reassess}
                    />
                  ) : page === "feathers" ? (
                    <>
                      <div className="page-heading">
                        <Eyebrow>Decision 001</Eyebrow>
                        <h1 ref={pageHeading} tabIndex={-1}>
                          Sources
                        </h1>
                        <p>
                          Records behind this decision. Select one to see more.
                        </p>
                        <Crow pose="up" className="flying-crow" />
                      </div>
                      <div className="collection-toolbar">
                        <label className="collection-search">
                          <Search size={17} />
                          <input
                            placeholder="Search sources, tools or context…"
                            aria-label="Search sources"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                          />
                          {query && (
                            <button
                              className="icon-button"
                              aria-label="Clear source search"
                              onClick={() => setQuery("")}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </label>
                        <div
                          className="filter-buttons"
                          aria-label="Source type"
                        >
                          {[
                            { id: "all", label: "All sources" },
                            { id: "observation", label: "Observations" },
                            { id: "context", label: "Context" },
                            { id: "constraint", label: "Policy" },
                          ].map((item) => (
                            <button
                              key={item.id}
                              aria-pressed={filter === item.id}
                              className={filter === item.id ? "active" : ""}
                              onClick={() => setFilter(item.id)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="collection-caption">
                        <span role="status">
                          {visibleFeathers.length} of 6 records
                        </span>
                        <span>Example tool mappings · no live connections</span>
                      </div>
                      <button
                        className="source-settings-link"
                        onClick={() => navigate("settings")}
                      >
                        <Settings size={14} />
                        Integrations in Settings
                        <ArrowUpRight size={13} />
                      </button>
                      {providerFilter && (
                        <div>
                          <button
                            className="source-provider-filter"
                            aria-label={`Clear ${providers[providerFilter].name} filter`}
                            onClick={() => setProviderFilter(null)}
                          >
                            <ProviderMark provider={providerFilter} />
                            {providers[providerFilter].name}
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      <div className="feather-collection">
                        {visibleFeathers.map((item) => (
                          <FeatherRow
                            key={item.id}
                            feather={item}
                            onClick={() =>
                              openPanel({ kind: "evidence", feather: item })
                            }
                            overlay={
                              (item.id === "roles" &&
                                state.current.scenario ===
                                  "roles-unavailable") ||
                              (item.id === "owner" &&
                                state.current.scenario === "owner-unconfirmed")
                            }
                          />
                        ))}
                      </div>
                      {visibleFeathers.length === 0 && (
                        <div className="empty-collection">
                          <Crow pose="down" />
                          <h2>No matching sources.</h2>
                          <p>Try another term or clear the filter.</p>
                          <button
                            className="secondary-button"
                            onClick={() => {
                              setQuery("");
                              setFilter("all");
                              setProviderFilter(null);
                            }}
                          >
                            Show all sources
                          </button>
                        </div>
                      )}
                      <div className="scope-note">
                        <LockKeyhole size={19} />
                        <span>
                          Six selected synthetic sources. This collection does
                          not represent complete coverage or live system access.
                        </span>
                      </div>
                    </>
                  ) : page === "flock" ? (
                    <>
                      <div className="page-heading">
                        <Eyebrow>People / responsibilities</Eyebrow>
                        <h1 ref={pageHeading} tabIndex={-1}>
                          People
                        </h1>
                        <p>Who reviews the decision and who can deliver it.</p>
                        <Crow pose="glide" className="flying-crow" />
                      </div>
                      <People onOpen={openPanel} />
                    </>
                  ) : (
                    <>
                      <div className="page-heading">
                        <Eyebrow>Decision 001 / retained history</Eyebrow>
                        <h1 ref={pageHeading} tabIndex={-1}>
                          History
                        </h1>
                        <p>
                          Recommendations, corrections and recorded preferences.
                        </p>
                        <Crow pose="down" className="flying-crow" />
                      </div>
                      {state.pending && (
                        <div className="pending-banner">
                          <MessageSquare size={20} />
                          <span>
                            <strong>A correction is waiting.</strong>
                            <small>
                              The original recommendation is still current.
                            </small>
                          </span>
                          <button onClick={reassess}>
                            Reassess now
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      )}
                      <FlightLog state={state} onOpen={openPanel} />
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
            <div className="workspace-status">
              <span>
                <span className="status-dot" />
                Local design study
              </span>
              <span>Synthetic data · No live actions · Resets on reload</span>
              <span>
                V{state.current.number}
                <ArrowDown size={11} />
              </span>
            </div>
          </div>
          <AnimatePresence>
            {toast && (
              <motion.div
                role="status"
                className="toast"
                initial={{ opacity: 0, y: canMove ? 16 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: canMove ? 8 : 0 }}
              >
                <span className="toast-check">
                  <Check size={16} />
                </span>
                <span>{toast}</span>
                <button
                  aria-label="Dismiss notification"
                  onClick={() => setToast("")}
                >
                  <X size={15} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {panel && (
            <Panels
              panel={panel}
              state={state}
              onClose={() => setPanel(null)}
              onOpen={openPanel}
              onNavigate={navigate}
              onViewSources={viewIntegrationSources}
              onSave={saveCorrection}
              onPrefer={prefer}
              returnFocus={() =>
                navigationFromDialog.current
                  ? pageHeading.current
                  : returnFocus.current
              }
            />
          )}
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay mobile-nav-overlay" />
            <Dialog.Content
              className="mobile-nav-dialog"
              onCloseAutoFocus={(event) => {
                if (navigationFromDialog.current) {
                  event.preventDefault();
                  pageHeading.current?.focus();
                }
              }}
            >
              <header>
                <Dialog.Title className="wordmark">
                  crowbo
                  <span className="brand-dot" />
                </Dialog.Title>
                <Dialog.Close
                  className="icon-button"
                  aria-label="Close navigation"
                >
                  <X size={20} />
                </Dialog.Close>
              </header>
              <Dialog.Description>Your Acme workspace</Dialog.Description>
              <nav aria-label="Mobile workspace">
                {navigation.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    className={`nav-item ${page === id ? "active" : ""}`}
                    onClick={() => navigate(id)}
                    aria-current={page === id ? "page" : undefined}
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </nav>
              <nav className="settings-navigation" aria-label="Mobile settings">
                <a className="nav-item" href="./">
                  <Sparkles size={19} />
                  <span>Ask a question</span>
                  <ChevronRight size={15} />
                </a>
                <button
                  className={`nav-item ${page === "settings" ? "active" : ""}`}
                  onClick={() => navigate("settings")}
                  aria-current={page === "settings" ? "page" : undefined}
                >
                  <Settings size={19} />
                  <span>Settings</span>
                  <ChevronRight size={15} />
                </button>
              </nav>
              <Crow />
              <p>Synthetic study. Changes stay in this tab.</p>
            </Dialog.Content>
          </Dialog.Portal>
        </div>
      </Dialog.Root>
    </MotionConfig>
  );
}
