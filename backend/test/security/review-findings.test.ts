// Regression tests for the independent security review of the TypeScript backend (30 Sep 2026).
// Each test reproduces one finding's failure scenario and asserts the fixed behaviour.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));

import { run } from "../../src/app/operations";
import { logicalId, revisionId } from "../../src/domain/contracts";
import { settings as settingsSchema } from "../../src/domain/settings";
import { addMicros, HOUR, MINUTE, now } from "../../src/domain/time";
import type { Question } from "../../src/standing/model";
import { CRITERIA_VERSION } from "../../src/standing/rules";
import { type Caller, Standing } from "../../src/standing/service";
import { boundedBody } from "../../src/worker";
import { batch, makeEngine, makeItem, makeSettings, MemoryLedger, withSource } from "../helpers";

const FINDING: Question = { kind: "finding_close", finding_id: "SEC-9" };
const EXCEPTION: Question = { kind: "exception_valid", exception_id: "EXC-9" };

function caller(reader: string, groups: string[], roles: string[] = ["operator", "criteria_approver"]): Caller {
  const at = now();
  return {
    roles,
    settings: settingsSchema.parse({
      ...makeSettings({ query_processors: ["turbopuffer", "voyage", "jev"] }),
      reader,
      membership: groups.length ? { tenant: "synthetic", reader, groups, checked_at: addMicros(at, -MINUTE), expires_at: addMicros(at, 30n * MINUTE) } : null,
    }),
  };
}

async function setup() {
  const { engine, store } = makeEngine(makeSettings({ query_processors: ["turbopuffer", "voyage", "jev"] }));
  const standing = new Standing(store, { allowSyntheticGates: true });
  const lead = caller("operator", ["grc"]);
  return { engine, store, standing, lead };
}

async function activate(standing: Standing, who: Caller, kind: Question["kind"]) {
  const gate = await standing.recordGate(who, { question_kind: kind, criteria_version: CRITERIA_VERSION[kind], qualification: "synthetic_fixture", cases: 3, passed: true, evidence: "fixtures", approved_by: who.settings.reader });
  await standing.activateCriteria(who, kind, gate.id);
}

const operatorAssertion = (subject_key: string, workflow: string, predicate: string, value: string | null, reader = "operator") => ({
  subject_key, workflow, predicate, state: value === null ? "unknown" : "stated", value, provenance: "operator_assertion", attributed_to: reader,
}) as any;

describe("security review findings", () => {
  afterEach(() => vi.useRealTimers());

  it("1 (critical): ingesting sources requires the ingestor role", async () => {
    const { store } = makeEngine();
    const context = (roles: string[]) => ({
      caller: { settings: makeSettings(), roles }, store, ledger: new MemoryLedger(), ai: { account: "0".repeat(32), gateway: "default", token: null }, slackToken: null, allowSyntheticGates: true,
    });
    const item = makeItem();
    const denied = await run(context(["operator"]), "ingest", batch(item));
    expect(denied).toEqual({ ok: false, error: "This operation requires the ingestor role" });
    expect(store.writes).toBe(0);
    for (const name of ["resume", "sync_register", "sync_due"]) {
      expect(await run(context(["operator", "criteria_approver"]), name, name === "sync_register" ? { spec: {} } : {})).toMatchObject({ ok: false });
    }
    const allowed = await run(context(["ingestor"]), "ingest", batch(item));
    expect(allowed.ok).toBe(true);
  });

  it("2 (high): history withholds versions derived from a now-withdrawn source", async () => {
    const { engine, standing, lead } = await setup();
    await standing.registerSubject(lead, EXCEPTION, "grc");
    await activate(standing, lead, "exception_valid");
    const item = withSource(makeItem(), { native_id: "exc-9", text: "EXC-9 approved by the CISO; the exception expires on 2031-04-01 per the register." });
    await engine.ingest(batch(item));
    const cite = (quote: string) => [{ source_id: logicalId(item.source), revision_id: revisionId(item.source), quote }];
    await standing.assertFact(lead, { subject_key: "exception:EXC-9", workflow: "exceptions", predicate: "expires_on", state: "stated", value: "2031-04-01", citations: cite("the exception expires on 2031-04-01"), provenance: "source_extraction", extractor: "manual@1", attributed_to: "operator" } as any);
    await standing.ask(lead, EXCEPTION);
    await engine.withdraw(logicalId(item.source), now());
    const history = await standing.history(lead, EXCEPTION);
    if (history.status !== "ok") throw new Error("expected history");
    expect(history.versions[0]).toEqual({ id: expect.any(String), computed_at: expect.any(String), withheld: "contributing source withdrawn or not readable" });
    expect(JSON.stringify(history.versions)).not.toContain("2031-04-01");
  });

  it("3 (high): nobody can supersede another reader's fact; extractions cannot assert unknown", async () => {
    const { standing, lead } = await setup();
    await standing.registerSubject(lead, FINDING, "grc");
    await activate(standing, lead, "finding_close");
    await standing.assertFact(lead, operatorAssertion("finding:SEC-9", "remediation", "regression_observed", "yes"));
    const carol = caller("carol", ["grc"], ["operator"]);
    await standing.assertFact(carol, operatorAssertion("finding:SEC-9", "remediation", "regression_observed", null, "carol"));
    const served = await standing.ask(lead, FINDING);
    expect(served.status === "answered" && served.version.verdict.outcome).toBe("reopen_treatment");
    await expect(
      standing.assertFact(carol, { subject_key: "finding:SEC-9", workflow: "remediation", predicate: "regression_observed", state: "unknown", provenance: "source_extraction", extractor: "jev", attributed_to: "carol" } as any),
    ).rejects.toThrow(/source extraction cannot assert unknown/);
  });

  it("4 (medium): re-asserting an earlier value supersedes the later one; assertion IDs make retries idempotent", async () => {
    const { standing, lead } = await setup();
    await standing.registerSubject(lead, FINDING, "grc");
    await activate(standing, lead, "finding_close");
    for (const value of ["no", "yes", "no"]) await standing.assertFact(lead, operatorAssertion("finding:SEC-9", "remediation", "regression_observed", value));
    const served = await standing.ask(lead, FINDING);
    expect(served.status === "answered" && served.version.verdict.outcome).toBe("not_closable");
    const once = await standing.assertFact(lead, { ...operatorAssertion("finding:SEC-9", "remediation", "merged", "yes"), assertion_id: "retry-0001" });
    const again = await standing.assertFact(lead, { ...operatorAssertion("finding:SEC-9", "remediation", "merged", "yes"), assertion_id: "retry-0001" });
    expect(again.id).toBe(once.id);
    await expect(standing.assertFact(lead, { ...operatorAssertion("finding:SEC-9", "remediation", "merged", "no"), assertion_id: "retry-0001" })).rejects.toThrow(/already used for a different fact/);
  });

  it("5 (medium): facts dropped because their source changed make the answer stale, not current", async () => {
    const { engine, standing, lead } = await setup();
    await standing.registerSubject(lead, FINDING, "grc");
    await activate(standing, lead, "finding_close");
    const item = withSource(makeItem(), { native_id: "sec-9", text: "SEC-9 regression observed in sign-in after the rollout." });
    await engine.ingest(batch(item));
    await standing.assertFact(lead, { subject_key: "finding:SEC-9", workflow: "remediation", predicate: "regression_observed", state: "stated", value: "yes", citations: [{ source_id: logicalId(item.source), revision_id: revisionId(item.source), quote: "regression observed in sign-in" }], provenance: "source_extraction", extractor: "manual@1", attributed_to: "operator" } as any);
    await engine.ingest(batch(withSource(item, { text: "SEC-9 thread updated with a new reply.", updated_at: addMicros(item.source.updated_at, HOUR) })));
    expect(await standing.ask(lead, FINDING)).toMatchObject({ status: "answered", freshness: { status: "stale", reasons: ["fact_source_changed"] } });
  });

  it("6 (medium): a subject can only be registered to one of the caller's teams", async () => {
    const { standing, lead } = await setup();
    await expect(standing.registerSubject(lead, FINDING, "nobody")).rejects.toThrow(/one of your teams/);
  });

  it("7 (medium): the predecessor chain follows the order answers were actually served", async () => {
    const { engine, standing, lead } = await setup();
    await standing.registerSubject(lead, FINDING, "grc");
    await activate(standing, lead, "finding_close");
    const version = async () => {
      const served = await standing.ask(lead, FINDING);
      if (served.status !== "answered") throw new Error("expected an answer");
      return served.version;
    };
    const a = await version(); // no facts
    const item = withSource(makeItem(), { native_id: "sec-9-chain", text: "SEC-9 fix merged in PR 991 for the gateway." });
    await engine.ingest(batch(item));
    await standing.assertFact(lead, { subject_key: "finding:SEC-9", workflow: "remediation", predicate: "merged", state: "stated", value: "yes", citations: [{ source_id: logicalId(item.source), revision_id: revisionId(item.source), quote: "fix merged in PR 991" }], provenance: "source_extraction", extractor: "manual@1", attributed_to: "operator" } as any);
    const b = await version();
    expect(b.predecessor).toBe(a.id);
    await engine.withdraw(logicalId(item.source), now()); // inputs return exactly to A's
    const back = await version();
    expect(back.id).toBe(a.id);
    await standing.assertFact(lead, operatorAssertion("finding:SEC-9", "remediation", "deployed", "yes"));
    const c = await version();
    expect(c.predecessor).toBe(a.id); // before the fix this was b.id
  });

  it("8 (medium): request bodies are capped while reading, with or without Content-Length", async () => {
    const big = "x".repeat(1_000_001);
    const declared = await boundedBody(new Request("https://api.test/v1", { method: "POST", body: "{}", headers: { "content-length": "2000000" } }));
    expect(declared instanceof Response && declared.status).toBe(413);
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const undeclared = await boundedBody(new Request("https://api.test/v1", { method: "POST", body: stream, duplex: "half" } as any));
    expect(undeclared instanceof Response && undeclared.status).toBe(413);
    const fine = await boundedBody(new Request("https://api.test/v1", { method: "POST", body: '{"a":1}' }));
    expect(fine instanceof Uint8Array && new TextDecoder().decode(fine)).toBe('{"a":1}');
  });
});

import { SlackReader } from "../../src/providers/slack";

describe("Slack file references follow Python truthiness", () => {
  it("an empty files list is treated as no file references, so the revision text matches the pilot", async () => {
    const parent = { ts: "1727258400.000100", text: "parent", reply_count: 0, files: [] as unknown[] };
    const fetchImpl = async () => new Response(JSON.stringify({ ok: true, messages: [parent], has_more: false, response_metadata: { next_cursor: "" } }), { status: 200 });
    const snapshot = await new SlackReader(new MemoryLedger(), "x".repeat(32), fetchImpl as any).read({ channel_id: "C0123456789", message_ts: "1727258400.000100", title: "t" });
    expect(snapshot.text).toBe('[{"text":"parent","ts":"1727258400.000100"}]');
  });
});
