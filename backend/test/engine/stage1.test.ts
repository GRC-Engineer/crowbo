// Stage 1: what a person trying Crowbo in their own Claude relies on. State survives a restart,
// what was done is recorded against the decision, exploring changes nothing, staging-only tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildServer } from "../../src/app/mcp";
import { demoOptions } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";
import { runEngine } from "../../src/engine/port";
import { MemoryEngineStore } from "../../src/engine/store";

const Q = "Who should still have billing admin?";
const open = (store: MemoryEngineStore) => Engine.open(structuredClone(NORTHWIND), demoOptions(), store);
const exempt4 = { action: "move-unused-to-operator", call: "override", reason: "Alex: 4 are break-glass", assertions: [{ subject: "group:billing-admins", predicate: "break_glass_exempt", value: 4 }] };

describe("Stage 1", () => {
  it("a recorded call survives a restart: the reopened engine answers 27 from the same memory", async () => {
    const store = new MemoryEngineStore();
    const first = await open(store);
    await runEngine(first, "tester", "record_call", exempt4);
    const memory = first.memory.list().length;
    const reopened = await open(store);
    const answer: any = await runEngine(reopened, "tester", "decide", { question: Q });
    expect(answer.answer.move.title).toBe("Move the 27 unused billing admins to the Billing Operator role");
    expect(reopened.nextMoves().id).toBe(first.nextMoves().id);
    expect(reopened.memory.list().length).toBe(memory); // reopening does not rewrite history
    expect(reopened.memory.list("call")[0].actor).toBe("tester"); // the actor comes from the transport
  });

  it("a stored history that fails its hash chain is refused, not used", async () => {
    const store = new MemoryEngineStore();
    await open(store);
    const state = store.load()!;
    (state.memory[0].body as any).records_changed = 99;
    await expect(open(new MemoryEngineStore(state))).rejects.toThrow(/hash-chain/);
  });

  it("a week later the reads show what was done, recorded against the decision that proposed it", async () => {
    const store = new MemoryEngineStore();
    const e = await open(store);
    const proposedIn = e.nextMoves().id;
    const r: any = await runEngine(e, "tester", "advance_time", { hours: 168 });
    expect(r.outcomes.map((o: any) => [o.body.status, o.body.baseline, o.body.value, o.body.decision])).toEqual([["partly_done", 31, 4, proposedIn]]);
    const answer: any = await runEngine(e, "tester", "decide", { question: Q });
    expect(answer.answer.move.title).toBe("Move the 4 unused billing admins to the Billing Operator role");
    expect(answer.outcomes[0]).toMatchObject({ status: "partly_done", source: "inferred from later reads", baseline: 31, value: 4 });
    expect((await open(store)).now).toBe("2026-10-20T09:00:00Z"); // the clock persists too
  });

  it("with the exemption recorded first, the same week reads as done", async () => {
    const e = await open(new MemoryEngineStore());
    await runEngine(e, "tester", "record_call", exempt4);
    expect(e.outcomes()).toEqual([]); // a call is not something done in the tools (found on wrangler dev, 15 Oct)
    const r: any = await runEngine(e, "tester", "advance_time", { hours: 168 });
    expect(r.outcomes.map((o: any) => o.body.status)).toEqual(["done"]);
  });

  it("a person can state an outcome the tools cannot see", async () => {
    const e = await open(new MemoryEngineStore());
    const entry: any = await runEngine(e, "tester", "record_outcome", { action: "drop-access-screenshots", status: "done", what_was_done: "Stopped the screenshots; the Okta export goes to the auditor" });
    expect(entry.body).toMatchObject({ status: "done", source: "stated" });
    await expect(runEngine(e, "tester", "record_outcome", { action: "drop-access-screenshots", status: "maybe", what_was_done: "x" })).rejects.toThrow();
  });

  it("what-if recomputes on a copy: nothing is written, the live decision is unchanged", async () => {
    const store = new MemoryEngineStore();
    const e = await open(store);
    const before = JSON.stringify(store.load());
    const r: any = await runEngine(e, "tester", "what_if", { weights: { slack: 1 } });
    expect(r.diff.removed).toEqual(["drop-access-screenshots"]);
    expect(r.kept).toBe(false);
    expect(JSON.stringify(store.load())).toBe(before);
  });

  it("the answer carries the basis a host needs to explain the ranking", async () => {
    const answer: any = await runEngine(await open(new MemoryEngineStore()), "tester", "decide", { question: Q });
    expect(answer.basis.scenario).toMatchObject({ frequency_per_year: { low: 0.2, high: 0.6 }, loss_per_event: { low: 150000, high: 900000 }, confidence: 0.8, state: "gap_supported" });
    expect(answer.basis.action).toMatchObject({ id: "move-unused-to-operator", rank: 2, reduces: [{ scenario: "billing-exposure", fraction: { low: 0.6, high: 0.8 } }] });
    expect(answer.basis.alternatives.map((a: any) => a.action)).toEqual(["drop-access-screenshots"]);
    expect(answer.basis.weights.find((w: any) => w.connector === "identity")).toEqual({ connector: "identity", weight: 5, max_age_days: 1 });
  });

  it("the Worker offers engine tools only where synthetic data is allowed", async () => {
    const names = async (synthetic: boolean) => {
      const server = buildServer(async () => ({ ok: false, error: "unused" }), { synthetic, engine: async () => ({ ok: true, result: {} }) });
      const [a, b] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "t", version: "0" });
      await Promise.all([server.connect(a), client.connect(b)]);
      return (await client.listTools()).tools.map((t) => t.name);
    };
    expect((await names(false)).some((n) => n.startsWith("engine_"))).toBe(false);
    expect((await names(true)).filter((n) => n.startsWith("engine_"))).toHaveLength(16);
  });
});

describe("Stage 1 review findings (15 Oct)", () => {
  it("M3: a recorded call re-baselines the move, so it never counts as done work; the week then reads done against 27", async () => {
    const e = await open(new MemoryEngineStore());
    await runEngine(e, "tester", "record_call", exempt4);
    await runEngine(e, "tester", "advance_time", { hours: 24 }); // a day with no change in the tools
    expect(e.outcomes()).toEqual([]);
    const week: any = await runEngine(e, "tester", "advance_time", { hours: 144 });
    expect(week.outcomes.map((o: any) => [o.body.status, o.body.baseline, o.body.value])).toEqual([["done", 27, 0]]);
  });

  it("M2: past the due date, fresh evidence of no change reads not done; stale evidence reads unconfirmed", async () => {
    const unchanged = () => {
      const f = structuredClone(NORTHWIND);
      for (const r of f.api) r.versions = r.versions.filter((v) => v.from < "2026-10-20"); // nobody acts
      return f;
    };
    // The billing log keeps being regenerated, so the evidence stays fresh: the move was not done.
    const fresh = unchanged();
    const bill = fresh.api.find((r) => r.path.startsWith("/v1/audit/summary"))!;
    bill.versions.push({ from: "2026-11-25T02:00:00Z", body: { ...(bill.versions[0].body as object), generated_at: "2026-11-25T02:00:00Z" } });
    const e1 = await Engine.open(fresh, demoOptions(), new MemoryEngineStore());
    for (const hours of [720, 336]) await runEngine(e1, "tester", "advance_time", { hours }); // to 26 Nov, past the 24 Nov due date
    expect(e1.outcomes().map((o) => [o.body.status, o.body.value])).toEqual([["not_done_by_due", 31]]);
    // The log is never regenerated: the engine cannot confirm either way, and says so.
    const e2 = await Engine.open(unchanged(), demoOptions(), new MemoryEngineStore());
    for (const hours of [720, 336]) await runEngine(e2, "tester", "advance_time", { hours });
    expect(e2.outcomes().map((o) => o.body.status)).toEqual(["unconfirmed_by_due"]);
  });

  it("L3: an inferred outcome is not written twice, even after a stated one", async () => {
    const e = await open(new MemoryEngineStore());
    await runEngine(e, "tester", "advance_time", { hours: 168 });
    await runEngine(e, "tester", "record_outcome", { action: "move-unused-to-operator", status: "partly_done", what_was_done: "Moved 27; 4 left for the owner" });
    await runEngine(e, "tester", "advance_time", { hours: 24 });
    expect(e.outcomes().filter((o) => o.body.source === "inferred from later reads").map((o) => o.body.status)).toEqual(["partly_done"]);
  });

  it("L1: a copy stops taking writes at its cap, and says how to start over", async () => {
    const e = await open(new MemoryEngineStore());
    while (e.memory.list().length < 2000) e.memory.append("read", "filler", {});
    await expect(runEngine(e, "tester", "record_call", exempt4)).rejects.toThrow(/reset it to start over/);
    expect(await runEngine(e, "tester", "decide", { question: Q })).toBeTruthy(); // reading still works
  });
});
