import { ProviderMark, ProviderTag, sourceProvider } from "./providers";
import type { ReactNode } from "react";
import { FeatherGlyph, sourceDesign } from "./identity";
import { ArrowUpRight, Fingerprint, Check, Minus } from "./pixel-icons";
import modular from "../../crow-concepts/2026-09-24/approved-runtime/modular-crow.png";
import glide from "../../crow-concepts/2026-09-24/approved-runtime/runner-glide.png";
import up from "../../crow-concepts/2026-09-24/approved-runtime/runner-up.png";
import down from "../../crow-concepts/2026-09-24/approved-runtime/runner-down.png";
import { capabilities, feathers, type Feather, type Scenario } from "./domain";

const artwork = { modular, glide, up, down };
export function Crow({
  pose = "modular",
  className = "",
}: {
  pose?: keyof typeof artwork;
  className?: string;
}) {
  return (
    <img
      className={`crow crow-${pose} ${className}`}
      src={artwork[pose]}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`eyebrow ${className}`}>{children}</span>;
}

export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

const points = [
  { x: 18, y: 18 },
  { x: 50, y: 18 },
  { x: 82, y: 18 },
  { x: 18, y: 82 },
  { x: 50, y: 82 },
  { x: 82, y: 82 },
];

export function EvidenceMap({
  selected,
  scenario,
  onSelect,
  onInspect,
}: {
  selected: Feather;
  scenario: Scenario;
  onSelect: (feather: Feather) => void;
  onInspect: (feather: Feather) => void;
}) {
  const isOverlaid = (feather: Feather) =>
    (feather.id === "roles" && scenario === "roles-unavailable") ||
    (feather.id === "owner" && scenario === "owner-unconfirmed");
  return (
    <section className="observatory" aria-labelledby="map-title">
      <div className="instrument-header">
        <div>
          <Eyebrow>01 / Sources</Eyebrow>
          <h2 id="map-title">The context behind the choice.</h2>
        </div>
        <span className="instrument-count">
          06<small>SOURCES</small>
        </span>
      </div>
      <div className="feather-network">
        <svg
          viewBox="0 0 500 360"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="network-wires"
        >
          {feathers.map((feather, index) => {
            const point = points[index];
            const start = point.y < 50 ? 116 : 244;
            const junction = point.y < 50 ? 154 : 206;
            const path = `M${point.x * 5} ${start} V${junction} H250 V180`;
            return (
              <g
                key={feather.id}
                className={selected.id === feather.id ? "wire-active" : ""}
              >
                <path d={path} className="network-wire" />
                <path d={path} pathLength="100" className="network-packet" />
                <rect
                  x={point.x * 5 - 2.5}
                  y={start - 2.5}
                  width="5"
                  height="5"
                  className="wire-terminal"
                />
              </g>
            );
          })}
        </svg>
        <div className="network-crow">
          <Crow />
          <span>context → choices</span>
        </div>
        {feathers.map((feather, index) => (
          <button
            key={feather.id}
            className={`topology-node ${selected.id === feather.id ? "selected" : ""} ${feather.kind === "constraint" ? "constraint" : ""}`}
            style={{ left: `${points[index].x}%`, top: `${points[index].y}%` }}
            onClick={() => onSelect(feather)}
            aria-pressed={selected.id === feather.id}
            aria-label={`Select ${feather.source}`}
          >
            <span className="node-address">0{index + 1}</span>
            <FeatherGlyph kind={sourceDesign(feather.id)} />
            <span className="topology-node-label">{feather.source}</span>
            <span className="node-code" aria-hidden="true">
              {index.toString(2).padStart(4, "0")}
            </span>
            {isOverlaid(feather) && (
              <span
                className="node-changed"
                aria-label="Challenged by scenario"
              />
            )}
          </button>
        ))}
      </div>
      <button className="selected-feather" onClick={() => onInspect(selected)}>
        <span className="selected-feather-symbol">
          <FeatherGlyph kind={sourceDesign(selected.id)} />
          <span className="selected-provider">
            <ProviderMark provider={sourceProvider(selected.id)} />
          </span>
        </span>
        <span>
          <Eyebrow>{selected.source}</Eyebrow>
          <strong>{selected.title}</strong>
          <span className="feather-metadata">
            {isOverlaid(selected)
              ? "Original · scenario changed"
              : selected.status}{" "}
            · Inspect source
          </span>
        </span>
        <ArrowUpRight size={18} />
      </button>
      <div className="instrument-footer">
        <span className="status-dot" />5 inputs + 1 policy boundary
        <span>Illustrative paths</span>
      </div>
    </section>
  );
}

export function PermissionTable({ scenario }: { scenario: Scenario }) {
  if (scenario !== "baseline")
    return (
      <div className="unresolved-role">
        <Fingerprint size={32} />
        <h3>
          {scenario === "roles-unavailable"
            ? "The replacement needs work."
            : "One deciding fact is missing."}
        </h3>
        <p>
          {scenario === "roles-unavailable"
            ? "Find a supported role that keeps necessary work within the policy boundary."
            : "Confirm whether scoped exports belong in the proposed role."}
        </p>
        <span>Earlier permissions remain in History.</span>
      </div>
    );
  return (
    <div
      className="permission-table"
      role="table"
      aria-label="Proposed permission changes"
    >
      <div className="permission-header" role="row">
        <span role="columnheader">Capability</span>
        <span role="columnheader">Admin</span>
        <span role="columnheader">Proposed</span>
      </div>
      {capabilities.map((capability) => (
        <div className="permission-row" role="row" key={capability.name}>
          <span role="rowheader">
            <strong>{capability.name}</strong>
            <small>{capability.detail}</small>
          </span>
          <span role="cell">
            <Check size={14} />
            <span className="sr-only">Included</span>
          </span>
          <span
            role="cell"
            className={
              capability.keep ? "permission-keep" : "permission-remove"
            }
          >
            {capability.keep ? <Check size={13} /> : <Minus size={13} />}{" "}
            {capability.keep ? "Keep" : "Remove"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FeatherRow({
  feather,
  onClick,
  overlay = false,
}: {
  feather: Feather;
  onClick: () => void;
  overlay?: boolean;
}) {
  return (
    <button className="feather-row" onClick={onClick}>
      <span
        className={`source-stamp ${feather.kind === "constraint" ? "oxide" : ""}`}
      >
        <FeatherGlyph kind={sourceDesign(feather.id)} />
      </span>
      <span className="feather-row-title">
        <Eyebrow>{feather.source}</Eyebrow>
        <strong>{feather.title}</strong>
        {overlay && (
          <span className="source-overlay-note">
            Original source · scenario changed
          </span>
        )}
      </span>
      <span className="feather-row-end">
        <Badge tone={feather.kind === "constraint" ? "oxide" : ""}>
          {feather.status}
        </Badge>
        <ProviderTag provider={sourceProvider(feather.id)} />
      </span>
      <ArrowUpRight size={18} />
    </button>
  );
}
