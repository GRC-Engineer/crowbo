import { describe, expect, it } from "vitest";
import { cohensKappa, score } from "../../src/eval/score";

const q = { kind: "access_retain", subject: { system: "aws", account_id: "svc-1", scope: "Admin" } } as const;
const L = (state: "stated" | "unknown", value: string | null = null, support: string[] = []) => ({ state, value, support });
const E = (state: "stated" | "unknown", value: string | null = null, quotes: string[] = []) => ({ state, value, quotes });

function agreedCase(id: string, extracted: Record<string, ReturnType<typeof E>> = {}) {
  const facts = {
    identity: L("stated", "svc-1", ["account svc-1"]),
    required_work: L("stated", "specific", ["runs the nightly deploy"]),
    alternative_test: L("stated", "failed", ["read-only role failed"]),
  };
  return { case_id: id, question: q, reviewers: { a: facts, b: facts }, extracted, human_outcome: "retain" };
}

describe("evaluation scoring", () => {
  it("computes Cohen's kappa exactly", () => {
    expect(cohensKappa([["x", "x"], ["y", "y"]])).toBe(1);
    // observed 0.5, expected 0.5 -> kappa 0
    expect(cohensKappa([["x", "x"], ["x", "y"], ["y", "x"], ["y", "y"]])).toBe(0);
  });

  it("passes only with 30 fully agreed cases and misbinding no higher than reviewer disagreement", () => {
    const good = { identity: E("stated", "svc-1", ["account svc-1 runs"]), required_work: E("stated", "specific", ["runs the nightly deploy"]), alternative_test: E("stated", "failed", ["read-only role failed"]) };
    const set = { question_kind: "access_retain", deciding_predicates: ["identity", "required_work", "alternative_test"], as_of: "2026-09-30", cases: Array.from({ length: 30 }, (_, i) => agreedCase(`c${i}`, good)) };
    const report = score(set as any);
    expect(report).toMatchObject({ verdict: "pass", reasons: [], fully_agreed_cases: 30, deciding: { misbinding_rate: 0, reviewer_disagreement_rate: 0 } });
    expect(report.per_predicate.identity).toMatchObject({ extraction_accuracy: 1, misbinding_rate: 0, gold_cases: 30 });
    expect(report.rules).toMatchObject({ gold_vs_extracted_agreement: 1, human_agreement: 1, human_compared: 30 });
    expect(report.tiers.settled_by_rules_on_gold).toBe(1);
    expect(report.report_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails on too few cases and on a quote bound to the wrong fact", () => {
    // required_work stated with the right value but from the alternative-test quote: misbinding.
    const misbound = { identity: E("stated", "svc-1", ["account svc-1"]), required_work: E("stated", "specific", ["read-only role failed"]), alternative_test: E("stated", "failed", ["read-only role failed"]) };
    const report = score({ question_kind: "access_retain", deciding_predicates: ["identity", "required_work", "alternative_test"], as_of: "2026-09-30", cases: [agreedCase("c1", misbound)] } as any);
    expect(report.verdict).toBe("fail");
    expect(report.per_predicate.required_work).toMatchObject({ extraction_accuracy: 1, misbinding_rate: 1 });
    expect(report.reasons).toEqual([
      "only 1 cases have reviewer agreement on every deciding fact; at least 30 are required",
      "misbinding on deciding facts (33.3%) exceeds reviewer disagreement (0.0%)",
    ]);
  });

  it("excludes reviewer disagreements from gold and reports them", () => {
    const c = agreedCase("c1");
    (c.reviewers as any).b = { ...c.reviewers.a, required_work: L("stated", "partial") };
    const report = score({ question_kind: "access_retain", deciding_predicates: ["identity", "required_work", "alternative_test"], as_of: "2026-09-30", cases: [c] } as any);
    expect(report.per_predicate.required_work).toMatchObject({ gold_cases: 0, reviewer_disagreement_rate: 1, extraction_accuracy: null });
    expect(report.fully_agreed_cases).toBe(0);
    // With required_work unresolved, the criteria investigate: judgement is needed.
    expect(report.rules.outcomes.gold).toEqual({ investigate: 1 });
  });
});
