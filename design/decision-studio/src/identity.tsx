import { ChevronDown } from "./pixel-icons";
import { ProviderTag, type Provider } from "./providers";
import { useId, useState } from "react";
import topology from "../../homepage-mockups/2026-09-21/assets/crowbo-feathers-topology-modular-v1.png";
import infrastructure from "../../homepage-mockups/2026-09-21/assets/crowbo-feathers-infrastructure-modular-v1.png";

export const featherDesigns = {
  spine: {
    tile: 0,
    label: "Spine",
    use: "Policies",
    meaning: "One governing boundary, applied along the work.",
  },
  branch: {
    tile: 1,
    label: "Branch",
    use: "Permissions",
    meaning: "A role branches into the actions it allows.",
  },
  mesh: {
    tile: 2,
    label: "Mesh",
    use: "Dependencies",
    meaning: "Several systems depend on one another.",
  },
  loop: {
    tile: 3,
    label: "Loop",
    use: "Control checks",
    meaning: "Observe, check and revisit a control.",
  },
  braid: {
    tile: 4,
    label: "Braid",
    use: "Conversations",
    meaning: "Different perspectives become shared context.",
  },
  cluster: {
    tile: 5,
    label: "Cluster",
    use: "People & teams",
    meaning: "People gather around a responsibility.",
  },
  object: {
    tile: 6,
    label: "Object",
    use: "Stored records",
    meaning: "A bounded record, with its own provenance.",
  },
  column: {
    tile: 7,
    label: "Column",
    use: "Capacity",
    meaning: "Compare time, resources and constraints.",
  },
  vector: {
    tile: 8,
    label: "Vector",
    use: "Related knowledge",
    meaning: "Find relevant context without assuming it is equivalent.",
  },
  merge: {
    tile: 9,
    label: "Merge",
    use: "Code changes",
    meaning: "Branches converge into a reviewable change.",
  },
  series: {
    tile: 10,
    label: "Series",
    use: "Activity",
    meaning: "Events observed over a defined period.",
  },
  shard: {
    tile: 11,
    label: "Shard",
    use: "Risk scope",
    meaning: "Keep separate scopes visible when considering risk.",
  },
};
export type FeatherDesign = keyof typeof featherDesigns;

export function sourceDesign(id: string): FeatherDesign {
  switch (id) {
    case "activity":
      return "series";
    case "directory":
      return "cluster";
    case "roles":
      return "branch";
    case "calendar":
      return "column";
    case "owner":
      return "braid";
    default:
      return "spine";
  }
}

export function FeatherGlyph({
  kind,
  className = "",
}: {
  kind: FeatherDesign;
  className?: string;
}) {
  const clip = useId();
  const tile = featherDesigns[kind].tile;
  return (
    <svg
      className={`feather-glyph ${className}`}
      viewBox="48 -8 448 496"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <path d="M0 0H512V446H180V474H0Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <image
          href={tile < 6 ? topology : infrastructure}
          x={-(tile % 3) * 512}
          y={-Math.floor((tile % 6) / 3) * 512}
          width="1536"
          height="1024"
        />
      </g>
    </svg>
  );
}

const designOrder: FeatherDesign[] = [
  "spine",
  "branch",
  "mesh",
  "loop",
  "braid",
  "cluster",
  "object",
  "column",
  "vector",
  "merge",
  "series",
  "shard",
];
const designProviders: Record<FeatherDesign, Provider> = {
  spine: "notion",
  branch: "okta",
  mesh: "github",
  loop: "datadog",
  braid: "slack",
  cluster: "calendar",
  object: "aws",
  column: "linear",
  vector: "drive",
  merge: "github",
  series: "zendesk",
  shard: "notion",
};

const sourceExamples: Record<FeatherDesign, string> = {
  spine: "Example: an access policy and the scope it applies to.",
  branch: "Example: a role definition and its effective permissions.",
  mesh: "Example: a dependency manifest and the services that use it.",
  loop: "Example: a control check, an exception and a later verification.",
  braid: "Example: a scoped conversation and the owner's clarification.",
  cluster: "Example: meeting context, participants and responsibilities.",
  object: "Example: a versioned file with collection metadata.",
  column: "Example: a delivery queue, available capacity and deadlines.",
  vector: "Example: related documents, with the original source retained.",
  merge: "Example: a pull request, review comments and a change record.",
  series: "Example: activity events from a defined observation window.",
  shard: "Example: risk records kept separate by service and scope.",
};

export function FeatherLibrary() {
  const [selected, setSelected] = useState<FeatherDesign>("spine");
  const design = featherDesigns[selected];
  return (
    <details className="feather-library">
      <summary>
        <span>
          <span className="eyebrow">The wider picture</span>
          <strong>Twelve shapes. Different kinds of context.</strong>
        </span>
        <span className="library-count">12</span>
        <ChevronDown size={18} />
      </summary>
      <div className="library-body">
        <p className="library-intro">
          Explore the source families. These are illustrative mappings, separate
          from the six records in this decision.
        </p>
        <div className="library-layout">
          <div className="library-grid" aria-label="Source families">
            {designOrder.map((kind, index) => (
              <button
                key={kind}
                className={kind === selected ? "selected" : ""}
                aria-pressed={kind === selected}
                onClick={() => setSelected(kind)}
              >
                <span className="library-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <FeatherGlyph kind={kind} />
                <strong>{featherDesigns[kind].label}</strong>
                <span>{featherDesigns[kind].use}</span>
              </button>
            ))}
          </div>
          <div className="library-detail" aria-live="polite">
            <FeatherGlyph kind={selected} />
            <span className="eyebrow">
              {design.label} / {design.use}
            </span>
            <h3>{design.meaning}</h3>
            <ProviderTag provider={designProviders[selected]} />
            <p>{sourceExamples[selected]}</p>
          </div>
        </div>
      </div>
    </details>
  );
}
