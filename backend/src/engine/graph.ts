import type { Edge, Fact } from "./model";

/**
 * Layer 03, the context graph: people, teams, launches, controls, systems and evidence, linked.
 * Built from relation facts only, so every edge traces back to quoted source revisions. In the
 * real backend this is an edges table in the tenant's SQLite Durable Object, not a graph database.
 */

export const RELATIONS = new Set(["owned_by", "member_of", "leads", "governed_by", "depends_on"]);

export class ContextGraph {
  private edges = new Map<string, Edge>();

  constructor(facts: Fact[]) {
    for (const f of facts) {
      if (!RELATIONS.has(f.predicate) || typeof f.value !== "string") continue;
      const key = `${f.subject}|${f.predicate}|${f.value}`;
      const contributor = `${f.source.record}@${f.source.revision}`;
      const edge = this.edges.get(key) ?? { from: f.subject, rel: f.predicate, to: f.value, contributors: [] };
      if (!edge.contributors.includes(contributor)) edge.contributors.push(contributor);
      this.edges.set(key, edge);
    }
  }

  all(): Edge[] {
    return [...this.edges.values()];
  }

  /** The first node reached from `from` along `rel`. */
  follow(from: string, rel: string): string | null {
    return this.all().find((e) => e.from === from && e.rel === rel)?.to ?? null;
  }

  /** Nodes with an edge `rel` pointing at `to`. */
  into(to: string, rel: string): string[] {
    return this.all().filter((e) => e.to === to && e.rel === rel).map((e) => e.from);
  }

  /** Every edge within `depth` hops of a node, in either direction. */
  around(node: string, depth = 2): Edge[] {
    const seen = new Set([node]);
    const found = new Set<Edge>();
    let frontier = [node];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const e of this.all()) {
        for (const n of frontier) {
          if (e.from !== n && e.to !== n) continue;
          found.add(e);
          const other = e.from === n ? e.to : e.from;
          if (!seen.has(other)) (seen.add(other), next.push(other));
        }
      }
      frontier = next;
    }
    return [...found];
  }
}
