import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logicalId, revisionId } from "../../src/domain/contracts";
import { settings as settingsSchema } from "../../src/domain/settings";
import { addMicros, DAY, HOUR, MINUTE, now } from "../../src/domain/time";
import type { Question } from "../../src/standing/model";
import { CRITERIA_VERSION, evaluate } from "../../src/standing/rules";
import { type Caller, Standing } from "../../src/standing/service";
import { batch, makeEngine, makeItem, makeSettings, MemoryStore, withGrant, withSource } from "../helpers";

const ACCESS: Question = { kind: "access_retain", subject: { system: "aws-prod", account_id: "svc-deploy", scope: "AdministratorAccess" } };
const FINDING: Question = { kind: "finding_close", finding_id: "SEC-42" };
const EXCEPTION: Question = { kind: "exception_valid", exception_id: "EXC-7" };
const ACCESS_KEY = "account:aws-prod:AdministratorAccess:svc-deploy";

function caller(reader: string, groups: string[], roles: string[] = ["operator", "criteria_approver"]): Caller {
  const at = now();
  return {
    roles,
    settings: settingsSchema.parse({
      ...makeSettings({ query_processors: ["turbopuffer", "voyage", "jev"] }),
      reader,
      membership: groups.length
        ? { tenant: "synthetic", reader, groups, checked_at: addMicros(at, -MINUTE), expires_at: addMicros(at, 30n * MINUTE) }
        : null,
    }),
  };
}

async function setup(options: { allowSyntheticGates?: boolean } = {}) {
  const { engine, store } = makeEngine(makeSettings({ query_processors: ["turbopuffer", "voyage", "jev"] }));
  const standing = new Standing(store, { allowSyntheticGates: options.allowSyntheticGates ?? true });
  const lead = caller("operator", ["grc"]);
  return { engine, store, standing, lead };
}

async function activate(standing: Standing, who: Caller, kind: Question["kind"]) {
  const gate = await standing.recordGate(who, {
    question_kind: kind,
    criteria_version: CRITERIA_VERSION[kind],
    qualification: "synthetic_fixture",
    cases: 3,
    passed: true,
    evidence: "synthetic fixture cases only",
    approved_by: who.settings.reader,
  });
  await standing.activateCriteria(who, kind, gate.id);
}

async function sourceWith(engine: ReturnType<typeof makeEngine>["engine"], text: string, native = "issue-1") {
  const item = withSource(makeItem(), { native_id: native, text });
  await engine.ingest(batch(item));
  return { item, source: logicalId(item.source), revision: revisionId(item.source) };
}

describe("standing decisions: criteria logic", () => {
  const facts = (values: Record<string, string>) =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { state: "stated" as const, value: v, fact_ids: [k], provenance: ["operator_assertion" as const] }]));

  it("never takes an account action without a stated identity", () => {
    expect(evaluate(ACCESS, facts({ required_work: "absent" }), "2026-09-30").outcome).toBe("investigate");
  });
  it("retains when a narrower alternative fails a required task, reduces when it passes", () => {
    expect(evaluate(ACCESS, facts({ identity: "svc-deploy", required_work: "specific", alternative_test: "failed" }), "2026-09-30").outcome).toBe("retain");
    expect(evaluate(ACCESS, facts({ identity: "svc-deploy", required_work: "specific", alternative_test: "passed" }), "2026-09-30").outcome).toBe("reduce");
  });
  it("does not treat merged as deployed or deployed as verified", () => {
    expect(evaluate(FINDING, facts({ merged: "yes" }), "2026-09-30")).toMatchObject({ outcome: "not_closable", deciding: ["deployed"] });
    expect(evaluate(FINDING, facts({ merged: "yes", deployed: "yes" }), "2026-09-30")).toMatchObject({ outcome: "not_closable", deciding: ["verified"] });
    expect(evaluate(FINDING, facts({ merged: "yes", deployed: "yes", verified: "yes" }), "2026-09-30").outcome).toBe("closable");
  });
  it("never renews an exception silently and never treats a request as approval", () => {
    expect(evaluate(EXCEPTION, facts({ approval: "approved", expires_on: "2026-09-30" }), "2026-09-30").outcome).toBe("expired");
    expect(evaluate(EXCEPTION, facts({ expires_on: "2026-12-31" }), "2026-09-30").outcome).toBe("not_approved");
    expect(evaluate(EXCEPTION, facts({ approval: "approved", expires_on: "2026-12-31" }), "2026-09-30").outcome).toBe("valid_conditional");
  });
});

describe("standing decisions: serving", () => {
  afterEach(() => vi.useRealTimers());

  it("answers from source-bound facts with a trace, inputs and no authority", async () => {
    const { engine, standing, lead } = await setup();
    await standing.registerSubject(lead, ACCESS, "grc");
    await activate(standing, lead, "access_retain");
    const s = await sourceWith(engine, "Ticket: account svc-deploy runs the nightly release pipeline; the read-only role failed the deploy step.");
    const cite = (quote: string) => [{ source_id: s.source, revision_id: s.revision, quote }];
    for (const [predicate, value, quote] of [
      ["identity", "svc-deploy", "account svc-deploy runs the nightly"],
      ["required_work", "specific", "runs the nightly release pipeline"],
      ["alternative_test", "failed", "the read-only role failed the deploy step"],
    ] as const) {
      await standing.assertFact(lead, {
        subject_key: ACCESS_KEY, workflow: "access_review", predicate, state: "stated", value, citations: cite(quote),
        provenance: "source_extraction", extractor: "manual-extraction@1", attributed_to: "operator",
      } as any);
    }
    const served = await standing.ask(lead, ACCESS);
    expect(served).toMatchObject({ status: "answered", freshness: { status: "current" } });
    if (served.status !== "answered") throw new Error();
    expect(served.version.verdict.outcome).toBe("retain");
    expect(served.version.verdict.trace).toContain("alternative failed a required task → retain (never select a failing option)");
    expect(served.version.inputs.revisions).toEqual([[s.source, s.revision]]);
    expect(served.version).toMatchObject({ simulated: true, authority_verified: false, tier: "rule", criteria_qualification: "synthetic_fixture" });
    // Asking again is idempotent: same inputs, same immutable version.
    const again = await standing.ask(lead, ACCESS);
    expect(again.status === "answered" && again.version.id).toBe(served.version.id);
  });

  it("is unavailable outside the team and when any contributing source is no longer readable", async () => {
    const { engine, standing, lead } = await setup();
    await standing.registerSubject(lead, ACCESS, "grc");
    await activate(standing, lead, "access_retain");
    const s = await sourceWith(engine, "Ticket: account svc-deploy runs the nightly release pipeline for payments.");
    await standing.assertFact(lead, {
      subject_key: ACCESS_KEY, workflow: "access_review", predicate: "identity", state: "stated", value: "svc-deploy",
      citations: [{ source_id: s.source, revision_id: s.revision, quote: "account svc-deploy runs the nightly" }],
      provenance: "source_extraction", extractor: "manual-extraction@1", attributed_to: "operator",
    } as any);
    // Team member without a grant on the cited source: the mixed-audience trap.
    expect(await standing.ask(caller("teammate", ["grc"]), ACCESS)).toEqual({ status: "unavailable" });
    // A reader with the grant but outside the team.
    expect(await standing.ask(caller("operator", ["platform"]), ACCESS)).toEqual({ status: "unavailable" });
    expect((await standing.ask(lead, ACCESS)).status).toBe("answered");
    // Revocation applies on the next ask, with no recompute.
    await engine.withdraw(s.source, now());
    const after = await standing.ask(lead, ACCESS);
    expect(after.status === "answered" && after.version.inputs.facts).toEqual([]);
  });

  it("drops facts from superseded revisions and records the new version's predecessor", async () => {
    const { engine, standing, lead } = await setup();
    await standing.registerSubject(lead, FINDING, "grc");
    await activate(standing, lead, "finding_close");
    const first = await sourceWith(engine, "SEC-42 fix merged in PR 812 and deployed to production eu-west.", "sec-42");
    const cite = { source_id: first.source, revision_id: first.revision, quote: "fix merged in PR 812" };
    await standing.assertFact(lead, { subject_key: "finding:SEC-42", workflow: "remediation", predicate: "merged", state: "stated", value: "yes", citations: [cite], provenance: "source_extraction", extractor: "manual-extraction@1", attributed_to: "operator" } as any);
    const before = await standing.ask(lead, FINDING);
    expect(before.status === "answered" && before.version.verdict.outcome).toBe("not_closable");
    const revised = withSource(first.item, { native_id: "sec-42", text: "SEC-42 fix was reverted after a sign-in regression.", updated_at: addMicros(first.item.source.updated_at, HOUR) });
    await engine.ingest(batch(revised));
    const after = await standing.ask(lead, FINDING);
    if (after.status !== "answered" || before.status !== "answered") throw new Error();
    expect(after.version.inputs.facts).toEqual([]);
    expect(after.version.predecessor).toBe(before.version.id);
  });

  it("blocks on conflicting facts instead of picking one", async () => {
    const { standing, lead } = await setup();
    await standing.registerSubject(lead, EXCEPTION, "grc");
    await activate(standing, lead, "exception_valid");
    await standing.assertFact(lead, { subject_key: "exception:EXC-7", workflow: "exceptions", predicate: "approval", state: "stated", value: "approved", provenance: "operator_assertion", attributed_to: "operator" } as any);
    const other = caller("reviewer", ["grc"]);
    await standing.assertFact(other, { subject_key: "exception:EXC-7", workflow: "exceptions", predicate: "approval", state: "stated", value: "rejected", provenance: "operator_assertion", attributed_to: "reviewer" } as any);
    expect(await standing.ask(lead, EXCEPTION)).toEqual({ status: "blocked", reason: "conflicting_facts", predicates: ["approval"] });
  });

  it("labels an answer stale after 24 hours without a content check, keeping the verdict", async () => {
    const { engine, standing, lead } = await setup();
    await standing.registerSubject(lead, FINDING, "grc");
    await activate(standing, lead, "finding_close");
    const item = withGrant(withSource(makeItem(), { native_id: "sec-42", text: "SEC-42 fix merged in PR 812 and deployed." }), { expires_at: addMicros(now(), 3n * DAY) });
    await engine.ingest(batch(item));
    await standing.assertFact(lead, { subject_key: "finding:SEC-42", workflow: "remediation", predicate: "merged", state: "stated", value: "yes", citations: [{ source_id: logicalId(item.source), revision_id: revisionId(item.source), quote: "fix merged in PR 812" }], provenance: "source_extraction", extractor: "manual-extraction@1", attributed_to: "operator" } as any);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 3600 * 1000);
    const later = caller("operator", ["grc"]);
    const served = await standing.ask(later, FINDING);
    expect(served).toMatchObject({ status: "answered", freshness: { status: "stale", reasons: ["content_unchecked_24h"] } });
    expect(served.status === "answered" && served.version.verdict.outcome).toBe("not_closable");
  });

  it("requires an approver and a passing gate for the current criteria; synthetic gates only where allowed", async () => {
    const { standing, lead } = await setup({ allowSyntheticGates: false });
    await standing.registerSubject(lead, EXCEPTION, "grc");
    expect(await standing.ask(lead, EXCEPTION)).toEqual({ status: "not_ready", reason: "no_active_criteria" });
    await expect(standing.recordGate(caller("operator", ["grc"], ["operator"]), {
      question_kind: "exception_valid", criteria_version: CRITERIA_VERSION.exception_valid, qualification: "qualified", cases: 30, passed: true, evidence: "x", approved_by: "operator",
    })).rejects.toThrow(/criteria_approver/);
    const synthetic = await standing.recordGate(lead, { question_kind: "exception_valid", criteria_version: CRITERIA_VERSION.exception_valid, qualification: "synthetic_fixture", cases: 3, passed: true, evidence: "fixtures", approved_by: "operator" });
    await expect(standing.activateCriteria(lead, "exception_valid", synthetic.id)).rejects.toThrow(/Synthetic fixture gates/);
    const failed = await standing.recordGate(lead, { question_kind: "exception_valid", criteria_version: CRITERIA_VERSION.exception_valid, qualification: "qualified", cases: 30, passed: false, evidence: "misbinding above reviewer disagreement", approved_by: "operator" });
    await expect(standing.activateCriteria(lead, "exception_valid", failed.id)).rejects.toThrow(/passing evaluation gate/);
  });

  it("rejects quotes that are not exact unique spans and operator assertions attributed to someone else", async () => {
    const { engine, standing, lead } = await setup();
    await standing.registerSubject(lead, ACCESS, "grc");
    const s = await sourceWith(engine, "Ticket: account svc-deploy runs the nightly release pipeline.");
    await expect(standing.assertFact(lead, { subject_key: ACCESS_KEY, workflow: "access_review", predicate: "identity", state: "stated", value: "svc-deploy", citations: [{ source_id: s.source, revision_id: s.revision, quote: "account svc-deploy runs daily" }], provenance: "source_extraction", extractor: "x@1", attributed_to: "operator" } as any)).rejects.toThrow(/exact span/);
    await expect(standing.assertFact(lead, { subject_key: ACCESS_KEY, workflow: "access_review", predicate: "identity", state: "stated", value: "svc-deploy", provenance: "operator_assertion", attributed_to: "someone-else" } as any)).rejects.toThrow(/attributed to the asserting reader/);
  });
});
