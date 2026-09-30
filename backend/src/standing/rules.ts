import type { FactSet, Question, Verdict } from "./model";

/**
 * Criteria are pure functions of resolved facts and the evaluation instant. They never read a
 * missing fact as a default: unknown and conflicting stay unresolved and usually decide the
 * outcome. Versions are recorded with every decision; changing logic means a new version.
 */

export const CRITERIA_VERSION: Record<Question["kind"], string> = {
  access_retain: "access-retain-v1",
  finding_close: "finding-close-v1",
  exception_valid: "exception-valid-v1",
};

const stated = (facts: FactSet, p: string) => facts[p]?.state === "stated";
const value = (facts: FactSet, p: string) => (stated(facts, p) ? facts[p].value : null);
const unresolved = (facts: FactSet, predicates: readonly string[]) => predicates.filter((p) => !stated(facts, p));

export function evaluate(q: Question, facts: FactSet, today: string): Verdict {
  switch (q.kind) {
    case "access_retain":
      return accessRetain(facts);
    case "finding_close":
      return findingClose(facts);
    case "exception_valid":
      return exceptionValid(facts, today);
  }
}

/** Mirrors the access selection rules: no account action without stated identity; a failed
 * alternative cannot be selected; low usage alone never justifies removal. */
function accessRetain(facts: FactSet): Verdict {
  const deciding = ["identity", "required_work", "alternative_test"];
  const open = unresolved(facts, deciding);
  const trace: string[] = [];
  if (!stated(facts, "identity")) {
    trace.push("identity not stated → investigate (no account action without an identity join)");
    return { outcome: "investigate", next_check: "Confirm the account identity from a source that names this exact account.", deciding: ["identity"], unresolved: open, trace };
  }
  trace.push("identity stated");
  const work = value(facts, "required_work");
  const alternative = value(facts, "alternative_test");
  if (work === null) {
    trace.push("required work unresolved → investigate");
    return { outcome: "investigate", next_check: "Ask the owner which current tasks need this access.", deciding: ["required_work"], unresolved: open, trace };
  }
  if (work === "absent") {
    trace.push("required work stated absent → reduce toward removal, reversible");
    return { outcome: "remove_candidate", next_check: "Confirm no infrequent recovery task depends on this access before removal.", deciding: ["identity", "required_work"], unresolved: open, trace };
  }
  if (work === "partial") {
    trace.push("required work partial → investigate");
    return { outcome: "investigate", next_check: "Identify the specific current task and scope this account performs.", deciding: ["required_work"], unresolved: open, trace };
  }
  trace.push("required work specific");
  if (alternative === "passed") {
    trace.push("alternative passed every required task → reduce");
    return { outcome: "reduce", next_check: null, deciding, unresolved: open, trace };
  }
  if (alternative === "failed") {
    trace.push("alternative failed a required task → retain (never select a failing option)");
    return { outcome: "retain", next_check: "Re-test a narrower alternative against the complete workflow.", deciding, unresolved: open, trace };
  }
  trace.push("alternative untested → retain with conditions");
  return { outcome: "retain_conditional", next_check: "Test a narrower alternative against every required task.", deciding, unresolved: open, trace };
}

/** A merged fix is not a deployment, and a deployment is not a verified closure. */
function findingClose(facts: FactSet): Verdict {
  const chain = ["merged", "deployed", "verified"];
  const open = unresolved(facts, [...chain, "regression_observed"]);
  const trace: string[] = [];
  if (value(facts, "regression_observed") === "yes") {
    trace.push("regression observed → treatment must change");
    return { outcome: "reopen_treatment", next_check: "Decide the interim treatment for the regression.", deciding: ["regression_observed"], unresolved: open, trace };
  }
  for (const step of chain) {
    const v = value(facts, step);
    if (v === "failed") {
      trace.push(`${step} failed → not closable`);
      return { outcome: "not_closable", next_check: `Resolve the failed ${step} step.`, deciding: [step], unresolved: open, trace };
    }
    if (v !== "yes") {
      trace.push(`${step} not established → not closable`);
      return { outcome: "not_closable", next_check: `Obtain evidence that the fix is ${step}.`, deciding: [step], unresolved: open, trace };
    }
    trace.push(`${step} established`);
  }
  return { outcome: "closable", next_check: null, deciding: chain, unresolved: open, trace: [...trace, "merged, deployed and verified → propose closure"] };
}

/** An exception request is not approval; an asserted safeguard is not a verified one. */
function exceptionValid(facts: FactSet, today: string): Verdict {
  const open = unresolved(facts, ["approval", "expires_on", "safeguard_verified", "conditions_met"]);
  const trace: string[] = [];
  const expires = value(facts, "expires_on");
  if (expires !== null && expires <= today) {
    trace.push(`expired on ${expires} → reconsider explicitly (no silent renewal)`);
    return { outcome: "expired", next_check: "Remediate or request a new, bounded exception.", deciding: ["expires_on"], unresolved: open, trace };
  }
  if (value(facts, "approval") !== "approved") {
    trace.push("no stated approval → request only");
    return { outcome: "not_approved", next_check: "Obtain a decision from the accountable approver.", deciding: ["approval"], unresolved: open, trace };
  }
  if (expires === null) {
    trace.push("approved without a stated expiry → invalid bound");
    return { outcome: "unbounded", next_check: "Set an explicit expiry for the exception.", deciding: ["expires_on"], unresolved: open, trace };
  }
  const safeguard = value(facts, "safeguard_verified");
  if (safeguard === "failed") {
    trace.push("safeguard verification failed → reconsider");
    return { outcome: "safeguard_failed", next_check: "Reassess the exception; its safeguard does not operate.", deciding: ["safeguard_verified"], unresolved: open, trace };
  }
  if (safeguard !== "yes" || value(facts, "conditions_met") !== "yes") {
    trace.push("approved but safeguard or conditions unverified → conditional");
    return { outcome: "valid_conditional", next_check: "Verify the compensating safeguard and conditions.", deciding: ["safeguard_verified", "conditions_met"], unresolved: open, trace };
  }
  trace.push("approved, bounded, safeguard and conditions verified → valid");
  return { outcome: "valid", next_check: null, deciding: ["approval", "expires_on", "safeguard_verified", "conditions_met"], unresolved: open, trace };
}
