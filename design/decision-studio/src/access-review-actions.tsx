import type { RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  GitCompareArrows,
  X,
} from "./pixel-icons";
import { ProviderMark } from "./providers";
import type { DemoSource } from "./question-demo-model";
import {
  accessAdvice,
  accessOptions,
  basisLabels,
  pendingSource,
  type AccessBasis,
  type AccessVersion,
  type PendingContext,
} from "./access-review-model";

export function PendingContextCard({
  context,
  version,
  headingRef,
  onInspect,
  onReassess,
  onDiscard,
}: {
  context: PendingContext;
  version: number;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onInspect: (source: DemoSource, trigger: HTMLButtonElement) => void;
  onReassess: () => void;
  onDiscard: () => void;
}) {
  const source = pendingSource(context);
  const explanation =
    context.kind === "check"
      ? source.why
      : context.kind === "annual-task"
        ? "Ninety quiet days missed work that happens once a year. The owner's new statement challenges the original view."
        : context.status === "tested"
          ? "The fictional record includes successful recovery, timed expiry and denied cross-queue exports. The daily role and rollout approval still need checking."
          : context.status === "unverified"
            ? "This alternative contains a runbook, with no successful test or expiry record. It cannot establish that temporary access works."
            : "This alternative says the required temporary-access mechanism is unavailable. We need a different supported path.";
  return (
    <div className="access-pending">
      <div className="access-section-label">
        <span className="ask-small">New context · not yet applied</span>
        <span>Advice v{version} retained</span>
      </div>
      <h3 ref={headingRef} tabIndex={-1}>
        {source.claim}
      </h3>
      <p>{explanation}</p>
      <button
        className="ask-text-button"
        onClick={(event) => onInspect(source, event.currentTarget)}
      >
        <ProviderMark provider={source.provider} /> Inspect{" "}
        {source.label.toLowerCase()} <ArrowUpRight size={14} />
      </button>
      <div className="access-pending-actions">
        <button className="ask-primary" onClick={onReassess}>
          Reassess with this context <ArrowRight size={16} />
        </button>
        <button className="access-secondary" onClick={onDiscard}>
          Keep current advice
        </button>
      </div>
    </div>
  );
}

export function CompareOptions({ basis }: { basis: AccessBasis }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="access-secondary">
        <GitCompareArrows size={16} /> Compare options
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content access-comparison">
          <div className="ask-dialog-top">
            <span className="ask-small">Same work. Different tradeoffs.</span>
            <Dialog.Close className="ask-icon" aria-label="Close comparison">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Title>What changes with each option?</Dialog.Title>
          <Dialog.Description>
            Based on {basisLabels[basis].toLowerCase()}. Every option still
            needs an accountable decision.
          </Dialog.Description>
          <div className="access-options">
            {accessOptions(basis).map((option, index) => (
              <section key={option.name} data-proposed={option.proposed}>
                <span className="access-option-number">0{index + 1}</span>
                <div>
                  <h3>{option.name}</h3>
                  {option.proposed && (
                    <span className="access-proposed">
                      Proposed, subject to checks
                    </span>
                  )}
                  <p>{option.result}</p>
                  <small>{option.gap}</small>
                </div>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function NextStep({
  version,
  recorded,
  onRecord,
}: {
  version: AccessVersion;
  recorded: boolean;
  onRecord: () => void;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="ask-primary ask-answer-action">
        Review next action <ArrowRight size={16} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content ask-choice-dialog">
          <div className="ask-dialog-top">
            <span className="ask-small">
              Simulation · Advice {version.number}
            </span>
            <Dialog.Close className="ask-icon" aria-label="Close next action">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Title>Your next step</Dialog.Title>
          <Dialog.Description>
            Record a proposed next step for this version. This does not approve
            access, contact anyone or create work.
          </Dialog.Description>
          <p className="ask-chosen-step">{accessAdvice[version.basis].next}</p>
          <button
            className="ask-primary"
            aria-disabled={recorded}
            onClick={() => {
              if (!recorded) onRecord();
            }}
          >
            {recorded ? (
              <>
                <Check size={16} /> Recorded for this version
              </>
            ) : (
              <>
                Record simulated next step <ArrowRight size={16} />
              </>
            )}
          </button>
          <div role="status">
            {recorded && (
              <p className="ask-fine">
                Saved in this tab. The conditions in the advice still apply.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
