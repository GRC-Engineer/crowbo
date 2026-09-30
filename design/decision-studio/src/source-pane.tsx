import { useEffect, useRef, useState } from "react";
import { checkedOn, tidy } from "./present";
import { providers } from "./providers";
import { resolveSourceLink, type DemoSource } from "./source-model";
import { Influence, Label, SourceFeather, finePointer } from "./terminal-parts";

// A source opens beside the decision, never on top of it. Following a
// connected record keeps a trail, so the way back is one step.
export function SourcePane({
  source: first,
  sources,
  context,
  onClose,
}: {
  source: DemoSource;
  sources: DemoSource[];
  context: string;
  onClose: () => void;
}) {
  const [trail, setTrail] = useState<DemoSource[]>([first]);
  const title = useRef<HTMLHeadingElement>(null);
  const source = trail[trail.length - 1] ?? first;
  useEffect(() => setTrail([first]), [first]);
  useEffect(() => {
    if (!finePointer()) title.current?.focus({ preventScroll: true });
  }, [source]);
  const position = sources.findIndex((record) => record.id === source.id);
  const links = source.record.links.flatMap((link) => {
    const target = resolveSourceLink(link, sources);
    return target ? [{ link, target }] : [];
  });
  const facts = [
    ["Checked", checkedOn(source)],
    ["Period", tidy(source.period)],
    ["Revision", tidy(source.revision)],
    ["Subject", source.record.subject],
    ["Scope", source.record.scope],
    ["Origin", source.record.origin],
  ];
  return (
    <aside className="t-pane t-source" aria-label={`Source: ${source.label}`}>
      <div className="t-pane-head">
        <Label>
          {position >= 0
            ? `Source ${position + 1} of ${sources.length}`
            : "Source"}{" "}
          · {context}
        </Label>
        <button type="button" className="t-close" onClick={onClose}>
          Close{" "}
        </button>
      </div>
      {trail.length > 1 && (
        <button
          type="button"
          className="t-link"
          onClick={() => setTrail(trail.slice(0, -1))}
        >
          ← Back to {trail[trail.length - 2]?.label}
        </button>
      )}
      <div className="t-source-title">
        <SourceFeather
          feather={source.feather}
          provider={source.provider}
          size={72}
        />
        <div>
          <h2 ref={title} tabIndex={-1}>
            {source.label}
          </h2>
          <p>
            {providers[source.provider].name} · {source.record.subject}
          </p>
        </div>
        <Influence source={source} />
      </div>
      <blockquote>“{tidy(source.quote)}”</blockquote>
      <div className="t-source-why">
        <Label>Why it matters</Label>
        <p>{tidy(source.why)}</p>
      </div>
      <dl className="t-facts">
        {facts.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {links.length > 0 && (
        <div className="t-joins">
          <div className="t-panel-head">
            <Label>Connected records</Label>
            <span>joined on the identity shown</span>
          </div>
          <ul>
            {links.map(({ link, target }) => (
              <li key={`${link.label}-${link.identity}`}>
                <button
                  type="button"
                  onClick={() => setTrail([...trail, target])}
                >
                  <i aria-hidden="true" />
                  <span>
                    <strong>{link.label}</strong>
                    <small>{link.identity}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
