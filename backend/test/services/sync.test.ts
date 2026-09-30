// Port of tests/test_sync.py. All Slack records are synthetic.
import { afterEach, describe, expect, it, vi } from "vitest";
import { logicalId, revisionId } from "../../src/domain/contracts";
import { CrowboError } from "../../src/domain/errors";
import { reviewRequest } from "../../src/domain/review";
import { type Instant, SECOND } from "../../src/domain/time";
import type { FetchLike } from "../../src/providers/http";
import {
  CaptureReader,
  mcpCapture,
  SlackReader,
  SlackReadError,
  type SlackSpec,
  slackSpec,
  type SlackTarget,
  type ThreadReader,
  type ThreadSnapshot,
  threadSnapshot,
} from "../../src/providers/slack";
import type { Evidence } from "../../src/services/evidence";
import { headId } from "../../src/services/evidence";
import { Reasoner, Review } from "../../src/services/review";
import { scopeVersions, SlackSync } from "../../src/services/sync";
import { addMicros, batch, HOUR, makeEngine, makeItem, makeSettings, MemoryLedger, type MemoryStore, now, withGrant } from "../helpers";

const MODEL = "openai/gpt-6-luna";

/**
 * JavaScript clocks have millisecond resolution; Python's `now()` has microseconds, so two
 * consecutive Python captures never share a timestamp. Wait for the clock to move on where
 * the Python test relies on that.
 */
async function nextInstant(): Promise<void> {
  const start = Date.now();
  while (Date.now() === start) await new Promise((resolve) => setTimeout(resolve, 1));
}

function spec(changes: Record<string, unknown> = {}): SlackSpec {
  return slackSpec.parse({
    name: "synthetic-commitment",
    workspace: "public",
    team_id: "T00000000",
    user_id: "U00000000",
    targets: [{ channel_id: "C00000000", message_ts: "1790000000.000001", title: "Synthetic thread" }],
    processors: ["turbopuffer", "jev", "voyage", MODEL],
    ...changes,
  });
}

/** Mutable upstream for behavioural tests; all records are synthetic. */
class Reader implements ThreadReader {
  text = "Synthetic owner requests a review. No deadline has been stated.";
  at: Instant = addMicros(now(), -5n * SECOND);
  unavailable = false;
  error: Error | null = null;

  async authenticate(_: SlackSpec): Promise<void> {}

  async read(target: SlackTarget): Promise<ThreadSnapshot> {
    if (this.error) throw this.error;
    return threadSnapshot.parse({
      native_id: `${target.channel_id}:${target.message_ts}`,
      checked_at: this.at,
      text: this.unavailable ? null : this.text,
      unavailable: this.unavailable,
      method: "slack_api",
    });
  }
}

function configured(changes: Record<string, unknown> = {}) {
  const { engine, store, jev } = makeEngine(makeSettings({ source_scopes: ["slack:public"], query_processors: ["turbopuffer", "voyage", MODEL] }));
  const reader = new Reader();
  return { sync: new SlackSync(engine, spec(changes), reader), reader, engine, store: engine.store as MemoryStore, jev };
}

/** tests/test_review.py::response */
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

/** tests/test_review.py::reasoner */
function reasoner(engine: Evidence, handler: () => Response) {
  return new Reasoner(
    { account: engine.settings.cloudflare_account, gateway: engine.settings.gateway, token: "test-token", fetch: async () => handler() },
    new MemoryLedger(),
    engine.settings.query_processors,
  );
}

const json = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const secondTarget = { channel_id: "C00000001", message_ts: "1790000001.000001", title: "Second synthetic thread" };

afterEach(() => {
  vi.useRealTimers();
});

describe("slack sync", () => {
  it("py: tests/test_sync.py::test_unchanged_refresh_preserves_revision_assessment_and_vectors", async () => {
    const { sync, reader, engine, store, jev } = configured();
    const first = await sync.run();
    const key = first.sources![0].logical_id;
    const view = await engine.inspect(key);
    reader.at = now();
    const refreshed = await sync.run({ force: true });
    const current = await engine.inspect(key);
    expect(first.status).toBe("ready");
    expect(refreshed.status).toBe("ready");
    expect(refreshed.changed).toBe(false);
    expect(revisionId(current.source)).toBe(revisionId(view.source));
    expect(current.assessment).toEqual(view.assessment);
    expect(current.last_checked_at).toBe(reader.at);
    expect(jev.calls).toBe(1);
    expect(store.indexed.length).toBe(1);
    expect(current.index_ready).toBe(true);
    expect((await sync.run()).status).toBe("not_due");
  });

  it("py: tests/test_sync.py::test_changed_reply_reassesses_and_keeps_old_revision", async () => {
    const { sync, reader, engine, store, jev } = configured();
    const first = (await sync.run()).sources![0];
    reader.at = now();
    reader.text = "Synthetic owner now confirms Friday as the non-deferrable deadline.";
    const changed = await sync.run({ force: true });
    const view = await engine.inspect(first.logical_id);
    expect(changed.changed).toBe(true);
    expect(view.source.text).toBe(reader.text);
    expect(revisionId(view.source)).not.toBe(first.revision_id);
    expect((await store.get(first.revision_id))!.text.startsWith("Synthetic owner requests")).toBe(true);
    expect(jev.calls).toBe(2);
    expect(store.indexed.length).toBe(2);
    expect((await engine.head(first.logical_id))!.generation).toBe(2);
  });

  it("py: tests/test_sync.py::test_delete_revokes_history_and_reappearance_gets_a_new_generation", async () => {
    const { sync, reader, engine, jev } = configured();
    const key = (await sync.run()).sources![0].logical_id;
    expect((await engine.inspect(key)).index_ready).toBe(true);
    reader.unavailable = true;
    reader.at = now();
    expect((await sync.run({ force: true })).status).toBe("ready");
    await expect(engine.inspect(key)).rejects.toThrow(/permission/);
    expect((await engine.head(key))!.withdrawn).toBe(true);
    await nextInstant();
    reader.unavailable = false;
    reader.at = now();
    expect((await sync.run({ force: true })).status).toBe("ready");
    expect((await engine.inspect(key)).index_ready).toBe(true);
    expect((await engine.head(key))!.generation).toBe(2);
    expect(jev.calls).toBe(1);
  });

  it("py: tests/test_sync.py::test_rate_limit_preserves_access_check_and_backoff_survives_restart", async () => {
    const { sync, reader, engine } = configured();
    const key = (await sync.run()).sources![0].logical_id;
    const original = (await engine.head(key))!.grant;
    reader.error = new SlackReadError("Slack rate limit; retry is scheduled", 120);
    const result = await sync.run({ force: true });
    expect(result.status).toBe("failed");
    expect((await engine.head(key))!.grant).toEqual(original);
    const restarted = new SlackSync(engine, sync.spec, reader);
    const waiting = await restarted.run({ force: true });
    expect(waiting.status).toBe("not_due");
    expect(waiting.errors).toEqual(["Slack rate limit; retry is scheduled"]);
    expect(await scopeVersions(engine, [sync.identifier])).toEqual({ [sync.identifier]: null });
  });

  it("py: tests/test_sync.py::test_failed_preparation_resumes_without_reclassifying", async () => {
    const { sync, store, jev } = configured();
    store.failIndex = true;
    const failed = await sync.run();
    expect(failed.status).toBe("failed");
    expect(failed.sources![0].assessment_ready).toBe(true);
    store.failIndex = false;
    // Replay the identical capture, including timestamps and omitted default fields.
    expect((await sync.run({ force: true })).status).toBe("ready");
    expect(jev.calls).toBe(1);
    expect(store.indexed.length).toBe(1);
  });

  it("py: tests/test_sync.py::test_older_capture_cannot_overwrite_newer_content", async () => {
    const { sync, reader, engine } = configured();
    const key = (await sync.run()).sources![0].logical_id;
    reader.at = addMicros(reader.at, -SECOND);
    reader.text = "An older synthetic assertion.";
    expect((await sync.run({ force: true })).status).toBe("failed");
    expect((await engine.inspect(key)).source.text).toBe("Synthetic owner requests a review. No deadline has been stated.");
  });

  it("py: tests/test_sync.py::test_old_generation_search_hit_cannot_mask_a_newer_reactivated_source", async () => {
    const { sync, reader, engine, store } = configured();
    const outcome = (await sync.run()).sources![0];
    const key = outcome.logical_id;
    reader.unavailable = true;
    reader.at = now();
    await sync.run({ force: true });
    await nextInstant();
    reader.unavailable = false;
    reader.at = now();
    await sync.run({ force: true });
    store.hits = [{ logical_id: key, revision_id: outcome.revision_id, generation: 1 }];
    expect(await engine.search("Synthetic", "keyword")).toEqual([]);
    store.hits.push({ logical_id: key, revision_id: outcome.revision_id, generation: 2 });
    expect((await engine.search("Synthetic", "keyword")).map((v) => v.source.text)).toEqual([
      "Synthetic owner requests a review. No deadline has been stated.",
    ]);
  });

  it("py: tests/test_sync.py::test_review_freshness_includes_uncited_members_of_its_selected_scope", async () => {
    const targets = [...spec().targets, secondTarget];
    const { sync, reader, engine } = configured({ targets });
    const key = (await sync.run()).sources![0].logical_id;
    const citedRevision = (await engine.head(key))!.revision_id;
    const model = reasoner(engine, () => json(200, response()));
    const request = reviewRequest.parse({ question: "What should happen next?", source_ids: [key], model: MODEL, reasoning_effort: "high" });
    const reviewed = await new Review(engine, model).run(request);
    expect(reviewed.evidence_unchanged).toBe(true);
    reader.at = now();
    const original = reader.read.bind(reader);
    reader.read = async (target: SlackTarget) => {
      const snapshot = await original(target);
      return target.channel_id === "C00000001" ? { ...snapshot, text: "Additional synthetic deadline." } : snapshot;
    };
    expect((await sync.run({ force: true })).status).toBe("ready");
    expect((await engine.head(key))!.revision_id).toBe(citedRevision);
    expect((await new Review(engine, null).inspect(reviewed.id)).evidence_unchanged).toBe(false);
  });

  it("py: tests/test_sync.py::test_overdue_sync_blocks_new_reasoning_and_marks_history", async () => {
    const { sync, engine } = configured();
    const key = (await sync.run()).sources![0].logical_id;
    const model = reasoner(engine, () => json(200, response()));
    const request = reviewRequest.parse({ question: "What next?", source_ids: [key], model: MODEL, reasoning_effort: "high" });
    const result = await new Review(engine, model).run(request);
    expect(result.evidence_unchanged).toBe(true);
    // Python patches only `crowbo.sync.now`; the TS clock is global, so every check sees +2h.
    // Grants last 24h, so only the 1h sync freshness is affected, as in the Python test.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + Number(HOUR / 1000n) * 2);
    expect((await new Review(engine, null).inspect(result.id)).evidence_unchanged).toBe(false);
    await expect(new Review(engine, model).run(request)).rejects.toThrow(/overdue/);
  });

  it("py: tests/test_sync.py::test_legacy_head_can_be_refreshed_without_a_cas_conflict", async () => {
    const { engine, store } = makeEngine();
    const item = makeItem();
    await engine.ingest(batch(item));
    const key = headId(logicalId(item.source));
    const row = store.rows.get(key)!;
    for (const field of ["generation", "last_checked_at", "index_grant_hash", "sync_id", "withdrawn"]) delete row[field];
    const [result] = await engine.ingest(batch(item));
    expect(result.assessment_ready).toBe(true);
    expect(result.index_ready).toBe(true);
  });

  it("py: tests/test_sync.py::test_removed_reader_then_restored_access_uses_a_new_generation", async () => {
    const { engine } = makeEngine();
    const item = makeItem();
    expect((await engine.ingest(batch(item)))[0].index_ready).toBe(true);
    const denied = withGrant(item, { readers: [], checked_at: now() });
    expect((await engine.ingest(batch(denied)))[0].status).toBe("access_denied");
    await nextInstant();
    const restored = withGrant(item, { checked_at: now() });
    expect((await engine.ingest(batch(restored)))[0].index_ready).toBe(true);
    expect((await engine.head(logicalId(item.source)))!.generation).toBe(2);
  });

  it("py: tests/test_sync.py::test_scope_cannot_take_ownership_of_another_scopes_source", async () => {
    const { sync, reader, engine } = configured();
    const key = (await sync.run()).sources![0].logical_id;
    const other = new SlackSync(engine, spec({ name: "different-scope" }), reader);
    expect((await other.run()).status).toBe("failed");
    expect((await engine.inspect(key)).sync_id).toBe(sync.identifier);
  });

  it("py: tests/test_sync.py::test_known_withdrawal_cleanup_failure_blocks_access_and_is_retryable", async () => {
    const { sync, reader, engine, store } = configured();
    const key = (await sync.run()).sources![0].logical_id;
    const original = store.deleteChunks;
    store.deleteChunks = async () => {
      throw new CrowboError("Synthetic cleanup failure");
    };
    reader.unavailable = true;
    reader.at = now();
    expect((await sync.run({ force: true })).status).toBe("failed");
    await expect(engine.inspect(key)).rejects.toThrow(/permission/);
    store.deleteChunks = original;
    expect((await sync.run({ force: true })).status).toBe("ready");
  });

  it("py: tests/test_sync.py::test_failed_or_partial_fetch_does_not_renew_any_source", async () => {
    const { sync, reader, engine } = configured();
    const key = (await sync.run()).sources![0].logical_id;
    const checked = (await engine.inspect(key)).last_checked_at;
    reader.at = now();
    reader.error = new SlackReadError("Synthetic incomplete pagination");
    expect((await sync.run({ force: true })).status).toBe("failed");
    expect((await engine.inspect(key)).last_checked_at).toBe(checked);
    expect((await sync.status()).fresh).toBe(false);
  });

  it("py: tests/test_sync.py::test_known_revocation_is_applied_even_when_another_thread_read_fails", async () => {
    const targets = [...spec().targets, secondTarget];
    const { sync, reader, engine } = configured({ targets });
    const key = (await sync.run()).sources![0].logical_id;
    reader.unavailable = true;
    reader.at = now();
    const original = reader.read.bind(reader);
    reader.read = async (target: SlackTarget) => {
      if (target.channel_id === "C00000001") throw new SlackReadError("Synthetic partial read");
      return original(target);
    };
    expect((await sync.run({ force: true })).status).toBe("failed");
    await expect(engine.inspect(key)).rejects.toThrow(/permission/);
  });

  it("py: tests/test_sync.py::test_slack_paginates_checks_identity_and_removes_deleted_replies", async () => {
    const calls: string[] = [];
    const respond: FetchLike = async (input) => {
      const url = new URL(input);
      calls.push(url.pathname);
      if (url.pathname.endsWith("auth.test")) return json(200, { ok: true, team_id: "T00000000", user_id: "U00000000" });
      const parent = { ts: "1790000000.000001", text: "Synthetic parent", reply_count: 1 };
      if (!url.searchParams.get("cursor")) {
        return json(200, { ok: true, messages: [parent], has_more: true, response_metadata: { next_cursor: "page2" } });
      }
      return json(200, { ok: true, messages: [{ ts: "1790000001.000002", text: "Remaining synthetic reply" }], has_more: false });
    };
    const reader = new SlackReader(new MemoryLedger(), "synthetic-token", respond);
    await reader.authenticate(spec());
    const snapshot = await reader.read(spec().targets[0]);
    expect(JSON.parse(snapshot.text!).map((m: { text: string }) => m.text)).toEqual(["Synthetic parent", "Remaining synthetic reply"]);
    expect(snapshot.unavailable).toBe(false);
    expect(calls.length).toBe(3);
  });

  const readFailures = [
    ["py: tests/test_sync.py::test_incomplete_slack_reads_never_become_deletions[partial]", "partial"],
    ["py: tests/test_sync.py::test_incomplete_slack_reads_never_become_deletions[count]", "count"],
    ["py: tests/test_sync.py::test_incomplete_slack_reads_never_become_deletions[rate_limit]", "rate_limit"],
    ["py: tests/test_sync.py::test_incomplete_slack_reads_never_become_deletions[server]", "server"],
    ["py: tests/test_sync.py::test_incomplete_slack_reads_never_become_deletions[wrong_identity]", "wrong_identity"],
    ["py: tests/test_sync.py::test_incomplete_slack_reads_never_become_deletions[cursor_cycle]", "cursor_cycle"],
  ] as const;
  it.each(readFailures)("%s", async (_id, failure) => {
    const respond: FetchLike = async () => {
      if (failure === "wrong_identity") return json(200, { ok: true, team_id: "T99999999", user_id: "U00000000" });
      if (failure === "rate_limit") return json(429, undefined, { "retry-after": "120" });
      if (failure === "server") return json(503);
      const body: Record<string, unknown> = {
        ok: true,
        messages: [{ ts: "1790000000.000001", text: "Synthetic parent", reply_count: 2 }],
      };
      if (failure === "partial") body.has_more = true;
      if (failure === "cursor_cycle") body.response_metadata = { next_cursor: "same" };
      return json(200, body);
    };
    const reader = new SlackReader(new MemoryLedger(), "synthetic-token", respond);
    const attempt = failure === "wrong_identity" ? reader.authenticate(spec()) : reader.read(spec().targets[0]);
    await expect(attempt).rejects.toBeInstanceOf(SlackReadError);
  });

  it("py: tests/test_sync.py::test_mcp_capture_requires_complete_requested_thread_and_uses_actual_check_time", async () => {
    const config = spec();
    const capture = mcpCapture.parse({
      workspace: config.workspace,
      team_id: config.team_id,
      user_id: config.user_id,
      channel_id: config.targets[0].channel_id,
      message_ts: config.targets[0].message_ts,
      checked_at: now(),
      messages:
        "=== THREAD PARENT MESSAGE ===\nFrom: Synthetic owner\nTime: synthetic\nMessage TS: 1790000000.000001\nSynthetic content",
      pagination_info: "There are no more messages in this thread.\n",
    });
    const reader = new CaptureReader([capture]);
    await reader.authenticate(config);
    const snapshot = await reader.read(config.targets[0]);
    expect(snapshot.text!.endsWith("Synthetic content")).toBe(true);
    expect(snapshot.checked_at).toBe(capture.checked_at);
    const partial = new CaptureReader([{ ...capture, pagination_info: "More messages available" }]);
    await expect(partial.read(config.targets[0])).rejects.toThrow(/complete/);
  });
});
