from datetime import timedelta

import pytest
from conftest import batch

from crowbo.contracts import SourceRevision, now
from crowbo.evidence import Evidence, head_id
from crowbo.runtime import CrowboError


def changed(item, **fields):
    return item.model_copy(
        update={"source": SourceRevision.model_validate({**item.source.model_dump(), **fields})}
    )


def regrant(item, **fields):
    return item.model_copy(update={"grant": item.grant.model_copy(update={"checked_at": now(), **fields})})


@pytest.mark.parametrize("failure", ["missing_head", "missing_assessment", "revoked", "changed_during_read"])
def test_batch_read_checks_every_source_and_fresh_permissions(engine, item, failure, monkeypatch):
    second = changed(item, native_id="second")
    engine.ingest(batch(item, second))
    key = head_id(second.source.logical_id)
    head = engine.store.rows[key]
    if failure == "missing_head":
        del engine.store.rows[key]
    elif failure == "missing_assessment":
        del engine.store.rows[head["assessment_id"]]
    elif failure == "revoked":
        head["grant"]["revoked"] = True
    else:
        read = engine.store.get_many

        def revoke_after_payload(keys):
            result = read(keys)
            if second.source.revision_id in keys:
                head["grant"]["revoked"] = True
            return result

        monkeypatch.setattr(engine.store, "get_many", revoke_after_payload)
    with pytest.raises(CrowboError):
        engine.inspect_many([item.source.logical_id, second.source.logical_id])


def test_ingestion_retrieval_keeps_exact_assessment_and_retry_is_idempotent(engine, item):
    result = engine.ingest(batch(item))[0]
    assert result["assessment_ready"] and result["index_ready"]
    first = engine.inspect(item.source.logical_id)
    engine.ingest(batch(item))
    second = engine.inspect(item.source.logical_id)
    assert first.assessment == second.assessment
    assert second.assessment.source_revision == item.source.revision_id
    assert engine.jev.calls == 1 and len(engine.store.indexed) == 1


def test_jev_failure_keeps_source_and_embedding_and_new_process_can_resume(engine, item):
    engine.jev.fail = True
    result = engine.ingest(batch(item))[0]
    assert not result["assessment_ready"] and result["index_ready"]
    assert engine.inspect(item.source.logical_id).source == item.source
    engine.jev.fail = False
    restarted = Evidence(engine.settings, engine.store, engine.jev)
    assert restarted.resume()[0]["assessment_ready"]
    assert len(engine.store.indexed) == 1


def test_embedding_failure_keeps_assessment_and_resume_does_not_repeat_jev(engine, item):
    engine.store.fail_index = True
    result = engine.ingest(batch(item))[0]
    assert result["assessment_ready"] and not result["index_ready"]
    assessed = engine.inspect(item.source.logical_id).assessment
    engine.store.fail_index = False
    assert engine.resume()[0]["index_ready"]
    assert engine.inspect(item.source.logical_id).assessment == assessed
    assert engine.jev.calls == 1


def test_wrong_tenant_preflights_entire_batch_before_writes(engine, item):
    other = changed(item, tenant="other", native_id="other")
    with pytest.raises(CrowboError, match="outside"):
        engine.ingest(batch(item, other))
    assert not engine.store.rows and not engine.jev.calls


@pytest.mark.parametrize("change", [{"readers": ()}, {"revoked": True}, {"processors": ()}])
def test_denied_first_import_never_sends_payload(engine, item, change):
    item = regrant(item, **change)
    assert engine.ingest(batch(item))[0]["status"] == "access_denied"
    assert not engine.store.rows and not engine.jev.calls and not engine.store.indexed


def test_processor_grants_are_independent(engine, item):
    item = regrant(item, processors=("turbopuffer",))
    result = engine.ingest(batch(item))[0]
    assert not result["assessment_ready"] and not result["index_ready"]
    assert engine.inspect(item.source.logical_id).source == item.source
    assert not engine.jev.calls and not engine.store.indexed


@pytest.mark.parametrize("change", [{"readers": ()}, {"revoked": True}, {"processors": ()}])
def test_revocation_is_saved_even_on_an_older_source(engine, item, change):
    engine.ingest(batch(item))
    older = changed(
        item, text="An older synthetic revision", updated_at=item.source.updated_at - timedelta(days=1)
    )
    revoked = regrant(older, **change)
    assert engine.ingest(batch(revoked))[0]["status"] == "access_denied"
    with pytest.raises(CrowboError, match="permission"):
        engine.inspect(item.source.logical_id)
    engine.store.hits = [{"logical_id": item.source.logical_id, "revision_id": item.source.revision_id}]
    assert engine.search("synthetic") == []
    assert engine.jev.calls == 1


def test_expired_reader_grant_fails_closed(engine, item):
    engine.ingest(batch(item))
    expired = regrant(item, checked_at=now() - timedelta(minutes=2), expires_at=now() - timedelta(minutes=1))
    engine.ingest(batch(expired))
    with pytest.raises(CrowboError, match="permission"):
        engine.inspect(item.source.logical_id)


def test_newer_permission_on_older_source_is_not_discarded(engine, item):
    engine.ingest(batch(item))
    older = changed(item, updated_at=item.source.updated_at - timedelta(days=1))
    update = regrant(older, processors=("turbopuffer",))
    assert engine.ingest(batch(update))[0]["status"] == "older_revision_ignored"
    head = engine.store.get(head_id(item.source.logical_id))
    assert head["grant"]["processors"] == ["turbopuffer"]
    assert head["revision_id"] == item.source.revision_id


def test_equal_time_conflict_retains_both_revisions_and_survives_replay(engine, item):
    engine.ingest(batch(item))
    conflict = changed(item, text="Conflicting source content with the same source timestamp")
    assert engine.ingest(batch(conflict))[0]["status"] == "conflicting_revision"
    assert conflict.source.revision_id in engine.store.rows
    assert item.source.revision_id in engine.store.rows
    engine.ingest(batch(item))
    with pytest.raises(CrowboError, match="Conflicting"):
        engine.inspect(item.source.logical_id)
    newer = changed(
        item, text="Reconciled later source", updated_at=item.source.updated_at + timedelta(hours=1)
    )
    engine.ingest(batch(newer))
    assert engine.inspect(item.source.logical_id).source == newer.source


def test_conflicted_source_does_not_block_other_resumable_records(engine, item):
    engine.ingest(batch(item))
    engine.ingest(batch(changed(item, text="Conflicting version")))
    other = changed(item, native_id="issue-2")
    engine.jev.fail = True
    engine.ingest(batch(other))
    engine.jev.fail = False
    results = engine.resume()
    assert len(results) == 2
    assert any(row.get("assessment_ready") for row in results)
    assert any(row.get("errors") for row in results)


def test_changed_revision_reassessed_and_stale_search_hit_does_not_return(engine, item):
    engine.ingest(batch(item))
    newer = changed(
        item, text="A later synthetic update", updated_at=item.source.updated_at + timedelta(hours=1)
    )
    engine.ingest(batch(newer))
    engine.store.hits = [{"logical_id": item.source.logical_id, "revision_id": item.source.revision_id}]
    assert engine.search("synthetic") == []
    assert engine.jev.calls == 2
    assert engine.inspect(item.source.logical_id).assessment.source_revision == newer.source.revision_id


def test_assessment_from_wrong_revision_is_rejected(engine, item):
    engine.ingest(batch(item))
    head = engine.store.get(head_id(item.source.logical_id))
    engine.store.rows[head["assessment_id"]]["source_revision"] = "wrong"
    with pytest.raises(CrowboError, match="mismatch"):
        engine.inspect(item.source.logical_id)


def test_query_requires_its_own_processing_permission(engine):
    engine.settings = engine.settings.model_copy(update={"query_processors": ()})
    with pytest.raises(CrowboError, match="not permitted"):
        engine.search("synthetic")


@pytest.mark.parametrize(
    "connector,kind",
    [
        ("slack", "thread"),
        ("hibob", "calendar_snapshot"),
        ("github", "pull_request"),
        ("github", "team_membership"),
    ],
)
def test_observed_sources_require_scope_and_keep_snapshot_binding_on_replay(engine, item, connector, kind):
    snapshot = changed(
        item,
        connector=connector,
        kind=kind,
        timestamp_basis="observation",
        updated_at=item.source.observed_at,
    )
    with pytest.raises(CrowboError, match="configured source scope"):
        engine.ingest(batch(snapshot))
    assert not engine.store.rows and engine.jev.calls == 0
    engine.settings = engine.settings.model_copy(update={"source_scopes": (f"{connector}:public",)})
    engine.ingest(batch(snapshot))
    engine.ingest(batch(snapshot))
    retrieved = engine.inspect(snapshot.source.logical_id)
    assert retrieved.source == snapshot.source
    assert retrieved.source.timestamp_basis == "observation"
    assert retrieved.assessment.source_revision == snapshot.source.revision_id
    assert engine.jev.calls == 1 and len(engine.store.indexed) == 1
