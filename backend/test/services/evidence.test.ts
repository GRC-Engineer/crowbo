// Port of tests/test_evidence.py.
import { describe, expect, it } from "vitest";
import { logicalId, revisionId, type SourceInput } from "../../src/domain/contracts";
import { CrowboError } from "../../src/domain/errors";
import { type Instant, micros } from "../../src/domain/time";
import { Evidence, headId } from "../../src/services/evidence";
import { addMicros, batch, DAY, HOUR, makeEngine, makeItem, makeSettings, MINUTE, now, withGrant, withSource } from "../helpers";

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
const rid = (item: SourceInput) => revisionId(item.source);

function setup() {
  const { engine, store, jev, settings } = makeEngine();
  return { engine, store, jev, settings, item: makeItem() };
}

describe("evidence", () => {
  // py: tests/test_evidence.py::test_batch_read_checks_every_source_and_fresh_permissions[missing_head]
  // py: tests/test_evidence.py::test_batch_read_checks_every_source_and_fresh_permissions[missing_assessment]
  // py: tests/test_evidence.py::test_batch_read_checks_every_source_and_fresh_permissions[revoked]
  // py: tests/test_evidence.py::test_batch_read_checks_every_source_and_fresh_permissions[changed_during_read]
  it.each(["missing_head", "missing_assessment", "revoked", "changed_during_read"])(
    "batch read checks every source and fresh permissions [%s]",
    async (failure) => {
      const { engine, store, item } = setup();
      const second = changed(item, { native_id: "second" });
      await engine.ingest(batch(item, second));
      const key = headId(lid(second));
      const head = store.rows.get(key)!;
      if (failure === "missing_head") store.rows.delete(key);
      else if (failure === "missing_assessment") store.rows.delete(head.assessment_id);
      else if (failure === "revoked") head.grant.revoked = true;
      else {
        const read = store.getMany.bind(store);
        store.getMany = async (keys: readonly string[]) => {
          const result = await read(keys);
          if (keys.includes(rid(second))) head.grant.revoked = true;
          return result;
        };
      }
      await expect(engine.inspectMany([lid(item), lid(second)])).rejects.toThrow(CrowboError);
    },
  );

  it("py: tests/test_evidence.py::test_ingestion_retrieval_keeps_exact_assessment_and_retry_is_idempotent", async () => {
    const { engine, store, jev, item } = setup();
    const result = (await engine.ingest(batch(item)))[0];
    expect(result.assessment_ready && result.index_ready).toBe(true);
    const first = await engine.inspect(lid(item));
    await engine.ingest(batch(item));
    const second = await engine.inspect(lid(item));
    expect(first.assessment).toEqual(second.assessment);
    expect(second.assessment!.source_revision).toBe(rid(item));
    expect(jev.calls).toBe(1);
    expect(store.indexed.length).toBe(1);
  });

  it("py: tests/test_evidence.py::test_jev_failure_keeps_source_and_embedding_and_new_process_can_resume", async () => {
    const { engine, store, jev, settings, item } = setup();
    jev.fail = true;
    const result = (await engine.ingest(batch(item)))[0];
    expect(result.assessment_ready).toBe(false);
    expect(result.index_ready).toBe(true);
    expect((await engine.inspect(lid(item))).source).toEqual(item.source);
    jev.fail = false;
    const restarted = new Evidence(settings, store, jev);
    expect((await restarted.resume())[0].assessment_ready).toBe(true);
    expect(store.indexed.length).toBe(1);
  });

  it("py: tests/test_evidence.py::test_embedding_failure_keeps_assessment_and_resume_does_not_repeat_jev", async () => {
    const { engine, store, jev, item } = setup();
    store.failIndex = true;
    const result = (await engine.ingest(batch(item)))[0];
    expect(result.assessment_ready).toBe(true);
    expect(result.index_ready).toBe(false);
    const assessed = (await engine.inspect(lid(item))).assessment;
    store.failIndex = false;
    expect((await engine.resume())[0].index_ready).toBe(true);
    expect((await engine.inspect(lid(item))).assessment).toEqual(assessed);
    expect(jev.calls).toBe(1);
  });

  it("py: tests/test_evidence.py::test_wrong_tenant_preflights_entire_batch_before_writes", async () => {
    const { engine, store, jev, item } = setup();
    const other = changed(item, { tenant: "other", native_id: "other" });
    await expect(engine.ingest(batch(item, other))).rejects.toThrow(/outside/);
    expect(store.rows.size).toBe(0);
    expect(jev.calls).toBe(0);
  });

  // py: tests/test_evidence.py::test_denied_first_import_never_sends_payload[change0]
  // py: tests/test_evidence.py::test_denied_first_import_never_sends_payload[change1]
  // py: tests/test_evidence.py::test_denied_first_import_never_sends_payload[change2]
  it.each([{ readers: [] }, { revoked: true }, { processors: [] }])("denied first import never sends payload %o", async (change) => {
    const { engine, store, jev } = setup();
    const item = regrant(makeItem(), change);
    expect((await engine.ingest(batch(item)))[0].status).toBe("access_denied");
    expect(store.rows.size).toBe(0);
    expect(jev.calls).toBe(0);
    expect(store.indexed).toEqual([]);
  });

  it("py: tests/test_evidence.py::test_processor_grants_are_independent", async () => {
    const { engine, store, jev } = setup();
    const item = regrant(makeItem(), { processors: ["turbopuffer"] });
    const result = (await engine.ingest(batch(item)))[0];
    expect(result.assessment_ready).toBe(false);
    expect(result.index_ready).toBe(false);
    expect((await engine.inspect(lid(item))).source).toEqual(item.source);
    expect(jev.calls).toBe(0);
    expect(store.indexed).toEqual([]);
  });

  // py: tests/test_evidence.py::test_revocation_is_saved_even_on_an_older_source[change0]
  // py: tests/test_evidence.py::test_revocation_is_saved_even_on_an_older_source[change1]
  // py: tests/test_evidence.py::test_revocation_is_saved_even_on_an_older_source[change2]
  it.each([{ readers: [] }, { revoked: true }, { processors: [] }])("revocation is saved even on an older source %o", async (change) => {
    const { engine, store, jev, item } = setup();
    await engine.ingest(batch(item));
    const older = changed(item, { text: "An older synthetic revision", updated_at: addMicros(item.source.updated_at, -DAY) });
    const revoked = regrant(older, change);
    expect((await engine.ingest(batch(revoked)))[0].status).toBe("access_denied");
    await expect(engine.inspect(lid(item))).rejects.toThrow(/permission/);
    store.hits = [{ logical_id: lid(item), revision_id: rid(item) }];
    expect(await engine.search("synthetic")).toEqual([]);
    expect(jev.calls).toBe(1);
  });

  it("py: tests/test_evidence.py::test_expired_reader_grant_fails_closed", async () => {
    const { engine, item } = setup();
    await engine.ingest(batch(item));
    const expired = regrant(item, { checked_at: addMicros(now(), -2n * MINUTE), expires_at: addMicros(now(), -MINUTE) });
    await engine.ingest(batch(expired));
    await expect(engine.inspect(lid(item))).rejects.toThrow(/permission/);
  });

  it("py: tests/test_evidence.py::test_newer_permission_on_older_source_is_not_discarded", async () => {
    const { engine, store, item } = setup();
    await engine.ingest(batch(item));
    const older = changed(item, { updated_at: addMicros(item.source.updated_at, -DAY) });
    const update = regrant(older, { processors: ["turbopuffer"] });
    expect((await engine.ingest(batch(update)))[0].status).toBe("older_revision_ignored");
    const head = (await store.get(headId(lid(item))))!;
    expect(head.grant.processors).toEqual(["turbopuffer"]);
    expect(head.revision_id).toBe(rid(item));
  });

  it("py: tests/test_evidence.py::test_equal_time_conflict_retains_both_revisions_and_survives_replay", async () => {
    const { engine, store, item } = setup();
    await engine.ingest(batch(item));
    const conflict = changed(item, { text: "Conflicting source content with the same source timestamp" });
    expect((await engine.ingest(batch(conflict)))[0].status).toBe("conflicting_revision");
    expect(store.rows.has(rid(conflict))).toBe(true);
    expect(store.rows.has(rid(item))).toBe(true);
    await engine.ingest(batch(item));
    await expect(engine.inspect(lid(item))).rejects.toThrow(/Conflicting/);
    const newer = changed(item, { text: "Reconciled later source", updated_at: addMicros(item.source.updated_at, HOUR) });
    await engine.ingest(batch(newer));
    expect((await engine.inspect(lid(item))).source).toEqual(newer.source);
  });

  it("py: tests/test_evidence.py::test_conflicted_source_does_not_block_other_resumable_records", async () => {
    const { engine, jev, item } = setup();
    await engine.ingest(batch(item));
    await engine.ingest(batch(changed(item, { text: "Conflicting version" })));
    const other = changed(item, { native_id: "issue-2" });
    jev.fail = true;
    await engine.ingest(batch(other));
    jev.fail = false;
    const results = await engine.resume();
    expect(results.length).toBe(2);
    expect(results.some((row) => row.assessment_ready)).toBe(true);
    expect(results.some((row) => row.errors?.length)).toBe(true);
  });

  it("py: tests/test_evidence.py::test_changed_revision_reassessed_and_stale_search_hit_does_not_return", async () => {
    const { engine, store, jev, item } = setup();
    await engine.ingest(batch(item));
    const newer = changed(item, { text: "A later synthetic update", updated_at: addMicros(item.source.updated_at, HOUR) });
    await engine.ingest(batch(newer));
    store.hits = [{ logical_id: lid(item), revision_id: rid(item) }];
    expect(await engine.search("synthetic")).toEqual([]);
    expect(jev.calls).toBe(2);
    expect((await engine.inspect(lid(item))).assessment!.source_revision).toBe(rid(newer));
  });

  it("py: tests/test_evidence.py::test_assessment_from_wrong_revision_is_rejected", async () => {
    const { engine, store, item } = setup();
    await engine.ingest(batch(item));
    const head = (await store.get(headId(lid(item))))!;
    store.rows.get(head.assessment_id)!.source_revision = "wrong";
    await expect(engine.inspect(lid(item))).rejects.toThrow(/mismatch/);
  });

  it("py: tests/test_evidence.py::test_query_requires_its_own_processing_permission", async () => {
    const { store, jev } = setup();
    const engine = new Evidence(makeSettings({ query_processors: [] }), store, jev);
    await expect(engine.search("synthetic")).rejects.toThrow(/not permitted/);
  });

  // py: tests/test_evidence.py::test_observed_sources_require_scope_and_keep_snapshot_binding_on_replay[slack-thread]
  // py: tests/test_evidence.py::test_observed_sources_require_scope_and_keep_snapshot_binding_on_replay[hibob-calendar_snapshot]
  // py: tests/test_evidence.py::test_observed_sources_require_scope_and_keep_snapshot_binding_on_replay[github-pull_request]
  // py: tests/test_evidence.py::test_observed_sources_require_scope_and_keep_snapshot_binding_on_replay[github-team_membership]
  it.each([
    ["slack", "thread"],
    ["hibob", "calendar_snapshot"],
    ["github", "pull_request"],
    ["github", "team_membership"],
  ])("observed sources require scope and keep snapshot binding on replay [%s-%s]", async (connector, kind) => {
    const { engine, store, jev, item } = setup();
    const snapshot = changed(item, { connector, kind, timestamp_basis: "observation", updated_at: item.source.observed_at });
    await expect(engine.ingest(batch(snapshot))).rejects.toThrow(/configured source scope/);
    expect(store.rows.size).toBe(0);
    expect(jev.calls).toBe(0);
    const scoped = new Evidence(makeSettings({ source_scopes: [`${connector}:public`] }), store, jev);
    await scoped.ingest(batch(snapshot));
    await scoped.ingest(batch(snapshot));
    const retrieved = await scoped.inspect(lid(snapshot));
    expect(retrieved.source).toEqual(snapshot.source);
    expect(retrieved.source.timestamp_basis).toBe("observation");
    expect(retrieved.assessment!.source_revision).toBe(rid(snapshot));
    expect(jev.calls).toBe(1);
    expect(store.indexed.length).toBe(1);
  });
});
