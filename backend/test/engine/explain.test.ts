// The answering model's output is used only when every number and citation traces to the computed answer.
import { describe, expect, it } from "vitest";
import type { ChatModel } from "../../src/engine/ai";
import { answerTopic } from "../../src/engine/answer";
import { startDemo } from "../../src/engine/demo";
import { draftFollowups, routeQuestion, summarise, ungrounded } from "../../src/engine/explain";

const Q = "Who should still have billing admin?";
const scripted = (...replies: unknown[]): ChatModel & { calls: number } => {
  const m = { id: "fake-model", calls: 0, json: async () => replies[Math.min(m.calls++, replies.length - 1)] };
  return m;
};
const answer = async () => { const { engine } = await startDemo(); return { engine, a: answerTopic(engine, Q, "billing-admin") }; };

describe("answering model guard", () => {
  it("rejects invented numbers and unknown sources, accepts grounded text", async () => {
    const { a } = await answer();
    expect(ungrounded("31 of 40 holders are unused [2]; Priya decides before 2026-11-24 [4].", a)).toBeNull();
    expect(ungrounded("About 35 holders are unused [2].", a)).toMatch(/numbers not in the answer: 35/);
    expect(ungrounded("31 are unused [9].", a)).toMatch(/do not exist: 9/);
  });

  it("retries once with the reason, then refuses rather than falling back", async () => {
    const { a } = await answer();
    const fixed = scripted({ text: "About 35 are unused [2]." }, { text: "31 of 40 holders are unused [2]." });
    expect((await summarise(fixed, a)).text).toBe("31 of 40 holders are unused [2].");
    expect(fixed.calls).toBe(2);
    await expect(summarise(scripted({ text: "About 35 are unused [2]." }), a)).rejects.toThrow(/rejected twice/);
  });

  it("routes only to a listed topic", async () => {
    const { engine } = await answer();
    expect((await routeQuestion(scripted({ topic: "billing-admin" }), engine.fixture.topics, "who keeps admin?")).topic.id).toBe("billing-admin");
    await expect(routeQuestion(scripted({ topic: "payroll" }), engine.fixture.topics, "x")).rejects.toThrow(/rejected twice/);
  });

  it("drafts go to the decider, the deliverer and the channel, grounded, never sent", async () => {
    const { engine, a } = await answer();
    const topic = engine.fixture.topics[0];
    const good = { drafts: [
      { to: "Priya", text: "Can we move the 31 unused admins to Billing Operator [1][2][3]? Nothing changes until you say yes." },
      { to: "Alex", text: "Test on one account first, then move them before 2026-11-24 [4]." },
      { to: "#billing-admins", text: "Heads-up: nothing has changed yet [1]." },
    ] };
    const d = await draftFollowups(scripted(good), topic, a);
    expect(d).toMatchObject({ sent: false, generated_by: "fake-model" });
    expect(d.drafts[1].cites).toEqual([4]);
    await expect(draftFollowups(scripted({ drafts: good.drafts.slice(0, 2) }), topic, a)).rejects.toThrow(/exactly three/);
  });

  it("without a model, outputs say so", async () => {
    const { engine, a } = await answer();
    expect((await summarise(null, a)).generated_by).toMatch(/no answering model/);
    expect((await draftFollowups(null, engine.fixture.topics[0], a)).generated_by).toMatch(/template/);
  });
});
