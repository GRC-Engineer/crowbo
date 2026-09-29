import { useId } from "react";
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
