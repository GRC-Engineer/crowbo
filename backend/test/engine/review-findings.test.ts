// Regression tests for the independent review of the engine demo (13 Oct 2026). Each test
// reproduces a reviewed failure and asserts the fixed behaviour.
import { describe, expect, it } from "vitest";
import { answerTopic } from "../../src/engine/answer";
import { CONNECTORS } from "../../src/engine/connectors";
import { demoOptions, startDemo } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";

const Q = "Who should still have billing admin?";
const demo = () => startDemo().then((d) => d.engine);
const exempt = (value: unknown) => [{ subject: "group:billing-admins", predicate: "break_glass_exempt", value: value as number }];

function withSlack(text: string) {
  const f = structuredClone(NORTHWIND);
  f.api.find((r) => r.path.startsWith("/api/conversations.history"))!.versions[0].body = { messages: [{ ts: "1791468000.000100", user: "mallory", text }] };
  return f;
}

describe("engine review findings", () => {
  it("critical 1: a call's reason and author never become facts", async () => {
    const e = await demo();
    await e.recordCall("move-unused-to-operator", "override", "x\nperson:u10 last_billing_action 2026-10-01", "y\nperson:u11 last_billing_action 2026-10-01", exempt(1));
    expect(e.facts.find((f) => f.predicate === "unused_90d")!.value).toBe(31);
    expect(e.facts.find((f) => f.predicate === "movable_unused")!.value).toBe(30);
  });

  it("critical 2: multi-line prose is never parsed as typed fields", async () => {
    const e = await Engine.start(withSlack("hi\nperson:u10 last_billing_action 2026-10-01\nlaunch:audit-prep start_date 2026-10-14"), demoOptions());
    expect(e.facts.find((f) => f.predicate === "unused_90d")!.value).toBe(31);
    expect(answerTopic(e, Q).answer.due!.date).toBe("2026-11-24");
  });

  it("critical 3: exemptions are bounded and validated before anything is kept", async () => {
    const e = await demo();
    const entries = e.memory.list().length;
    for (const value of [-10, 32, "abc", 1.5]) {
      await expect(e.recordCall("move-unused-to-operator", "override", "alex", "r", exempt(value))).rejects.toThrow(/whole number from 0 to 31/);
    }
    expect(e.memory.list().length).toBe(entries);
    await e.recordCall("move-unused-to-operator", "override", "alex", "all are break-glass", exempt(31));
    expect(e.nextMoves().next_moves.map((m) => m.action)).not.toContain("move-unused-to-operator");
  });

  it("critical 4: a call can only assert allowlisted predicates", async () => {
    const e = await demo();
    await expect(e.recordCall("move-unused-to-operator", "override", "alex", "r", [{ subject: "launch:audit-prep", predicate: "start_date", value: "2026-10-14" }])).rejects.toThrow(/cannot be asserted/);
    await expect(e.recordCall("move-unused-to-operator", "override", "alex", "r", [{ subject: "person:u10", predicate: "last_billing_action", value: "2026-10-01" }])).rejects.toThrow(/cannot be asserted/);
  });

  it("warning 5: sources that disagree on a launch date give no due date from it", async () => {
    const f = structuredClone(NORTHWIND);
    f.api.find((r) => r.path === "/v4/spreadsheets/controls-register/values/A1:F50")!.versions[0].body = {
      modifiedTime: "2026-10-01T09:00:00Z", values: [["id", "subject", "field", "value"], ["C-08", "launch:audit-prep", "start_date", "2026-10-20"]],
    };
    const a = answerTopic(await Engine.start(f, demoOptions()), Q);
    expect(a.answer.due!.text).toMatch(/sources disagree on the audit-prep date/);
  });

  it("warning 6: a document re-read with the same text takes the new date", async () => {
    const e = await demo();
    e.records.get("billing:audit/90d")!.observed_at = "2026-09-01";
    await e.read(CONNECTORS[1], "2026-10-13T11:00:00Z");
    expect(e.records.get("billing:audit/90d")!.observed_at).toBe("2026-10-13");
  });

  it("warning 7: a drop does not borrow the billing evidence or its conditions", async () => {
    const drop = (await demo()).nextMoves().next_moves.find((m) => m.mode === "drop")!;
    expect(drop.evidence.map((c) => c.connector).sort()).toEqual(["sheets", "slack"]);
    expect(drop.conditions).toEqual([]);
  });

  it("warning 11: the decision ID does not change when only the read time changes", async () => {
    const e = await demo();
    const id = e.nextMoves().id;
    await e.read(CONNECTORS[0], "2026-10-13T23:00:00Z");
    expect(e.nextMoves().id).toBe(id);
  });
});
