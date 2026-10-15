import { describe, expect, it } from "vitest";
import type { ChatModel } from "../../src/engine/ai";
import { demoOptions, startDemo } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_KB_EXPORT } from "../../src/engine/kb-fixture";
import { runEngine } from "../../src/engine/port";
import type { EngineInvoke } from "../../src/engine/tools";
import { escape, handleExport, handleMention, toMrkdwn, weeklyPost } from "../../src/surfaces/slack";

const Q = "<@U0CROWBO> Who should still have billing admin?";
const thread = "C0GRC/1791468000.000100";
const demo = () => startDemo().then((d) => d.engine);
/** The surface over an in-process engine, as the Worker runs it over a Durable Object. */
const via = (e: Engine): EngineInvoke => (op, args) => runEngine(e, "slack:U0ALEX", op, args);

/** A model that routes to the billing topic and phrases from the answer's own numbers, recording what it was asked. */
function scripted(): ChatModel & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: "scripted-model", calls,
    async json(system) {
      calls.push(system.slice(0, 40));
      if (system.startsWith("Route")) return { topic: "billing-admin" };
      return { text: "Move the 31 unused billing admins [1][2]; Priya decides and Alex delivers." };
    },
  };
}

describe("Slack surface: a mention answers with the card", () => {
  it("carries the headless contract: question, case and version, planning period, evidence-check time, next action marked as advice, trade-off, status, sources, unresolved, full result ID, next operations", async () => {
    const e = await demo();
    const r = await handleMention(via(e), { text: Q, thread });
    const id = e.nextMoves().id;
    expect(r.decision_id).toBe(id);
    expect(r.text).toContain("*Who should still have billing admin?*");
    expect(r.text).toContain("_Case: billing-admin · method engine-prototype-0.2 · planning 2026-10-13 to 2027-01-11 · evidence checked 2026-10-13T09:00:00Z_");
    expect(r.text).toContain("*Next action* (advice: a recommendation, not a decision)\nMove the 31 unused billing admins to the Billing Operator role (fix) [1][2][3]");
    expect(r.text).toContain("Removes $14k–$346k a year of expected loss (exactly $14,400–$345,600, rounded to $1k above) for 6–10 hours.");
    expect(r.text).toContain("Decides: Priya. Delivers: Alex. Due before audit prep (2026-11-24) [4].");
    expect(r.text).toMatch(/\[1\] Okta: 40 people hold billing-admins .*\(weight 5, fresh, read 2026-10-13T09:00:00Z\)/);
    expect(r.text).toMatch(/\*Unresolved\*\n• \[5\] .*stale/);
    expect(r.text).toContain(`_Result ${id}. Recommendation only; nothing executes._`);
    expect(r.text).toContain("_Next operations on this result: inspect it, record feedback (a call or an outcome), or reassess after new evidence._");
  });

  it("marks a later observed outcome and a reported choice as such", async () => {
    const e = await demo();
    await e.recordCall("move-unused-to-operator", "override", "tester", "4 are break-glass", [{ subject: "group:billing-admins", predicate: "break_glass_exempt", value: 4 }]);
    await e.advance(168, "tester");
    await e.recordOutcome("move-unused-to-operator", "done", "Alex moved 27 accounts", "tester");
    const r = await handleMention(via(e), { text: Q, thread });
    expect(r.text).toContain("Observed outcome: done (inferred from later reads, 2026-10-20).");
    expect(r.text).toMatch(/Reported choice: done \(stated, 2026-10-20\)\./);
  });

  it("without a model, the card is the computed answer alone; with one, the model routes and phrases, and the ranking is unchanged", async () => {
    const plain = await handleMention(via(await demo()), { text: Q, thread });
    expect(plain.text).not.toContain("Summary phrased by");
    const model = scripted();
    const e = await Engine.start(structuredClone(NORTHWIND), demoOptions(undefined, undefined, model));
    const phrased = await handleMention(via(e), { text: Q, thread });
    expect(model.calls.map((c) => c.split(" ")[0])).toEqual(["Route", "Write"]);
    expect(phrased.text).toContain("_Summary phrased by scripted-model, checked against the sources._");
    const section = (t: string) => t.slice(t.indexOf("*Next action*"));
    expect(section(phrased.text)).toBe(section(plain.text));
  });

  it("\"brief\" returns this week's list as Slack text, with nothing added", async () => {
    const r = await handleMention(via(await demo()), { text: "<@U0CROWBO> brief", thread });
    expect(r.text).toMatch(/^\*Security brief, week of 13 Oct\*/);
    expect(r.text).toContain("1. *Stop the quarterly access screenshots; the auditor accepts the Okta export* (drop).");
    expect(r.text).not.toContain("**");
    expect(r).toEqual(await weeklyPost(via(await demo())));
  });

  it("a question it cannot place gets the questions it can answer, and an empty mention gets help", async () => {
    const e = await demo();
    expect((await handleMention(via(e), { text: "<@U0CROWBO> what's for lunch", thread })).text).toMatch(/^No topic matches; ask about: Who should still have billing admin\?/);
    expect((await handleMention(via(e), { text: "<@U0CROWBO>", thread })).text).toMatch(/^Ask me a security question/);
    expect((await handleMention(via(e), { text: `<@U0CROWBO> ${"billing ".repeat(80)}`, thread })).text).toMatch(/^question: /);
  });
});

describe("Slack surface: untrusted text is inert", () => {
  it("escapes links, mentions and broadcasts from questions and sources", async () => {
    expect(escape("<!channel> <https://evil.example|click> & <@U123>")).toBe("&lt;!channel&gt; &lt;https://evil.example|click&gt; &amp; &lt;@U123&gt;");
    const r = await handleMention(via(await demo()), { text: "<@U0CROWBO> billing admin <!channel> <https://evil.example|x>", thread });
    expect(r.text).not.toMatch(/<!channel>|<https:/);
    expect(toMrkdwn("# A <b>\n**x** & y")).toBe("*A &lt;b&gt;*\n*x* &amp; y");
  });
});

describe("Slack surface: a direct message with an export runs the import", () => {
  it("replies with the first profile: systems and owners, controls, stale entries, moves, and files with notes", async () => {
    const e = await Engine.start(structuredClone(NORTHWIND), { ...demoOptions(), connectors: [] });
    const r = await handleExport(via(e), NORTHWIND_KB_EXPORT, { synthetic: true });
    expect(r.text).toContain("*First profile from your export* (6 of 7 files read)");
    expect(r.text).toContain("• app:billing: person:priya");
    expect(r.text).toContain("• control:billing-admin-access, assigned to person:alex");
    expect(r.text).toMatch(/• board\/q3-board-pack\.pdf: PDF text is not read yet/);
    expect(e.memory.list("import")[0].actor).toBe("slack:U0ALEX");
  });

  it("an export not declared synthetic is refused, and nothing is kept", async () => {
    const e = await Engine.start(structuredClone(NORTHWIND), { ...demoOptions(), connectors: [] });
    const before = e.memory.list().length;
    const r = await handleExport(via(e), NORTHWIND_KB_EXPORT, {} as { synthetic: true });
    expect(r.text).toMatch(/^Import refused/);
    expect(e.memory.list().length).toBe(before);
  });
});
