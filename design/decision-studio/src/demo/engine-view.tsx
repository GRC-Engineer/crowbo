import { useEffect, useRef, useState } from "react";
import { Mark } from "../terminal-parts";
import { X } from "../pixel-icons";
import {
  hhmm,
  names,
  sourceForRow,
  type Layout,
  type Node,
} from "./data";

// The engine's work as one figure. Time runs down the page: each scheduled
// read is a row, the facts it produced sit in that row, links run between
// rows, and every chain ends in the decision kept in memory.

export const stages = ["Pull", "Weigh", "Link", "Decide"] as const;

/** How far the run has got: rows lit, then each later stage in turn. */
export type Progress = { lit: number; stage: number; kept: boolean };

const ROW_TOP = 40;
const ROW_H = 72;
const TIME_W = 196;
const COL_W = 158;
const GAP = 24;
const NODE_H = 34;
const DEC_H = 92;
const col = (index: number) => TIME_W + index * (COL_W + GAP);
const STAGE_W = col(4) - GAP;
const middle = (row: number) => ROW_TOP + row * ROW_H + ROW_H / 2;
const box = (node: Node) => ({
  x: col(node.col),
  y: middle(node.row) - NODE_H / 2,
});

const logo: Record<string, "okta" | "linear" | "slack"> = {
  okta: "okta",
  linear: "linear",
  slack: "slack",
};

function SourceMark({ connector }: { connector: string }) {
  const provider = logo[connector];
  if (provider)
    return (
      <span className="e-mark e-mark-logo">
        <Mark provider={provider} size={14} />
      </span>
    );
  return (
    <span className="e-mark" aria-hidden="true">
      {(names[connector] ?? connector)[0]}
    </span>
  );
}

function Weight({ value }: { value: number }) {
  return (
    <span className="e-weight" role="img" aria-label={`weight ${value} of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} data-on={index < value} />
      ))}
    </span>
  );
}

export function EngineView({
  layout,
  progress,
  onClose,
}: {
  layout: Layout;
  progress: Progress;
  onClose?: () => void;
}) {
  const { decide, rows, nodes, edges, intoDecision, moveRow } = layout;
  const decTop = ROW_TOP + rows.length * ROW_H + 18;
  const stageH = decTop + DEC_H + 8;
  const lit = (row: number) => row < progress.lit;
  const weighed = progress.stage >= 1;
  const linked = progress.stage >= 2;
  const deciding = progress.stage >= 3 || progress.lit > moveRow;
  const at = (id: string) => nodes.find((node) => node.id === id)!;
  const shown = nodes.filter((node) => lit(node.row));

  // Fit the fixed-geometry stage to whatever width the pane has.
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / STAGE_W)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="e-view" aria-label="What the engine did">
      <header className="e-head">
        <span className="e-call">crowbo · decide {decide.topic}</span>
        <ol className="e-stages">
          {stages.map((name, index) => (
            <li
              key={name}
              data-state={
                index < progress.stage || progress.kept
                  ? "done"
                  : index === progress.stage
                    ? "now"
                    : "next"
              }
            >
              <span>0{index + 1}</span>
              {name}
            </li>
          ))}
        </ol>
        {onClose && (
          <button
            type="button"
            className="e-close"
            onClick={onClose}
            aria-label="Back to the chat"
          >
            <X size={14} />
          </button>
        )}
      </header>

      <div className="e-frame" ref={frame}>
        <div
          className="e-stage"
          style={{
            width: STAGE_W,
            height: stageH,
            transform: `scale(${scale})`,
            marginBottom: stageH * (scale - 1),
          }}
        >
          <span className="e-heading" style={{ left: 0 }}>
            Reads
          </span>
          <span className="e-heading" style={{ left: TIME_W }}>
            Context graph
          </span>

          {rows.map((row, index) => {
            const source = sourceForRow(decide, row.connector);
            const now = !progress.kept && index === progress.lit - 1 && progress.stage === 0;
            return (
              <div
                key={`${row.connector}-${row.at}`}
                className="e-row"
                data-lit={lit(index)}
                data-now={now}
                style={{ top: ROW_TOP + index * ROW_H, width: STAGE_W }}
              >
                <div className="e-read" style={{ width: TIME_W - 14 }}>
                  <span className="e-time">{hhmm(row.at)}</span>
                  <SourceMark connector={row.connector} />
                  <span className="e-name">{names[row.connector]}</span>
                  <span className="e-count">
                    {row.note ??
                      `${row.facts} facts${row.links ? ` · ${row.links} links` : ""}`}
                  </span>
                  {weighed && source && (
                    <span className="e-weigh" data-used={source.used ?? source.freshness === "fresh"}>
                      {source.weight !== undefined && <Weight value={source.weight} />}
                      {[
                        source.coverage === "partial" && "partial",
                        source.freshness === "stale" && "stale",
                        (source.used ?? source.freshness === "fresh") ? "used" : "not used",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <svg className="e-lines" width={STAGE_W} height={stageH} aria-hidden="true">
            {linked &&
              edges
                .filter((edge) => lit(at(edge.from).row) && lit(at(edge.to).row))
                .map((edge) => {
                  const from = box(at(edge.from));
                  const to = box(at(edge.to));
                  if (at(edge.from).row === at(edge.to).row) {
                    const y = from.y + NODE_H / 2;
                    return (
                      <g key={edge.from + edge.to}>
                        <line className="e-link" x1={from.x + COL_W} y1={y} x2={to.x} y2={y} />
                        {edge.rel && (
                          <text x={(from.x + COL_W + to.x) / 2} y={from.y + NODE_H + 13} textAnchor="middle">
                            {edge.rel}
                          </text>
                        )}
                      </g>
                    );
                  }
                  const x = from.x + 24;
                  return (
                    <g key={edge.from + edge.to}>
                      <line className="e-link" x1={x} y1={from.y + NODE_H} x2={x} y2={to.y} />
                      {edge.rel && (
                        <text x={x + 8} y={(from.y + NODE_H + to.y) / 2 + 4}>
                          {edge.rel}
                        </text>
                      )}
                    </g>
                  );
                })}
            {deciding &&
              intoDecision
                .map(at)
                .filter((node) => lit(node.row))
                .map((node) => {
                  const from = box(node);
                  const x = from.x + COL_W - 24;
                  return (
                    <g key={node.id} className="e-into" data-kept={progress.kept}>
                      <line x1={x} y1={from.y + NODE_H} x2={x} y2={decTop} />
                      <rect x={x - 3} y={decTop - 6} width={6} height={6} />
                    </g>
                  );
                })}
          </svg>

          {shown.map((node) => {
            const { x, y } = box(node);
            return (
              <div
                key={node.id}
                className="e-node"
                data-stale={node.stale ?? false}
                style={{ left: x, top: y, width: COL_W, height: NODE_H }}
              >
                <span>{node.text}</span>
                {node.sub && <span className="e-node-sub">{node.sub}</span>}
                {node.cites.length > 0 && (
                  <span className="e-node-cite">{node.cites.map((n) => `[${n}]`).join("")}</span>
                )}
              </div>
            );
          })}

          <div className="e-memory-label" style={{ top: decTop, width: TIME_W - 16, height: DEC_H }} data-on={deciding}>
            <span>Decision memory</span>
            {progress.kept && (
              <span className="e-count">
                {decide.sources.length} sources · {decide.lookup_ms} ms
              </span>
            )}
          </div>
          {deciding && (
            <div
              className="e-decision"
              data-kept={progress.kept}
              style={{ left: TIME_W, top: decTop, width: STAGE_W - TIME_W, height: DEC_H }}
            >
              <span className="e-decision-meta">
                <span>{progress.kept ? `decision ${decide.decision_id.slice(0, 8)}` : decide.topic}</span>
                <span>{progress.kept ? "kept" : "deciding"}</span>
              </span>
              <span className="e-decision-title">{decide.answer.move.title}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
