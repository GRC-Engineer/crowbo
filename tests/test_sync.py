import json
from datetime import timedelta

import httpx
import pytest
from test_review import MODEL, close, reasoner, response

from crowbo.contracts import now
from crowbo.evidence import head_id
from crowbo.review import Review, ReviewRequest
from crowbo.runtime import CrowboError, Runtime
from crowbo.slack import CaptureReader, MCPCapture, SlackReader, SlackReadError, SlackSpec, ThreadSnapshot
from crowbo.sync import SlackSync, scope_versions


def spec(**changes):
    return SlackSpec.model_validate(
        {
            "name": "synthetic-commitment",
            "workspace": "public",
            "team_id": "T00000000",
            "user_id": "U00000000",
            "targets": [
                {"channel_id": "C00000000", "message_ts": "1790000000.000001", "title": "Synthetic thread"}
            ],
            "processors": ["turbopuffer", "jev", "voyage", MODEL],
            **changes,
        }
    )


class Reader:
    """Mutable upstream for behavioural tests; all records are synthetic."""

    def __init__(self):
        self.text = "Synthetic owner requests a review. No deadline has been stated."
        self.at = now() - timedelta(seconds=5)
        self.unavailable = False
        self.error = None

    def authenticate(self, _):
        pass

    def read(self, target):
        if self.error:
            raise self.error
        return ThreadSnapshot(
            native_id=target.native_id,
            checked_at=self.at,
            text=None if self.unavailable else self.text,
            unavailable=self.unavailable,
            method="slack_api",
        )


def configured(engine, **changes):
    engine.settings = engine.settings.model_copy(
        update={"source_scopes": ("slack:public",), "query_processors": ("turbopuffer", "voyage", MODEL)}
    )
    reader = Reader()
    return SlackSync(engine, spec(**changes), reader), reader


def test_unchanged_refresh_preserves_revision_assessment_and_vectors(engine):
    sync, reader = configured(engine)
    first = sync.run()
    key = first["sources"][0]["logical_id"]
    view = engine.inspect(key)
    reader.at = now()
    refreshed = sync.run(force=True)
    current = engine.inspect(key)
    assert first["status"] == refreshed["status"] == "ready"
    assert refreshed["changed"] is False
    assert current.source.revision_id == view.source.revision_id
    assert current.assessment == view.assessment
    assert current.last_checked_at == reader.at
    assert engine.jev.calls == 1 and len(engine.store.indexed) == 1
    assert current.index_ready is True
    assert sync.run()["status"] == "not_due"


def test_changed_reply_reassesses_and_keeps_old_revision(engine):
    sync, reader = configured(engine)
    first = sync.run()["sources"][0]
    reader.at = now()
    reader.text = "Synthetic owner now confirms Friday as the non-deferrable deadline."
    changed = sync.run(force=True)
    view = engine.inspect(first["logical_id"])
    assert changed["changed"] is True and view.source.text == reader.text
    assert view.source.revision_id != first["revision_id"]
    assert engine.store.get(first["revision_id"])["text"].startswith("Synthetic owner requests")
    assert engine.jev.calls == 2 and len(engine.store.indexed) == 2
    assert engine._head(first["logical_id"]).generation == 2


def test_delete_revokes_history_and_reappearance_gets_a_new_generation(engine):
    sync, reader = configured(engine)
    key = sync.run()["sources"][0]["logical_id"]
    assert engine.inspect(key).index_ready is True
    reader.unavailable, reader.at = True, now()
    assert sync.run(force=True)["status"] == "ready"
    with pytest.raises(CrowboError, match="permission"):
        engine.inspect(key)
    assert engine._head(key).withdrawn is True
    reader.unavailable, reader.at = False, now()
    assert sync.run(force=True)["status"] == "ready"
    assert engine.inspect(key).index_ready is True
    assert engine._head(key).generation == 2
    assert engine.jev.calls == 1


def test_rate_limit_preserves_access_check_and_backoff_survives_restart(engine):
    sync, reader = configured(engine)
    key = sync.run()["sources"][0]["logical_id"]
    original = engine._head(key).grant
    reader.error = SlackReadError("Slack rate limit; retry is scheduled", 120)
    result = sync.run(force=True)
    assert result["status"] == "failed"
    assert engine._head(key).grant == original
    restarted = SlackSync(engine, sync.spec, reader)
    waiting = restarted.run(force=True)
    assert waiting["status"] == "not_due"
    assert waiting["errors"] == ["Slack rate limit; retry is scheduled"]
    assert scope_versions(engine, [sync.identifier]) == {sync.identifier: None}


def test_failed_preparation_resumes_without_reclassifying(engine):
    sync, _ = configured(engine)
    engine.store.fail_index = True
    failed = sync.run()
    assert failed["status"] == "failed" and failed["sources"][0]["assessment_ready"] is True
    engine.store.fail_index = False
    # Replay the identical capture, including timestamps and omitted default fields.
    assert sync.run(force=True)["status"] == "ready"
    assert engine.jev.calls == 1 and len(engine.store.indexed) == 1


def test_older_capture_cannot_overwrite_newer_content(engine):
    sync, reader = configured(engine)
    key = sync.run()["sources"][0]["logical_id"]
    reader.at -= timedelta(seconds=1)
    reader.text = "An older synthetic assertion."
    assert sync.run(force=True)["status"] == "failed"
    assert (
        engine.inspect(key).source.text == "Synthetic owner requests a review. No deadline has been stated."
    )


def test_old_generation_search_hit_cannot_mask_a_newer_reactivated_source(engine):
    sync, reader = configured(engine)
    outcome = sync.run()["sources"][0]
    key = outcome["logical_id"]
    reader.unavailable, reader.at = True, now()
    sync.run(force=True)
    reader.unavailable, reader.at = False, now()
    sync.run(force=True)
    engine.store.hits = [{"logical_id": key, "revision_id": outcome["revision_id"], "generation": 1}]
    assert engine.search("Synthetic", "keyword") == []
    engine.store.hits.append({"logical_id": key, "revision_id": outcome["revision_id"], "generation": 2})
    assert [v.source.text for v in engine.search("Synthetic", "keyword")] == [
        "Synthetic owner requests a review. No deadline has been stated."
    ]


def test_review_freshness_includes_uncited_members_of_its_selected_scope(engine):
    targets = [
        *spec().model_dump()["targets"],
        {"channel_id": "C00000001", "message_ts": "1790000001.000001", "title": "Second synthetic thread"},
    ]
    sync, reader = configured(engine, targets=targets)
    key = sync.run()["sources"][0]["logical_id"]
    cited_revision = engine.inspect(key).source.revision_id
    model = reasoner(engine, lambda _: httpx.Response(200, json=response()))
    try:
        request = ReviewRequest(
            question="What should happen next?", source_ids=(key,), model=MODEL, reasoning_effort="high"
        )
        reviewed = Review(engine, model).run(request)
        assert reviewed["evidence_unchanged"] is True
        reader.at = now()
        original = reader.read

        def read(target):
            snapshot = original(target)
            return (
                snapshot.model_copy(update={"text": "Additional synthetic deadline."})
                if target.channel_id == "C00000001"
                else snapshot
            )

        reader.read = read
        assert sync.run(force=True)["status"] == "ready"
        assert engine.inspect(key).source.revision_id == cited_revision
        assert Review(engine, None).inspect(reviewed["id"])["evidence_unchanged"] is False
    finally:
        close(model)


def test_overdue_sync_blocks_new_reasoning_and_marks_history(engine, monkeypatch):
    sync, _ = configured(engine)
    key = sync.run()["sources"][0]["logical_id"]
    model = reasoner(engine, lambda _: httpx.Response(200, json=response()))
    try:
        request = ReviewRequest(
            question="What next?", source_ids=(key,), model=MODEL, reasoning_effort="high"
        )
        result = Review(engine, model).run(request)
        assert result["evidence_unchanged"] is True
        monkeypatch.setattr("crowbo.sync.now", lambda: now() + timedelta(hours=2))
        assert Review(engine, None).inspect(result["id"])["evidence_unchanged"] is False
        with pytest.raises(CrowboError, match="overdue"):
            Review(engine, model).run(request)
    finally:
        close(model)


def test_legacy_head_can_be_refreshed_without_a_cas_conflict(engine, item):
    from conftest import batch

    engine.ingest(batch(item))
    key = head_id(item.source.logical_id)
    for field in ("generation", "last_checked_at", "index_grant_hash", "sync_id", "withdrawn"):
        engine.store.rows[key].pop(field)
    result = engine.ingest(batch(item))[0]
    assert result["assessment_ready"] is True and result["index_ready"] is True


def test_removed_reader_then_restored_access_uses_a_new_generation(engine, item):
    from conftest import batch

    assert engine.ingest(batch(item))[0]["index_ready"] is True
    denied = item.model_copy(
        update={"grant": item.grant.model_copy(update={"readers": (), "checked_at": now()})}
    )
    assert engine.ingest(batch(denied))[0]["status"] == "access_denied"
    restored = item.model_copy(update={"grant": item.grant.model_copy(update={"checked_at": now()})})
    assert engine.ingest(batch(restored))[0]["index_ready"] is True
    assert engine._head(item.source.logical_id).generation == 2


def test_scope_cannot_take_ownership_of_another_scopes_source(engine):
    sync, reader = configured(engine)
    key = sync.run()["sources"][0]["logical_id"]
    other = SlackSync(engine, spec(name="different-scope"), reader)
    assert other.run()["status"] == "failed"
    assert engine.inspect(key).sync_id == sync.identifier


def test_known_withdrawal_cleanup_failure_blocks_access_and_is_retryable(engine, monkeypatch):
    sync, reader = configured(engine)
    key = sync.run()["sources"][0]["logical_id"]
    original = engine.store.delete_chunks

    def fail(*_):
        raise CrowboError("Synthetic cleanup failure")

    monkeypatch.setattr(engine.store, "delete_chunks", fail)
    reader.unavailable, reader.at = True, now()
    assert sync.run(force=True)["status"] == "failed"
    with pytest.raises(CrowboError, match="permission"):
        engine.inspect(key)
    monkeypatch.setattr(engine.store, "delete_chunks", original)
    assert sync.run(force=True)["status"] == "ready"


def test_failed_or_partial_fetch_does_not_renew_any_source(engine):
    sync, reader = configured(engine)
    key = sync.run()["sources"][0]["logical_id"]
    checked = engine.inspect(key).last_checked_at
    reader.at = now()
    reader.error = SlackReadError("Synthetic incomplete pagination")
    assert sync.run(force=True)["status"] == "failed"
    assert engine.inspect(key).last_checked_at == checked
    assert sync.status()["fresh"] is False


def test_known_revocation_is_applied_even_when_another_thread_read_fails(engine):
    targets = [
        *spec().model_dump()["targets"],
        {"channel_id": "C00000001", "message_ts": "1790000001.000001", "title": "Second synthetic thread"},
    ]
    sync, reader = configured(engine, targets=targets)
    key = sync.run()["sources"][0]["logical_id"]
    reader.unavailable, reader.at = True, now()
    original = reader.read

    def read(target):
        if target.channel_id == "C00000001":
            raise SlackReadError("Synthetic partial read")
        return original(target)

    reader.read = read
    assert sync.run(force=True)["status"] == "failed"
    with pytest.raises(CrowboError, match="permission"):
        engine.inspect(key)


def test_slack_paginates_checks_identity_and_removes_deleted_replies(settings):
    calls = []

    def respond(request):
        calls.append(request.url.path)
        if request.url.path.endswith("auth.test"):
            return httpx.Response(200, json={"ok": True, "team_id": "T00000000", "user_id": "U00000000"})
        parent = {"ts": "1790000000.000001", "text": "Synthetic parent", "reply_count": 1}
        if not request.url.params["cursor"]:
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "messages": [parent],
                    "has_more": True,
                    "response_metadata": {"next_cursor": "page2"},
                },
            )
        return httpx.Response(
            200,
            json={
                "ok": True,
                "messages": [{"ts": "1790000001.000002", "text": "Remaining synthetic reply"}],
                "has_more": False,
            },
        )

    runtime = Runtime(settings)
    reader = SlackReader(
        runtime, client=httpx.Client(transport=httpx.MockTransport(respond)), token="synthetic-token"
    )
    try:
        reader.authenticate(spec())
        snapshot = reader.read(spec().targets[0])
        assert [m["text"] for m in json.loads(snapshot.text)] == [
            "Synthetic parent",
            "Remaining synthetic reply",
        ]
        assert snapshot.unavailable is False
        assert len(calls) == 3
    finally:
        reader.close()
        runtime.close()


@pytest.mark.parametrize(
    "failure", ["partial", "count", "rate_limit", "server", "wrong_identity", "cursor_cycle"]
)
def test_incomplete_slack_reads_never_become_deletions(settings, failure):
    def respond(request):
        if failure == "wrong_identity":
            return httpx.Response(200, json={"ok": True, "team_id": "T99999999", "user_id": "U00000000"})
        if failure == "rate_limit":
            return httpx.Response(429, headers={"retry-after": "120"})
        if failure == "server":
            return httpx.Response(503)
        body = {
            "ok": True,
            "messages": [{"ts": "1790000000.000001", "text": "Synthetic parent", "reply_count": 2}],
        }
        if failure == "partial":
            body["has_more"] = True
        if failure == "cursor_cycle":
            body["response_metadata"] = {"next_cursor": "same"}
        return httpx.Response(200, json=body)

    runtime = Runtime(settings)
    reader = SlackReader(
        runtime, client=httpx.Client(transport=httpx.MockTransport(respond)), token="synthetic-token"
    )
    try:
        with pytest.raises(SlackReadError):
            reader.authenticate(spec()) if failure == "wrong_identity" else reader.read(spec().targets[0])
    finally:
        reader.close()
        runtime.close()


def test_mcp_capture_requires_complete_requested_thread_and_uses_actual_check_time():
    config = spec()
    capture = MCPCapture(
        workspace=config.workspace,
        team_id=config.team_id,
        user_id=config.user_id,
        channel_id=config.targets[0].channel_id,
        message_ts=config.targets[0].message_ts,
        checked_at=now(),
        messages="=== THREAD PARENT MESSAGE ===\nFrom: Synthetic owner\nTime: synthetic\nMessage TS: 1790000000.000001\nSynthetic content",
        pagination_info="There are no more messages in this thread.\n",
    )
    reader = CaptureReader([capture])
    reader.authenticate(config)
    snapshot = reader.read(config.targets[0])
    assert snapshot.text.endswith("Synthetic content") and snapshot.checked_at == capture.checked_at
    partial = CaptureReader([capture.model_copy(update={"pagination_info": "More messages available"})])
    with pytest.raises(SlackReadError, match="complete"):
        partial.read(config.targets[0])
