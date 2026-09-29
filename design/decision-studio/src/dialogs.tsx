import { FeatherGlyph, sourceDesign } from "./identity";
import {
  ProviderTag,
  providers,
  sourceProvider,
  type Provider,
} from "./providers";
import { IntegrationDetails } from "./integrations";
import { useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Command,
  Feather as FeatherIcon,
  LockKeyhole,
  Search,
  X,
} from "./pixel-icons";
import { Badge, Crow, Eyebrow, PermissionTable } from "./components";
import {
  advice,
  feathers,
  options,
  scenarios,
  type DecisionState,
  type Feather,
  type Page,
  type Scenario,
  type Version,
} from "./domain";

export type Panel =
  | { kind: "evidence"; feather: Feather }
  | { kind: "integration"; provider: Provider }
  | { kind: "challenge"; source: string }
  | { kind: "compare" }
  | { kind: "review" }
  | { kind: "command" }
  | { kind: "version"; version: Version }
  | { kind: "outcomes" };

type Props = {
  panel: Panel;
  state: DecisionState;
  onClose: () => void;
  onOpen: (panel: Panel) => void;
  onNavigate: (page: Page) => void;
  onViewSources: (provider: Provider) => void;
  onSave: (scenario: Scenario, note: string, source: string) => void;
  onPrefer: (option: string) => void;
  returnFocus: () => HTMLElement | null;
};

function Frame({
  title,
  label,
  description,
  children,
  onClose,
  returnFocus,
  className = "",
}: {
  title: string;
  label: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
  className?: string;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog-content ${className}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus()?.focus();
          }}
        >
          <header className="dialog-header">
            <Eyebrow>{label}</Eyebrow>
            <Dialog.Close className="icon-button" aria-label="Close panel">
              <X size={20} />
            </Dialog.Close>
          </header>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="dialog-description">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChallengeForm({
  source,
  state,
  onSave,
}: {
  source: string;
  state: DecisionState;
  onSave: Props["onSave"];
}) {
  const [scenario, setScenario] = useState<Scenario>(
    state.pending?.scenario ?? state.current.scenario,
  );
  const [note, setNote] = useState("");
  return (
    <form
      className="challenge-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(scenario, note, source);
      }}
    >
      <div className="source-reference">
        <FeatherIcon size={16} />
        <span>
          Regarding <strong>{source}</strong>
        </span>
      </div>
      <fieldset>
        <legend>Change a deciding fact</legend>
        {scenarios.map((item) => (
          <label
            className={`scenario-choice ${item.id === scenario ? "selected" : ""}`}
            key={item.id}
          >
            <input
              type="radio"
              name="scenario"
              value={item.id}
              checked={item.id === scenario}
              onChange={() => setScenario(item.id)}
            />
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            {item.id === scenario && <Check size={17} />}
          </label>
        ))}
      </fieldset>
      <label className="field-label" htmlFor="correction-note">
        Your context <span>Optional</span>
      </label>
      <textarea
        id="correction-note"
        maxLength={600}
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What should we reconsider?"
      />
      <div className="field-help">
        <span>
          The selected fact drives this scripted demo. Your note is saved as
          text.
        </span>
        <span>{note.length}/600</span>
      </div>
      <div className="dialog-notice">
        Saving keeps the original recommendation. You decide when to reassess.
      </div>
      {state.pending && (
        <p className="small-note">
          This replaces the pending selection; both correction notes remain in
          History. Only the latest selected fact is used when you reassess.
        </p>
      )}
      <button
        className="primary-button"
        type="submit"
        disabled={state.events.length >= 60}
      >
        Save correction
        <ArrowRight size={16} />
      </button>
      {state.events.length >= 60 && (
        <p role="status">
          This session is full. Reload to start a new simulation.
        </p>
      )}
    </form>
  );
}

function CommandSearch({
  onOpen,
  onNavigate,
}: Pick<Props, "onOpen" | "onNavigate">) {
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const resultButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const entries = [
    {
      label: "Decisions",
      detail: "Open the current decision",
      run: () => onNavigate("nest"),
    },
    {
      label: "Support platform access review",
      detail: "Decision 001 · Acme",
      run: () => onNavigate("nest"),
    },
    {
      label: "Sources",
      detail: "Explore all six sources",
      run: () => onNavigate("feathers"),
    },
    {
      label: "Integrations",
      detail: "Settings · Tools, permissions and sync",
      run: () => onNavigate("settings"),
    },
    {
      label: "People",
      detail: "People and responsibilities",
      run: () => onNavigate("flock"),
    },
    {
      label: "History",
      detail: "Versions, corrections and preferences",
      run: () => onNavigate("log"),
    },
    {
      label: "Compare options",
      detail: "Three options and their consequences",
      run: () => onOpen({ kind: "compare" }),
    },
    ...["Maya Chen", "Alex Rivera", "Jordan Lee"].map((name) => ({
      label: name,
      detail: "People and responsibilities",
      run: () => onNavigate("flock"),
    })),
    ...feathers.map((feather) => ({
      label: feather.title,
      detail: feather.source,
      run: () => onOpen({ kind: "evidence", feather }),
    })),
  ].filter((item) =>
    `${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="command-input">
        <Search size={21} />
        <input
          ref={searchInput}
          aria-label="Search workspace"
          autoFocus
          placeholder="Find a decision, source, or person…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              resultButtons.current[0]?.focus();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              entries[0]?.run();
            }
          }}
        />
        <kbd>↵</kbd>
      </div>
      <div className="command-results">
        {entries.length === 0 ? (
          <div className="search-empty">
            <Crow pose="down" />
            <strong>No matches found.</strong>
            <p>Try “reports”, “owner”, or “policy”.</p>
          </div>
        ) : (
          entries.map((item, index) => (
            <button
              key={item.label}
              ref={(element) => {
                resultButtons.current[index] = element;
              }}
              onClick={item.run}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  resultButtons.current[
                    Math.min(index + 1, entries.length - 1)
                  ]?.focus();
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (index === 0) searchInput.current?.focus();
                  else resultButtons.current[index - 1]?.focus();
                }
              }}
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))
        )}
      </div>
      <footer className="command-footer">
        <span>
          <Command size={12} /> K to open
        </span>
        <span>↑ ↓ to browse · Enter to open · Esc to close</span>
      </footer>
    </>
  );
}

export default function Panels(props: Props) {
  const {
    panel,
    state,
    onClose,
    onOpen,
    onNavigate,
    onViewSources,
    onSave,
    onPrefer,
    returnFocus,
  } = props;
  const common = { onClose, returnFocus };
  switch (panel.kind) {
    case "integration":
      return (
        <Frame
          {...common}
          label="SETTINGS / INTEGRATIONS"
          title={providers[panel.provider].name}
          description="Connection details and the source records associated with this tool."
        >
          <IntegrationDetails
            provider={panel.provider}
            onViewSources={onViewSources}
          />
        </Frame>
      );
    case "evidence": {
      const item = panel.feather;
      const overlaid =
        (item.id === "roles" &&
          state.current.scenario === "roles-unavailable") ||
        (item.id === "owner" && state.current.scenario === "owner-unconfirmed");
      return (
        <Frame
          {...common}
          className="evidence-drawer"
          label={`SOURCES / ${item.revision}`}
          title={item.title}
          description="Original synthetic source. Its scope and limits stay attached to the claim."
        >
          <div className="source-detail-heading">
            <span className="source-stamp">
              <FeatherGlyph kind={sourceDesign(item.id)} />
            </span>
            <strong>{item.source}</strong>
            <Badge tone={item.kind === "constraint" ? "oxide" : ""}>
              {item.status}
            </Badge>
          </div>
          <div className="source-provider">
            <ProviderTag provider={sourceProvider(item.id)} />
            <span>Illustrative mapping · synthetic record</span>
          </div>
          <button
            className="source-settings-link"
            onClick={() =>
              onOpen({
                kind: "integration",
                provider: sourceProvider(item.id),
              })
            }
          >
            View {providers[sourceProvider(item.id)].name} integration
            <ArrowUpRight size={13} />
          </button>
          {overlaid && (
            <div className="dialog-notice">
              The current scenario challenges this source. The quotation below
              is the unchanged original.
            </div>
          )}
          <blockquote className="source-quote">{item.quote}</blockquote>
          <section className="source-explanation">
            <Eyebrow>Why it matters</Eyebrow>
            <p>{item.influence}</p>
            <Eyebrow>Where it stops</Eyebrow>
            <p className="muted">{item.limit}</p>
          </section>
          <dl className="source-meta">
            <dt>Subject</dt>
            <dd>Acme / Support platform</dd>
            <dt>Source revision</dt>
            <dd>{item.revision}</dd>
            <dt>Observation period</dt>
            <dd>{item.period}</dd>
            <dt>Fixture check</dt>
            <dd>{item.checked}</dd>
            <dt>Access scope</dt>
            <dd>Synthetic workspace only</dd>
          </dl>
          <button
            className="primary-button"
            onClick={() => onOpen({ kind: "challenge", source: item.source })}
          >
            Correct information
            <ArrowUpRight size={16} />
          </button>
        </Frame>
      );
    }
    case "challenge":
      return (
        <Frame
          {...common}
          label="CORRECTION / KEEP THE ORIGINAL"
          title="Correct information"
          description="Correct a fact, add context, or test an assumption."
        >
          <ChallengeForm source={panel.source} state={state} onSave={onSave} />
        </Frame>
      );
    case "compare":
      return (
        <Frame
          {...common}
          className="comparison-dialog"
          label="DECISION / ALTERNATIVES"
          title="Compare options"
          description="Compare the work each option preserves and the conditions it needs."
        >
          <div className="option-grid">
            {options(state.current.scenario).map((option, index) => (
              <article
                className={`option-card ${option.id === "custom" ? "featured" : ""}`}
                key={option.id}
              >
                <div className="option-top">
                  <span className="option-number">0{index + 1}</span>
                  <Badge>{option.status}</Badge>
                </div>
                <h3>{option.name}</h3>
                <p>{option.benefit}</p>
                <div className="option-tradeoff">
                  <Eyebrow>The trade-off</Eyebrow>
                  <p>{option.tradeoff}</p>
                </div>
                <button
                  className="secondary-button"
                  disabled={state.events.length >= 60}
                  onClick={() => onPrefer(option.name)}
                >
                  Record preference
                  <ArrowRight size={15} />
                </button>
              </article>
            ))}
          </div>
          <p className="small-note">
            <LockKeyhole size={14} /> All options must respect own-queue access.
            A recorded preference is simulated, not approval or execution.
          </p>
        </Frame>
      );
    case "review": {
      const result = advice(state.current.scenario);
      return (
        <Frame
          {...common}
          label={`PROPOSAL / VERSION ${state.current.number}`}
          title={result.role}
          description={result.description}
        >
          <PermissionTable scenario={state.current.scenario} />
          <div className="review-gates">
            <Eyebrow>Before any change</Eyebrow>
            <p>
              <span className="empty-check" />
              Owner review <Badge>Not recorded</Badge>
            </p>
            <p>
              <span className="empty-check" />
              Effective permission test <Badge>Not observed</Badge>
            </p>
          </div>
          <div className="dialog-notice">{result.next}</div>
          <button
            className="primary-button"
            disabled={state.events.length >= 60}
            onClick={() => onPrefer(result.role)}
          >
            Record a simulated preference
            <ArrowRight size={16} />
          </button>
          <p className="small-note">
            This records your view in this tab. It does not grant approval or
            change access.
          </p>
        </Frame>
      );
    }
    case "command":
      return (
        <Frame
          {...common}
          className="command-dialog"
          label="CROWBO / QUICK FIND"
          title="Search"
          description="Search this synthetic workspace."
        >
          <CommandSearch onOpen={onOpen} onNavigate={onNavigate} />
        </Frame>
      );
    case "version": {
      const result = advice(panel.version.scenario);
      return (
        <Frame
          {...common}
          label={`HISTORY / VERSION ${panel.version.number}`}
          title={result.role}
          description="A retained recommendation. New context never replaces its original basis."
        >
          <Badge tone="oxide">{result.status}</Badge>
          <p className="version-description">{result.description}</p>
          <PermissionTable scenario={panel.version.scenario} />
          <div className="dialog-notice">{result.condition}</div>
          {panel.version.correction ? (
            <>
              <Eyebrow>Correction used in this version</Eyebrow>
              <blockquote className="source-quote">
                {panel.version.correction.note}
              </blockquote>
              <p className="small-note">
                Only the selected scenario fact changed the scripted result.
              </p>
            </>
          ) : (
            <p className="small-note">
              Original six-source basis. No counterfactual overlay.
            </p>
          )}
        </Frame>
      );
    }
    case "outcomes":
      return (
        <Frame
          {...common}
          label="FOLLOW-THROUGH / OUTCOME CHECKS"
          title="A proposal is the beginning."
          description="These checks have not happened. They describe what a later review would need."
        >
          <div className="outcome-empty">
            <Crow pose="up" />
            <Eyebrow>Nothing observed yet</Eyebrow>
          </div>
          <div className="outcome-list">
            {[
              "Does the role preserve ticket handling?",
              "Can support export only its own queue?",
              "Are settings and user administration unavailable?",
              "Did quarter-end reporting complete successfully?",
            ].map((text) => (
              <div key={text}>
                <span className="empty-check" />
                <strong>{text}</strong>
                <Badge>Not observed</Badge>
              </div>
            ))}
          </div>
          <p className="small-note">
            No reduction in risk or improvement in protection is claimed from a
            proposed role alone.
          </p>
        </Frame>
      );
  }
}
