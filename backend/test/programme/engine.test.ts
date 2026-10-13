// The TypeScript programme engine must reproduce the records the frozen Python proof saved on
// 25 September 2026: the same body hashes the same, so the IDs match byte for byte.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "../../../proof/fixtures/programme.json";
import { ownerDecision, packet, reassess, recommend, recordId } from "../../src/programme/engine";

const RESULTS = join(__dirname, "../../../proof/results");
const RECORDED = JSON.parse(readFileSync(join(RESULTS, "manifest.json"), "utf8")).records;
const recorded = (id: string) => JSON.parse(readFileSync(join(RESULTS, "records", `${id}.json`), "utf8")).body;
const data = structuredClone(fixture);
const basis = (caseId: string, principal = "grc-lead") => packet(data, caseId, "northstar-demo", principal, (data.cases as any)[caseId].as_of);

describe("programme engine matches the Python proof", () => {
  it("reproduces the recorded recommendation, owner choice and reassessment IDs", () => {
    const first = recommend(basis("baseline"));
    expect(first).toEqual(recorded(RECORDED.recommendation));
    expect(recordId(first)).toBe(RECORDED.recommendation);
    const choice = ownerDecision(first, RECORDED.recommendation, "grc-lead", ["recovery_fix", "application_fix", "ai_data_review"], "Keep the remaining half day as contingency instead of cleaning records.");
    expect(recordId(choice)).toBe(RECORDED.simulated_owner_decision);
    const later = reassess(basis("incident"), first, RECORDED.recommendation, choice, RECORDED.simulated_owner_decision);
    expect(recordId(later)).toBe(RECORDED.reassessment);
    expect(later.changes).toMatchObject({ evidence_states: { identity: { before: "no_gap_observed", after: "gap_supported" } }, added_actions: ["identity_fix"], displaced_actions: ["application_fix"] });
  });

  it("shows each principal only their tenant's evidence that they may read, up to the case date", () => {
    const ids = (p: string, c = "baseline") => basis(c, p).evidence.map((e: any) => e.id);
    expect(ids("grc-lead")).not.toContain("foreign_canary"); // another tenant, even though grc-lead is a reader
    expect(ids("grc-lead")).not.toContain("restricted_canary");
    expect(ids("executive")).toContain("restricted_canary");
    expect(ids("grc-lead")).not.toContain("access_incident"); // recorded after 25 September
    expect(ids("grc-lead", "incident")).toContain("access_incident");
  });

  it("makes no allocation when capacity is unknown, and stays within a cut", () => {
    expect(recommend(basis("missing_capacity"))).toMatchObject({ selected: [], status: "needs_owner_resolution" });
    const cut = recommend(basis("capacity_cut"));
    expect(cut.usage_range.high.security_half_days).toBeLessThanOrEqual(2);
    expect(cut.usage_range.high.platform_half_days).toBeLessThanOrEqual(2);
  });

  it("source text cannot change the recommendation", () => {
    const plain = recommend(basis("baseline"));
    const injected = recommend(basis("injection"));
    expect(injected.selected).toEqual(plain.selected);
    expect(injected.basis.capacity).toEqual(plain.basis.capacity);
  });
});
