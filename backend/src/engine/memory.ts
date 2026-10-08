import { digest } from "../domain/canonical";
import type { MemoryEntry, MemoryKind } from "./model";

/**
 * Layer 04, decision memory. Every decision computed, every call a person makes (accept,
 * override, exception), every weight change and every tuning proposal is appended here, hash
 * chained so an edit or deletion is detectable. "Tuned to your company" means proposals drawn
 * from this history; a person approves each one, and the approval is itself an entry.
 */
export class DecisionMemory {
  private entries: MemoryEntry[] = [];

  constructor(private clock: () => string = () => new Date().toISOString()) {}

  append(kind: MemoryKind, actor: string, body: Record<string, unknown>): MemoryEntry {
    const prev = this.entries.at(-1)?.hash ?? null;
    const seq = this.entries.length + 1;
    const at = this.clock();
    const entry = { seq, at, kind, actor, body, prev };
    const full = { ...entry, hash: digest(entry) };
    this.entries.push(full);
    return full;
  }

  list(kind?: MemoryKind): MemoryEntry[] {
    return kind ? this.entries.filter((e) => e.kind === kind) : [...this.entries];
  }

  /** Recompute the chain; false if any entry was changed, removed or reordered. */
  verify(): boolean {
    let prev: string | null = null;
    return this.entries.every((e, i) => {
      const { hash, ...rest } = e;
      const ok = e.seq === i + 1 && e.prev === prev && digest(rest) === hash;
      prev = hash;
      return ok;
    });
  }

  /**
   * Propose a lower weight for a source the team has disputed in two or more calls. A proposal
   * changes nothing; only an approved weight change does.
   */
  tuningProposals(weights: Map<string, number>): { connector: string; from: number; to: number; disputes: number }[] {
    const disputes = new Map<string, number>();
    const proposed = new Set(this.list("proposal").map((e) => `${e.body.connector}->${e.body.to}`));
    for (const e of this.list("call")) {
      const c = e.body.disputes_source;
      if (typeof c === "string") disputes.set(c, (disputes.get(c) ?? 0) + 1);
    }
    return [...disputes]
      .filter(([c, n]) => n >= 2 && (weights.get(c) ?? 0) > 0)
      .map(([connector, n]) => ({ connector, from: weights.get(connector)!, to: weights.get(connector)! - 1, disputes: n }))
      .filter((p) => !proposed.has(`${p.connector}->${p.to}`));
  }
}
