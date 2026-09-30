// Port of tests/test_permissions.py. Synthetic audiences and mocked providers; no production identity service.
import { afterEach, describe, expect, it, vi } from "vitest";
import { grant as grantSchema, logicalId, permits, revisionId, type SourceInput } from "../../src/domain/contracts";
import { reviewRequest } from "../../src/domain/review";
import { type Settings, activeGroups, settings as settingsSchema } from "../../src/domain/settings";
import { type Instant, micros } from "../../src/domain/time";
import type { FetchLike } from "../../src/providers/http";
import { TurbopufferChunks } from "../../src/providers/turbopuffer";
import { Evidence, headId } from "../../src/services/evidence";
import { Reasoner, Review } from "../../src/services/review";
import { addMicros, batch, FakeJev, HOUR, makeEngine, makeItem, makeSettings, MemoryLedger, MINUTE, now, withGrant, withSource } from "../helpers";

const MODEL = "openai/gpt-6-luna";

let last = 0n;
/** `now()` strictly after the previous call: Python has microsecond clocks, `Date` only milliseconds. */
function fresh(): Instant {
  let t = now();
  while (micros(t) <= last) t = now();
  last = micros(t);
  return t;
}
const changed = (item: SourceInput, fields: Record<string, unknown>) => withSource(item, fields);
const regrant = (item: SourceInput, fields: Record<string, unknown> = {}) => withGrant(item, { checked_at: fresh(), ...fields });
const lid = (item: SourceInput) => logicalId(item.source);

function context(settings: Settings, reader: string, groups: string[] = [], at: Instant = now()): Settings {
  return settingsSchema.parse({
    ...settings,
    reader,
    membership: {
      tenant: settings.tenant,
      reader,
      groups,
      checked_at: addMicros(at, -MINUTE),
      expires_at: addMicros(at, 10n * MINUTE),
    },
  });
}

const reader = (engine: Evidence, name: string, groups: string[] = [], at?: Instant) =>
  new Evidence(context(engine.settings, name, groups, at), engine.store, engine.jev);

const hit = (item: SourceInput) => ({ logical_id: lid(item), revision_id: revisionId(item.source), generation: 1 });

function setup(settings: Settings = makeSettings()) {
  const { engine, store, jev } = makeEngine(settings);
  return { engine, store, jev, settings, item: makeItem() };
}

/** Port of test_review.response(). */
function response() {
  return {
    model: "gpt-6-luna",
    usage: { prompt_tokens: 120, completion_tokens: 40 },
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            recommendation: "Confirm the obligation and available capacity before committing.",
            rationale: "The source requests a review but supplies no obligation [E1].",
            alternatives: ["Proceed with independently confirmed work."],
            uncertainties: ["Available hours are unknown."],
            evidence_ids: ["E1"],
          }),
        },
      },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("permissions", () => {
  it("py: tests/test_permissions.py::test_group_member_retrieves_source_and_jev_while_outsiders_cannot", async () => {
    const { engine, store } = setup();
    const item = regrant(makeItem(), { reader_groups: ["idp:security"] });
    await engine.ingest(batch(item));
    store.hits = [hit(item)];
    const permitted = reader(engine, "alice", ["idp:security"]);
    expect((await permitted.search("review"))[0].source.title).toBe("Synthetic access review");
    expect(((await permitted.inspect(lid(item))).assessment!.answers.commitment_evidence as any).choice).toBe("insufficient");
    expect((await permitted.listCurrent()).map((view) => view.source.title)).toEqual(["Synthetic access review"]);
    for (const outsider of [reader(engine, "bob", ["idp:finance"]), reader(engine, "idp:security")]) {
      expect(await outsider.search("review")).toEqual([]);
      await expect(outsider.inspect(lid(item))).rejects.toThrow(/permission/);
    }
    expect((await engine.inspect(lid(item))).source.title).toBe("Synthetic access review");
  });

  // py: tests/test_permissions.py::test_inactive_membership_denies_group_access_but_not_explicit_user_grants[offset0]
  // py: tests/test_permissions.py::test_inactive_membership_denies_group_access_but_not_explicit_user_grants[offset1]
  it.each([-2n * HOUR, 2n * HOUR])("inactive membership denies group access but not explicit user grants [%s]", async (offset) => {
    const { engine, store } = setup();
    const item = regrant(makeItem(), { reader_groups: ["idp:security"] });
    await engine.ingest(batch(item));
    store.hits = [hit(item)];
    const allowed = reader(engine, "alice", ["idp:security"]);
    expect((await allowed.search("review"))[0].source.title).toBe("Synthetic access review");
    const denied = reader(engine, "alice", ["idp:security"], addMicros(now(), offset));
    expect(await denied.search("review")).toEqual([]);
    await expect(denied.inspect(lid(item))).rejects.toThrow(/permission/);
    const direct = reader(engine, "operator", ["idp:security"], addMicros(now(), offset));
    expect((await direct.inspect(lid(item))).source.title).toBe("Synthetic access review");
  });

  // py: tests/test_permissions.py::test_membership_cannot_be_rebound_to_another_identity[reader-other]
  // py: tests/test_permissions.py::test_membership_cannot_be_rebound_to_another_identity[tenant-other]
  it.each([
    ["reader", "other"],
    ["tenant", "other"],
  ])("membership cannot be rebound to another identity [%s-%s]", (field, value) => {
    const valid = context(makeSettings(), "alice", ["idp:security"]);
    expect(activeGroups(valid, now())).toEqual(["idp:security"]);
    expect(() => settingsSchema.parse({ ...valid, [field]: value })).toThrow(/configured tenant and reader/);
  });

  it("py: tests/test_permissions.py::test_membership_has_a_short_bounded_lease", () => {
    const valid = context(makeSettings(), "alice", ["idp:security"]);
    const data = structuredClone(valid) as any;
    data.membership.expires_at = addMicros(valid.membership!.checked_at, 2n * HOUR);
    expect(() => settingsSchema.parse(data)).toThrow(/at most one hour/);
    expect(activeGroups(valid, valid.membership!.expires_at)).toEqual([]);
    expect(activeGroups(valid, valid.membership!.checked_at)).toEqual(["idp:security"]);
  });

  it("py: tests/test_permissions.py::test_group_revocation_overrides_stale_index_and_does_not_repeat_models", async () => {
    const { engine, store, jev } = setup();
    const item = regrant(makeItem(), { reader_groups: ["idp:security"] });
    await engine.ingest(batch(item));
    store.hits = [hit(item)];
    const alice = reader(engine, "alice", ["idp:security"]);
    expect((await alice.search("review"))[0].source.title).toBe("Synthetic access review");
    await engine.ingest(batch(regrant(item, { reader_groups: [] })));
    expect(await alice.search("review")).toEqual([]);
    await expect(alice.inspect(lid(item))).rejects.toThrow(/permission/);
    expect((await engine.inspect(lid(item))).index_ready).toBe(true);
    expect(jev.calls).toBe(1);
    expect(store.indexed.length).toBe(1);
  });

  it("py: tests/test_permissions.py::test_group_only_ingestion_and_losing_one_reader_preserves_other_readers", async () => {
    const { engine, store, jev } = setup();
    const alice = reader(engine, "alice", ["idp:security"]);
    const item = regrant(makeItem(), { readers: [], reader_groups: ["idp:security"] });
    expect((await alice.ingest(batch(item)))[0].assessment_ready).toBe(true);
    expect((await alice.inspect(lid(item))).source.title).toBe("Synthetic access review");
    const restricted = regrant(item, { readers: ["bob"], reader_groups: [] });
    expect((await alice.ingest(batch(restricted)))[0].status).toBe("access_denied");
    const bob = reader(engine, "bob");
    expect((await bob.inspect(lid(item))).source.title).toBe("Synthetic access review");
    expect((await bob.resume())[0].index_ready).toBe(true);
    expect(store.rows.get(headId(lid(item)))!.withdrawn).toBe(false);
    expect(jev.calls).toBe(1);
    expect(store.indexed.length).toBe(1);
  });

  it("py: tests/test_permissions.py::test_group_read_access_does_not_grant_model_processing", async () => {
    const { engine } = setup();
    const item = regrant(makeItem(), { reader_groups: ["idp:security"], processors: ["turbopuffer"] });
    await engine.ingest(batch(item));
    const alice = reader(engine, "alice", ["idp:security"]);
    const view = await alice.inspect(lid(item));
    expect(view.source.title).toBe("Synthetic access review");
    await expect(alice.checkProcessingMany([view], MODEL)).rejects.toThrow(/permission/);
    expect(view.assessment).toBeNull();
  });

  it("py: tests/test_permissions.py::test_new_audience_does_not_restore_a_withdrawn_source_without_authorised_ingestion", async () => {
    const { engine, item } = setup();
    await engine.ingest(batch(item));
    expect((await engine.inspect(lid(item))).source.title).toBe("Synthetic access review");
    await engine.withdraw(lid(item), fresh());
    const restricted = regrant(item, { readers: ["bob"] });
    expect((await engine.ingest(batch(restricted)))[0].status).toBe("access_denied");
    const bob = reader(engine, "bob");
    await expect(bob.inspect(lid(item))).rejects.toThrow(/withdrawn/);
    expect(await bob.resume()).toEqual([]);
    expect((await bob.ingest(batch(restricted)))[0].index_ready).toBe(true);
    expect((await bob.inspect(lid(item))).source.title).toBe("Synthetic access review");
  });

  it("py: tests/test_permissions.py::test_membership_expiring_during_jev_cannot_save_the_assessment", async () => {
    const { engine, store } = setup();
    const alice = reader(engine, "alice", ["idp:security"]);
    const item = regrant(makeItem(), { readers: [], reader_groups: ["idp:security"] });
    const jev = alice.jev as FakeJev;
    const assess = jev.assess.bind(jev);
    // Python patched crowbo.evidence.now; the clock here is Date.now.
    jev.assess = async (source) => {
      const answer = await assess(source);
      vi.spyOn(Date, "now").mockReturnValue(Number(micros(alice.settings.membership!.expires_at) / 1000n));
      return answer;
    };
    const result = (await alice.ingest(batch(item)))[0];
    expect(result.assessment_ready).toBe(false);
    expect(result.errors[0].stage).toBe("jev");
    expect(store.rows.get(headId(lid(item)))!.assessment_id).toBeNull();
    expect(jev.calls).toBe(1);
  });

  it("py: tests/test_permissions.py::test_saved_review_keeps_private_context_and_requires_every_contributor", async () => {
    const { engine, item } = setup(makeSettings({ query_processors: ["turbopuffer", "voyage", MODEL] }));
    const pub = regrant(item, { reader_groups: ["idp:security"], processors: [...item.grant.processors, MODEL] });
    const restricted = regrant(changed(pub, { native_id: "restricted" }), { reader_groups: ["idp:leaders"] });
    await engine.ingest(batch(pub, restricted));
    const alice = reader(engine, "alice", ["idp:security", "idp:leaders"]);
    const fetch: FetchLike = async () => new Response(JSON.stringify(response()), { status: 200 });
    const model = new Reasoner(
      { account: alice.settings.cloudflare_account, gateway: alice.settings.gateway, token: "test-token", fetch },
      new MemoryLedger(),
      alice.settings.query_processors,
    );
    const result = await new Review(alice, model).run(
      reviewRequest.parse({
      question: "What should we do next?",
      context: "Private operator-provided context.",
      source_ids: [lid(pub), lid(restricted)],
      model: MODEL,
      reasoning_effort: "high",
      }),
    );
    expect(result.answer.recommendation).toBe("Confirm the obligation and available capacity before committing.");
    const bob = reader(engine, "bob", ["idp:security", "idp:leaders"]);
    expect((await bob.inspectMany([lid(pub), lid(restricted)])).length).toBe(2);
    await expect(new Review(bob, null).inspect(result.id)).rejects.toThrow(/unavailable/);
    await engine.ingest(batch(regrant(restricted, { reader_groups: [] })));
    expect((await alice.inspect(lid(pub))).source.title).toBe("Synthetic access review");
    await expect(new Review(alice, null).inspect(result.id)).rejects.toThrow(/permission/);
  });

  it("py: tests/test_permissions.py::test_legacy_grant_stays_readable_and_refreshes_metadata_only", async () => {
    const { engine, store, jev, item } = setup();
    await engine.ingest(batch(item));
    const head = store.rows.get(headId(lid(item)))!;
    delete head.grant.reader_groups;
    head.index_grant_hash = "legacy";
    const legacy = grantSchema.parse(head.grant);
    expect(permits(legacy, "operator", now())).toBe(true);
    expect(permits(legacy, "alice", now(), null, ["idp:security"])).toBe(false);
    expect((await engine.resume())[0].index_ready).toBe(true);
    expect((await engine.inspect(lid(item))).source.title).toBe("Synthetic access review");
    expect(jev.calls).toBe(1);
    expect(store.indexed.length).toBe(1);
  });

  // Heads are no longer queried from Turbopuffer (they live in the tenant object's SQL store), so
  // the Python `store.heads(...)` half has no counterpart here; the search prefilter is ported.
  it("py: tests/test_permissions.py::test_native_queries_prefilter_by_user_or_group_without_returning_chunk_text", async () => {
    const sent: any[] = [];
    const respond: FetchLike = async (_url, init) => {
      sent.push(JSON.parse(String(init!.body)));
      const row = { id: "chunk", logical_id: "permitted", revision_id: "v1", generation: 1 };
      return new Response(JSON.stringify({ rows: [row], billing: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const store = new TurbopufferChunks("x".repeat(32), "crowbo-test", new MemoryLedger(), respond);
    expect((await store.search("alice", "review", "keyword", 5, ["idp:security"]))[0].logical_id).toBe("permitted");
    const audience = ["Or", [["readers", "Contains", "alice"], ["reader_groups", "ContainsAny", ["idp:security"]]]];
    expect(sent.every((body) => body.filters[1].some((f: unknown) => JSON.stringify(f) === JSON.stringify(audience)))).toBe(true);
    expect(sent[0].include_attributes).toEqual(["logical_id", "revision_id", "generation"]);
    await store.search("operator", "review", "keyword", 5, []);
    expect(sent.at(-1).filters[1][0]).toEqual(["readers", "Contains", "operator"]);
  });
});
