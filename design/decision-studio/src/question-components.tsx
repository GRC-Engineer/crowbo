import { useId, useState, type CSSProperties, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Check, ChevronDown, LockKeyhole, X } from "./pixel-icons";
import { Crow } from "./components";
import { FeatherGlyph } from "./identity";
import { ProviderMark, providers } from "./providers";
import type { DemoSource } from "./question-demo-model";

const positions = [
  { x: 17, y: 24 },
  { x: 49, y: 18 },
  { x: 82, y: 24 },
  { x: 17, y: 77 },
  { x: 49, y: 84 },
  { x: 82, y: 77 },
];
const influenceLabel = {
  deciding: "Deciding",
  supporting: "Supporting",
  context: "Context",
  constraint: "Must hold",
};

function sourcePosition(
  index: number,
): CSSProperties &
  Record<"--node-x" | "--node-y" | "--small-x" | "--small-y", string> {
  return {
    "--node-x": `${positions[index].x}%`,
    "--node-y": `${positions[index].y}%`,
    "--small-x": `${index % 2 === 0 ? 22 : 78}%`,
    "--small-y": `${17 + Math.floor(index / 2) * 33}%`,
  };
}

export function SourceNetwork({
  sources,
  step = 4,
  moving = false,
  onInspect,
}: {
  sources: DemoSource[];
  step?: number;
  moving?: boolean;
  onInspect: (source: DemoSource, trigger: HTMLButtonElement) => void;
}) {
  const visibleCount = step < 2 ? (step + 1) * 2 : sources.length;
  return (
    <div className="ask-network-wrap">
      <div
        className="ask-network-scroll"
        tabIndex={0}
        role="region"
        aria-label="Source network"
      >
        <div className="ask-network" data-moving={moving}>
          <svg
            viewBox="0 0 880 420"
            preserveAspectRatio="none"
            className="ask-wires ask-wires-wide"
            aria-hidden="true"
          >
            {sources.map((source, index) => {
              const { x, y } = positions[index];
              const d = `M ${x * 8.8} ${y * 4.2} V ${y < 50 ? 173 : 250} H 431 V 214`;
              return (
                <g
                  key={source.id}
                  className={index < visibleCount ? "active" : ""}
                >
                  <path d={d} />
                  {moving &&
                    index >= visibleCount - 2 &&
                    index < visibleCount && (
                      <path d={d} pathLength="100" className="ask-packet" />
                    )}
                </g>
              );
            })}
          </svg>
          <svg
            viewBox="0 0 360 500"
            preserveAspectRatio="none"
            className="ask-wires ask-wires-compact"
            aria-hidden="true"
          >
            {sources.map((record, index) => {
              const d = `M ${index % 2 === 0 ? 79.2 : 280.8} ${(17 + Math.floor(index / 2) * 33) * 5} H 180 V 250`;
              return (
                <g
                  key={record.id}
                  className={index < visibleCount ? "active" : ""}
                >
                  <path d={d} />
                  {moving &&
                    index >= visibleCount - 2 &&
                    index < visibleCount && (
                      <path d={d} pathLength="100" className="ask-packet" />
                    )}
                </g>
              );
            })}
          </svg>
          <div className="ask-network-centre" aria-hidden="true">
            <Crow pose="glide" />
            <span>context → choice</span>
          </div>
          {sources.map((source, index) => (
            <button
              key={source.id}
              className={`ask-source-node ${source.influence} ${index < visibleCount ? "active" : "waiting"} ${step >= 2 ? "weighted" : ""}`}
              style={sourcePosition(index)}
              onClick={(event) => onInspect(source, event.currentTarget)}
              disabled={index >= visibleCount}
              aria-label={`Inspect ${source.label}: ${influenceLabel[source.influence]}`}
            >
              <span className="ask-node-meta">
                <span>0{index + 1}</span>
                <ProviderMark provider={source.provider} />
              </span>
              <FeatherGlyph kind={source.feather} />
              <strong>{source.label}</strong>
              <span className="ask-node-influence">
                {source.influence === "constraint" && <LockKeyhole size={10} />}
                {influenceLabel[source.influence]}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="ask-network-key">
        <span>
          <i />
          <i />
          <i />
          Size = influence on this choice
        </span>
        <span>
          <LockKeyhole size={11} />
          Constraints must hold
        </span>
      </div>
    </div>
  );
}

export function SourceInspector({
  source,
  scope,
  onClose,
  returnFocus,
  override,
}: {
  source: DemoSource;
  scope: string;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  override?: string;
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
          className="dialog-content ask-inspector"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <div className="ask-dialog-top">
            <span className="ask-small">Synthetic source</span>
            <Dialog.Close className="ask-icon" aria-label="Close source">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="ask-source-heading">
            <FeatherGlyph kind={source.feather} />
            <div>
              <span className="ask-provider">
                <ProviderMark provider={source.provider} />
                {providers[source.provider].name} example
              </span>
              <Dialog.Title>{source.label}</Dialog.Title>
            </div>
          </div>
          <Dialog.Description className="ask-source-description">
            {scope}
          </Dialog.Description>
          {override && (
            <p className="ask-network-note">
              Prepared what-if: {override}. The original record is retained
              below.
            </p>
          )}
          <blockquote>{source.quote}</blockquote>
          <section>
            <h3>{influenceLabel[source.influence]} input</h3>
            <p>{source.why}</p>
          </section>
          <section className="ask-source-limit">
            <h3>What this cannot tell us</h3>
            <p>{source.limit}</p>
          </section>
          <dl className="ask-source-version">
            <div>
              <dt>Period</dt>
              <dd>{source.period}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{source.revision}</dd>
            </div>
          </dl>
          <p className="ask-fine">
            Prepared example record. No tool is connected.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ContextNote({
  note,
  onSave,
}: {
  note: string;
  onSave: (value: string) => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState(note);
  const [saved, setSaved] = useState(false);
  return (
    <details className="ask-note">
      <summary>
        Add your context <ChevronDown size={15} />
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
          setSaved(true);
        }}
      >
        <label htmlFor={fieldId}>What else should a reviewer know?</label>
        <textarea
          id={fieldId}
          value={draft}
          maxLength={800}
          rows={3}
          onChange={(event) => {
            setDraft(event.target.value);
            setSaved(false);
          }}
          placeholder="For example, a workflow that happens only once a year…"
        />
        <p className="ask-fine">
          An unverified note from you. Saved in this tab; this walkthrough does
          not interpret it.
        </p>
        <button className="ask-text-button" type="submit">
          Save context <ArrowRight size={15} />
        </button>
        <div role="status">
          {saved && (
            <p className="ask-saved-note">
              <Check size={14} />
              Context saved. The recommendation has not changed.
            </p>
          )}
        </div>
        {note && <blockquote className="ask-operator-note">{note}</blockquote>}
      </form>
    </details>
  );
}
