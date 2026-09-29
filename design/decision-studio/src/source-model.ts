import type { FeatherDesign } from "./identity";
import type { Provider } from "./providers";

export type Influence = "deciding" | "supporting" | "context" | "constraint";
export type SourceLink = {
  label: string;
  identity: string;
  targetId: string | null;
};
export type DemoSource = {
  id: string;
  label: string;
  provider: Provider;
  feather: FeatherDesign;
  influence: Influence;
  claim: string;
  quote: string;
  why: string;
  limit: string;
  period: string;
  revision: string;
  record: {
    subject: string;
    scope: string;
    checked: string;
    origin: string;
    links: SourceLink[];
  };
};
export type Recommendation = {
  title: string;
  reason: string;
  condition: string;
  next: string;
  support: string;
};
export type DemoCase = {
  label: string;
  question: string;
  scope: string;
  sources: DemoSource[];
  baseline: Recommendation;
  alternatives: { title: string; tradeoff: string }[];
  challenge: { title: string; body: string; check: string; sourceId: string };
};
export function resolveSourceLink(link: SourceLink, sources: DemoSource[]) {
  return link.targetId === null
    ? undefined
    : sources.find((source) => source.id === link.targetId);
}
