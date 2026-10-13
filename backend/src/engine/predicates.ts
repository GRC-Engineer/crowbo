import type { Value } from "./model";

/**
 * Every predicate the engine knows, in one table: whether it holds several values at once, whether
 * it links two nodes in the context graph, and whether a person may assert it in a recorded call
 * (and what values are valid). A predicate missing from this table cannot be asserted.
 */

export interface PredicateRule {
  /** Several values at once (a role permits many actions); differing values are not a conflict. */
  multi?: true;
  /** Links two nodes; becomes an edge in the context graph. */
  relation?: true;
  /** May be stated in a recorded call. `check` returns an error message, or null when valid. */
  assertable?: (value: Value, context: { factValue: (subject: string, predicate: string) => Value | undefined; subject: string }) => string | null;
}

export const PREDICATES: Record<string, PredicateRule> = {
  member_of: { multi: true, relation: true },
  leads: { multi: true, relation: true },
  depends_on: { multi: true, relation: true },
  grants_admin_on: { multi: true, relation: true },
  assigned_to: { relation: true },
  business_owner: { relation: true },
  permits: { multi: true },
  billing_actions: { multi: true },
  break_glass_exempt: {
    assertable: (value, { factValue, subject }) => {
      const unused = factValue(subject, "unused_90d");
      if (typeof unused !== "number") return `No current unused count for ${subject} to exempt from`;
      return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= unused ? null : `break_glass_exempt must be a whole number from 0 to ${unused}`;
    },
  },
};

export const isMulti = (predicate: string) => PREDICATES[predicate]?.multi === true;
export const isRelation = (predicate: string) => PREDICATES[predicate]?.relation === true;

/** A node id without its type prefix: "launch:audit-prep" → "audit-prep". */
export const nodeName = (node: string) => node.replace(/^[a-z]+:/, "");
