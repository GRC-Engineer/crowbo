import { describe, expect, it } from "vitest";
import { answerTopic } from "../../src/engine/answer";
import { startDemo } from "../../src/engine/demo";
import type { Engine } from "../../src/engine/engine";
import { runEngine } from "../../src/engine/port";

const Q = "Who should still have billing admin?";

/** Two recorded calls that dispute the identity source: the engine proposes lowering its weight. */
async function disputed() {
  const { engine } = await startDemo();
  await engine.recordCall("move-unused-to-operator", "override", "alex", "The group sync lags", [], "identity");
  await engine.recordCall("move-unused-to-operator", "override", "alex", "Still lagging", [], "identity");
  const proposal = engine.memory.list("proposal").at(-1)!;
  return { engine, proposal };
}
const weight = (e: Engine) => e.weightsTable().find((w) => w.connector === "identity")!.weight;

describe("weight proposals: nothing changes until a person accepts", () => {
  it("a proposal is stale after any later weight change, even one that returns to the same value", async () => {
    const { engine, proposal } = await disputed();
    await engine.setWeight("identity", 3, "dana", "Testing");
    await engine.setWeight("identity", 5, "dana", "Back");
    await expect(runEngine(engine, "priya", "accept_proposal", { proposal: proposal.seq })).rejects.toThrow(/the weight has changed since \(now 5\)/);
    expect(weight(engine)).toBe(5);
  });

  it("the counter resets, it does not stop: two new disputes after an acceptance propose the next step", async () => {
    const { engine, proposal } = await disputed();
    await engine.acceptProposal(proposal.seq, "priya");
    await engine.recordCall("move-unused-to-operator", "override", "alex", "Lagging again", [], "identity");
    const next = await engine.recordCall("move-unused-to-operator", "override", "alex", "Still lagging", [], "identity");
    expect(next.proposals).toEqual([{ connector: "identity", from: 4, to: 3, disputes: 2 }]);
  });

  it("after a return to the same weight, fresh disputes can propose the same step again", async () => {
    const { engine, proposal } = await disputed();
    await engine.acceptProposal(proposal.seq, "priya");
    await engine.setWeight("identity", 5, "dana", "Sync fixed");
    await engine.recordCall("move-unused-to-operator", "override", "alex", "Lag is back", [], "identity");
    const again = await engine.recordCall("move-unused-to-operator", "override", "alex", "Still", [], "identity");
    expect(again.proposals).toEqual([{ connector: "identity", from: 5, to: 4, disputes: 2 }]);
  });

  it("accept_proposal runs only from MCP", async () => {
    const { engine, proposal } = await disputed();
    await expect(runEngine(engine, "slack:U1", "accept_proposal", { proposal: proposal.seq }, "slack")).rejects.toThrow(/runs only from the mcp surface/);
  });

  it("repeated disputes yield a proposal, and ignoring it changes nothing", async () => {
    const { engine, proposal } = await disputed();
    expect(proposal.body).toMatchObject({ connector: "identity", from: 5, to: 4, disputes: 2, note: "Proposal only: a person accepts it with accept_proposal." });
    expect(weight(engine)).toBe(5);
    expect(engine.memory.list("weight_change")).toEqual([]);
  });

  it("accepting is a weight change kept against the proposal, with who and why, and the decision is recomputed", async () => {
    const { engine, proposal } = await disputed();
    const before = engine.nextMoves().id;
    const r = (await runEngine(engine, "priya", "accept_proposal", { proposal: proposal.seq })) as { from: number; to: number; decision_diff: null | { because: string } };
    expect([r.from, r.to, weight(engine)]).toEqual([5, 4, 4]);
    expect(engine.memory.list("weight_change").at(-1)).toMatchObject({ actor: "priya", body: { connector: "identity", from: 5, to: 4, proposal: proposal.seq, reason: "Accepted proposal " + proposal.seq + ": 2 recorded calls disputed identity" } });
    expect(engine.nextMoves().id).not.toBe(before);
    expect(r.decision_diff?.because).toBe(`identity weight 5 → 4, accepted from proposal ${proposal.seq}`);
    // The next answer shows the source at its new weight, which is why the ranking moved.
    const a = answerTopic(engine, Q);
    expect(a.sources.find((s) => s.label === "Okta")!.weight).toBe(4);
    expect(a.basis.weights.find((w) => w.connector === "identity")!.weight).toBe(4);
    expect(engine.memory.verify()).toBe(true);
  });

  it("refuses a proposal already accepted, one overtaken by another weight change, and one that does not exist", async () => {
    const { engine, proposal } = await disputed();
    await engine.acceptProposal(proposal.seq, "priya");
    await expect(engine.acceptProposal(proposal.seq, "priya")).rejects.toThrow(/already accepted/);
    const other = await disputed();
    await other.engine.setWeight("identity", 3, "dana", "Sync issues confirmed");
    await expect(other.engine.acceptProposal(other.proposal.seq, "priya")).rejects.toThrow(/the weight has changed since \(now 3\), so the proposal no longer applies/);
    await expect(engine.acceptProposal(9999, "priya")).rejects.toThrow(/No proposal 9999/);
  });

  it("an accepted proposal settles the disputes before it: the next call does not propose again at once", async () => {
    const { engine, proposal } = await disputed();
    await engine.acceptProposal(proposal.seq, "priya");
    const next = await engine.recordCall("move-unused-to-operator", "accept", "alex", "Fine now", []);
    expect(next.proposals).toEqual([]);
  });
});
