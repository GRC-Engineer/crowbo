import type { Ref } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  LockKeyhole,
  MessageSquare,
} from "lucide-react";
import { Badge, Crow, EvidenceMap, Eyebrow } from "./components";
import { advice, feathers, type DecisionState, type Feather } from "./domain";
import type { Panel } from "./dialogs";
import { FeatherGlyph, sourceDesign } from "./identity";

export function DecisionOverview({
  state,
  selected,
  headingRef,
  onSelect,
  onOpen,
  onReassess,
}: {
  state: DecisionState;
  selected: Feather;
  headingRef: Ref<HTMLHeadingElement>;
  onSelect: (source: Feather) => void;
  onOpen: (panel: Panel) => void;
  onReassess: () => void;
}) {
  const current = advice(state.current.scenario);
  return (
    <div className="decision-overview">
      <header className="overview-heading">
        <div>
          <Eyebrow>Decision 001 · Version {state.current.number}</Eyebrow>
          <h1 ref={headingRef} tabIndex={-1}>
            Support access
          </h1>
          <p>Does the team need full administrator access?</p>
        </div>
        <Crow pose="glide" className="flying-crow" />
      </header>

      {state.pending && (
        <div className="pending-banner">
          <MessageSquare size={20} />
          <span>
            <strong>Your correction is saved.</strong>
            <small>
              Version {state.current.number} is unchanged until you reassess.
            </small>
          </span>
          <button onClick={onReassess}>
            Reassess now <ArrowRight size={15} />
          </button>
        </div>
      )}

      <div className="overview-grid">
        <section
          className="recommendation-card"
          aria-labelledby="recommendation-title"
        >
          <div className="recommendation-meta">
            <Eyebrow>Recommendation</Eyebrow>
            <Badge tone="oxide">{current.status}</Badge>
          </div>
          <h2 id="recommendation-title">{current.role}</h2>
          <p>{current.description}</p>
          <div className="recommendation-condition">
            <LockKeyhole size={16} />
            <span>{current.condition}</span>
          </div>
          <button
            className="primary-button"
            onClick={() => onOpen({ kind: "review" })}
          >
            Review recommendation <ArrowRight size={17} />
          </button>
        </section>
        <section
          className="decision-context"
          aria-labelledby="decision-context-title"
        >
          <Eyebrow>What matters</Eyebrow>
          <h2 id="decision-context-title">{current.headline}</h2>
          <p>{current.reason}</p>
          <div className="overview-links">
            <button onClick={() => onOpen({ kind: "compare" })}>
              Compare options <ArrowUpRight size={16} />
            </button>
            <button
              onClick={() =>
                onOpen({ kind: "challenge", source: "The proposed role" })
              }
            >
              Correct information <ArrowUpRight size={16} />
            </button>
          </div>
        </section>
      </div>

      <details className="sources-disclosure">
        <summary>
          <span className="source-preview" aria-hidden="true">
            {feathers.map((source) => (
              <FeatherGlyph key={source.id} kind={sourceDesign(source.id)} />
            ))}
          </span>
          <span className="disclosure-label">
            <strong>Explore the sources</strong>
            <span>6 records behind this recommendation</span>
          </span>
          <ArrowDown size={18} className="disclosure-arrow" />
        </summary>
        <div className="sources-disclosure-content">
          <EvidenceMap
            selected={selected}
            scenario={state.current.scenario}
            onSelect={onSelect}
            onInspect={(source) =>
              onOpen({ kind: "evidence", feather: source })
            }
          />
          <div className="source-reading-guide">
            <Eyebrow>Look closer</Eyebrow>
            <h2>See what each source adds.</h2>
            <p>
              Select a feather, then open its source to see the original record,
              why it matters and its limits.
            </p>
            <p className="source-boundary">
              <LockKeyhole size={16} />
              Every option must keep exports within the team’s own queue.
            </p>
            <span className="small-note">
              Synthetic example · The links illustrate the reasoning.
            </span>
          </div>
        </div>
      </details>

      <button
        className="outcomes-link"
        onClick={() => onOpen({ kind: "outcomes" })}
      >
        What happens after review? <ArrowUpRight size={15} />
      </button>
    </div>
  );
}
