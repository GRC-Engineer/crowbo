import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import modular from "../../crow-concepts/2026-09-24/approved-runtime/modular-crow.png";
import glide from "../../crow-concepts/2026-09-24/approved-runtime/runner-glide.png";
import up from "../../crow-concepts/2026-09-24/approved-runtime/runner-up.png";
import down from "../../crow-concepts/2026-09-24/approved-runtime/runner-down.png";
import { FeatherGlyph, type FeatherDesign } from "./identity";
import { providers, type Provider } from "./providers";
import {
  conditions,
  freshness,
  influenceLabel,
  influenceSquares,
} from "./present";
import type { DemoSource, Recommendation } from "./source-model";

// ───────────────────────── artwork

export const artwork = { modular, glide, up, down };

export function ModularCrow({ size = 300 }: { size?: number }) {
  return (
    <img
      className="t-crow"
      src={modular}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

// The approved glide and down poses face left; the up pose faces right.
// A runner that travels right is mirrored so it faces the way it moves.
const poses = {
  glide: { src: glide, faces: "left" },
  down: { src: down, faces: "left" },
  up: { src: up, faces: "right" },
} as const;

export function Runner({
  pose = "glide",
  width = 140,
  heading = "right",
  bob = false,
}: {
  pose?: keyof typeof poses;
  width?: number;
  heading?: "left" | "right";
  bob?: boolean;
}) {
  return (
    <img
      className={`t-runner${bob ? " t-bob" : ""}`}
      data-flip={poses[pose].faces !== heading}
      src={poses[pose].src}
      width={width}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

// A small runner that beats its wings between two poses while it travels.
export function MiniRunner({ width = 64 }: { width?: number }) {
  return (
    <span
      className="t-mini"
      style={{ width, height: Math.round(width / 2) }}
      aria-hidden="true"
    >
      <img src={glide} width={width} alt="" draggable={false} />
      <img src={down} width={width} alt="" draggable={false} />
    </span>
  );
}

export function Mark({
  provider,
  size = 16,
}: {
  provider: Provider;
  size?: number;
}) {
  return (
    <img
      className="t-mark"
      src={providers[provider].logo}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

export function MarkChip({ provider }: { provider: Provider }) {
  return (
    <span className="t-mark-chip" title={providers[provider].name}>
      <Mark provider={provider} size={17} />
      <span className="sr-only">{providers[provider].name}</span>
    </span>
  );
}

// A feather with the mark of the tool its record came from set in the corner.
export function SourceFeather({
  feather,
  provider,
  size = 40,
}: {
  feather: FeatherDesign;
  provider?: Provider;
  size?: 28 | 40 | 56 | 72;
}) {
  return (
    <span className="t-feather" data-size={size} aria-hidden="true">
      <FeatherGlyph kind={feather} />
      {provider && (
        <span className="t-feather-mark">
          <Mark
            provider={provider}
            size={size >= 56 ? 16 : size >= 40 ? 12 : 9}
          />
        </span>
      )}
    </span>
  );
}

// ───────────────────────── small parts

export function Key({ children }: { children: ReactNode }) {
  return <kbd className="t-key">{children}</kbd>;
}

export function Tag({
  children,
  tone = "sage",
}: {
  children: ReactNode;
  tone?: "sage" | "oxide" | "chalk" | "quiet";
}) {
  return (
    <span className="t-tag" data-tone={tone}>
      {children}
    </span>
  );
}

export function Label({
  children,
  tone = "sage",
}: {
  children: ReactNode;
  tone?: "sage" | "oxide" | "chalk" | "quiet";
}) {
  return (
    <span className="t-label" data-tone={tone}>
      {children}
    </span>
  );
}

export function Squares({
  filled,
  of,
  tone = "sage",
  label,
}: {
  filled: number;
  of: number;
  tone?: "sage" | "oxide";
  label: string;
}) {
  return (
    <span className="t-squares" data-tone={tone} role="img" aria-label={label}>
      {Array.from({ length: of }, (_, index) => (
        <i key={index} data-on={index < filled} />
      ))}
    </span>
  );
}

export function Influence({ source }: { source: DemoSource }) {
  if (source.influence === "constraint")
    return <Tag tone="chalk">{influenceLabel.constraint}</Tag>;
  const filled = influenceSquares[source.influence];
  return (
    <span className="t-influence">
      <Squares
        filled={filled}
        of={5}
        tone={source.influence === "deciding" ? "oxide" : "sage"}
        label={`Influence ${filled} of 5`}
      />
      <span>{influenceLabel[source.influence]}</span>
    </span>
  );
}

export function Freshness({ source }: { source: DemoSource }) {
  const { squares, label } = freshness(source);
  return (
    <span className="t-fresh">
      <Squares filled={squares} of={7} label={`Freshness ${squares} of 7`} />
      <span>{label}</span>
    </span>
  );
}

export function Track({
  steps,
  vertical = false,
}: {
  steps: { label: string; done: boolean }[];
  vertical?: boolean;
}) {
  return (
    <ol className="t-track" data-vertical={vertical}>
      {steps.map((step) => (
        <li key={step.label} data-done={step.done}>
          <i aria-hidden="true" />
          <span>{step.label}</span>
          <span className="sr-only">{step.done ? "done" : "to do"}</span>
        </li>
      ))}
    </ol>
  );
}

// ───────────────────────── the window and the decision record

export function Window({
  title,
  meta,
  accent = false,
  className = "",
  children,
  status,
}: {
  title: string;
  meta?: ReactNode;
  accent?: boolean;
  className?: string;
  children: ReactNode;
  status?: ReactNode;
}) {
  return (
    <section className={`t-window ${className}`} data-accent={accent}>
      <div className="t-winbar" aria-hidden="true">
        <span>
          <i />
          <i />
          <i />
          {title}
        </span>
        {meta && <span>{meta}</span>}
      </div>
      {children}
      {status && <div className="t-status">{status}</div>}
    </section>
  );
}

export function StatusItem({
  tone = "sage",
  children,
}: {
  tone?: "sage" | "oxide" | "quiet";
  children: ReactNode;
}) {
  return (
    <span data-tone={tone}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function DecisionRecord({
  title,
  meta,
  advice,
  headingRef,
  action,
  status,
  lite = false,
}: {
  title: string;
  meta: string;
  advice: Recommendation;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  action?: ReactNode;
  status?: ReactNode;
  lite?: boolean;
}) {
  const checks = conditions(advice.condition);
  return (
    <Window
      title={title}
      meta={meta}
      accent
      className="t-record"
      status={status}
    >
      <div className="t-record-body" data-lite={lite}>
        <p className="t-record-kicker">
          <span aria-hidden="true">›</span> Recommended next move
        </p>
        <h2 ref={headingRef} tabIndex={-1}>
          {advice.title.replace(/\.$/, "")}
        </h2>
        <p className="t-record-why">{advice.reason}</p>
        {!lite && (
          <>
            <div className="t-checks">
              <div className="t-checks-head">
                <Label tone="chalk">Must hold before any change</Label>
                <span>0 of {checks.length} met</span>
              </div>
              <ul>
                {checks.map((check) => (
                  <li key={check}>
                    <span aria-hidden="true">[ ]</span>
                    {check}
                  </li>
                ))}
              </ul>
            </div>
            <div className="t-record-next">
              <Label tone="quiet">Next</Label>
              <p>{advice.next.replace(/\.$/, "")}</p>
            </div>
            {action}
          </>
        )}
      </div>
    </Window>
  );
}

// ───────────────────────── the shell: top bar, content, command line

export type Command = {
  keys: string[];
  show: string;
  label: string;
  run: (key: string) => void;
  disabled?: boolean;
};

export type Area = "flow" | "queue" | "sources" | "history" | "outside";

const areas: { id: Area; label: string }[] = [
  { id: "queue", label: "Decisions" },
  { id: "sources", label: "Sources" },
  { id: "history", label: "History" },
  { id: "outside", label: "CLI" },
];

// True where there is a keyboard and a mouse. There, focus stays on the
// command line so single keys keep working; on touch it goes to headings.
export const finePointer = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function Shell({
  crumb,
  area,
  onArea,
  onHome,
  screen,
  view = "",
  headingRef,
  children,
  placeholder,
  commands,
  onSubmit,
  value,
  onValue,
  error,
  flush = false,
}: {
  crumb: string[];
  area: Area;
  onArea: (area: Area) => void;
  onHome: () => void;
  screen: string;
  view?: string;
  headingRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  placeholder: string;
  commands: Command[];
  onSubmit?: (text: string) => void;
  value?: string;
  onValue?: (text: string) => void;
  error?: string | null;
  flush?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const lineId = useId();
  const errorId = useId();
  const text = value ?? "";

  // A new screen takes focus: the command line where there is a keyboard,
  // the heading on touch devices so no on-screen keyboard opens.
  useEffect(() => {
    if (finePointer()) input.current?.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, headingRef]);

  // A pane that opens or closes inside a screen hands focus back to the line.
  useEffect(() => {
    if (finePointer()) input.current?.focus({ preventScroll: true });
  }, [view]);

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (text !== "") {
      if (event.key === "Enter" && onSubmit) {
        event.preventDefault();
        onSubmit(text);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onValue?.("");
      }
      return;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const command = commands.find(
      (entry) => !entry.disabled && entry.keys.includes(key),
    );
    if (!command) return;
    event.preventDefault();
    command.run(key);
  }

  return (
    <div className="t-app">
      <a className="t-skip" href="#t-main">
        Skip to content
      </a>
      <header className="t-top">
        <div className="t-top-left">
          <a href="../" className="t-wordmark" aria-label="Crowbo home">
            crowbo
          </a>
          <nav className="t-crumb" aria-label="Breadcrumb">
            <ol>
              {crumb.map((part, index) => (
                <li
                  key={`${part}-${index}`}
                  aria-current={index === crumb.length - 1 ? "page" : undefined}
                >
                  {index === 0 ? (
                    <button type="button" onClick={onHome}>
                      {part}
                    </button>
                  ) : (
                    part
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <nav className="t-areas" aria-label="Workspace">
          {areas.map((entry) => (
            <button
              type="button"
              key={entry.id}
              aria-current={area === entry.id ? "page" : undefined}
              onClick={() => onArea(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
      </header>
      <main id="t-main" className="t-main" data-flush={flush}>
        {children}
      </main>
      <footer className="t-line">
        <label className="t-line-field" htmlFor={lineId}>
          <span aria-hidden="true">›</span>
          <span className="sr-only">Command line</span>
          <input
            ref={input}
            id={lineId}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={500}
            value={text}
            readOnly={!onSubmit}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onValue?.(event.target.value)}
            onKeyDown={keyDown}
          />
        </label>
        <div className="t-hints">
          {commands.map((command) => (
            <button
              type="button"
              key={command.show}
              disabled={command.disabled}
              onClick={() => command.run(command.keys[0])}
            >
              <Key>{command.show}</Key>
              {command.label}
            </button>
          ))}
        </div>
        {error && (
          <p className="t-line-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </footer>
    </div>
  );
}
