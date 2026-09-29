"""Synthetic audiences and mocked providers; no production identity service."""

import json
from datetime import timedelta

import httpx
import pytest
from conftest import batch
from pydantic import ValidationError
from test_evidence import changed, regrant
from test_review import MODEL, close, reasoner, response

from crowbo.contracts import Grant, now
from crowbo.evidence import Evidence, head_id
from crowbo.providers import TurbopufferStore
from crowbo.review import Review, ReviewRequest
from crowbo.runtime import CrowboError, Runtime, Settings


def context(settings, reader, groups=(), *, at=None):
    at = at or now()
    return Settings.model_validate(
        {
            **settings.model_dump(),
            "reader": reader,
            "membership": {
                "tenant": settings.tenant,
                "reader": reader,
                "groups": groups,
                "checked_at": at - timedelta(minutes=1),
                "expires_at": at + timedelta(minutes=10),
            },
        }
    )


def reader(engine, name, groups=(), *, at=None):
    return Evidence(context(engine.settings, name, groups, at=at), engine.store, engine.jev)


def hit(item):
    return {"logical_id": item.source.logical_id, "revision_id": item.source.revision_id, "generation": 1}


def test_group_member_retrieves_source_and_jev_while_outsiders_cannot(engine, item):
    item = regrant(item, reader_groups=("idp:security",))
    engine.ingest(batch(item))
    engine.store.hits = [hit(item)]
    permitted = reader(engine, "alice", ("idp:security",))
    assert permitted.search("review")[0].source.title == "Synthetic access review"
    assert (
        permitted.inspect(item.source.logical_id).assessment.answers["commitment_evidence"].choice
        == "insufficient"
    )
    assert [view.source.title for view in permitted.list_current()] == ["Synthetic access review"]
    for outsider in (reader(engine, "bob", ("idp:finance",)), reader(engine, "idp:security")):
        assert outsider.search("review") == []
        with pytest.raises(CrowboError, match="permission"):
            outsider.inspect(item.source.logical_id)
    assert engine.inspect(item.source.logical_id).source.title == "Synthetic access review"


@pytest.mark.parametrize("offset", [-timedelta(hours=2), timedelta(hours=2)])
def test_inactive_membership_denies_group_access_but_not_explicit_user_grants(engine, item, offset):
    item = regrant(item, reader_groups=("idp:security",))
    engine.ingest(batch(item))
    engine.store.hits = [hit(item)]
    allowed = reader(engine, "alice", ("idp:security",))
    assert allowed.search("review")[0].source.title == "Synthetic access review"
    denied = reader(engine, "alice", ("idp:security",), at=now() + offset)
    assert denied.search("review") == []
    with pytest.raises(CrowboError, match="permission"):
        denied.inspect(item.source.logical_id)
    direct = reader(engine, "operator", ("idp:security",), at=now() + offset)
    assert direct.inspect(item.source.logical_id).source.title == "Synthetic access review"


@pytest.mark.parametrize("field,value", [("reader", "other"), ("tenant", "other")])
def test_membership_cannot_be_rebound_to_another_identity(settings, field, value):
    valid = context(settings, "alice", ("idp:security",))
    assert valid.active_groups(now()) == ("idp:security",)
    with pytest.raises(ValidationError, match="configured tenant and reader"):
        Settings.model_validate({**valid.model_dump(), field: value})


def test_membership_has_a_short_bounded_lease(settings):
    valid = context(settings, "alice", ("idp:security",))
    data = valid.model_dump()
    data["membership"]["expires_at"] = valid.membership.checked_at + timedelta(hours=2)
    with pytest.raises(ValidationError, match="at most one hour"):
        Settings.model_validate(data)
    assert valid.active_groups(valid.membership.expires_at) == ()
    assert valid.active_groups(valid.membership.checked_at) == ("idp:security",)


def test_group_revocation_overrides_stale_index_and_does_not_repeat_models(engine, item):
    item = regrant(item, reader_groups=("idp:security",))
    engine.ingest(batch(item))
    engine.store.hits = [hit(item)]
    alice = reader(engine, "alice", ("idp:security",))
    assert alice.search("review")[0].source.title == "Synthetic access review"
    engine.ingest(batch(regrant(item, reader_groups=())))
    assert alice.search("review") == []
    with pytest.raises(CrowboError, match="permission"):
        alice.inspect(item.source.logical_id)
    assert engine.inspect(item.source.logical_id).index_ready is True
    assert engine.jev.calls == 1 and len(engine.store.indexed) == 1


def test_group_only_ingestion_and_losing_one_reader_preserves_other_readers(engine, item):
    alice = reader(engine, "alice", ("idp:security",))
    item = regrant(item, readers=(), reader_groups=("idp:security",))
    assert alice.ingest(batch(item))[0]["assessment_ready"] is True
    assert alice.inspect(item.source.logical_id).source.title == "Synthetic access review"
    restricted = regrant(item, readers=("bob",), reader_groups=())
    assert alice.ingest(batch(restricted))[0]["status"] == "access_denied"
    bob = reader(engine, "bob")
    assert bob.inspect(item.source.logical_id).source.title == "Synthetic access review"
    assert bob.resume()[0]["index_ready"] is True
    assert engine.store.rows[head_id(item.source.logical_id)]["withdrawn"] is False
    assert engine.jev.calls == 1 and len(engine.store.indexed) == 1


def test_group_read_access_does_not_grant_model_processing(engine, item):
    item = regrant(item, reader_groups=("idp:security",), processors=("turbopuffer",))
    engine.ingest(batch(item))
    alice = reader(engine, "alice", ("idp:security",))
    view = alice.inspect(item.source.logical_id)
    assert view.source.title == "Synthetic access review"
    with pytest.raises(CrowboError, match="permission"):
        alice.check_processing(view, MODEL)
    assert view.assessment is None


def test_new_audience_does_not_restore_a_withdrawn_source_without_authorised_ingestion(engine, item):
    engine.ingest(batch(item))
    assert engine.inspect(item.source.logical_id).source.title == "Synthetic access review"
    engine.withdraw(item.source.logical_id, now())
    restricted = regrant(item, readers=("bob",))
    assert engine.ingest(batch(restricted))[0]["status"] == "access_denied"
    bob = reader(engine, "bob")
    with pytest.raises(CrowboError, match="withdrawn"):
        bob.inspect(item.source.logical_id)
    assert bob.resume() == []
    assert bob.ingest(batch(restricted))[0]["index_ready"] is True
    assert bob.inspect(item.source.logical_id).source.title == "Synthetic access review"


def test_membership_expiring_during_jev_cannot_save_the_assessment(engine, item, monkeypatch):
    alice = reader(engine, "alice", ("idp:security",))
    item = regrant(item, readers=(), reader_groups=("idp:security",))
    assess = alice.jev.assess

    def expire(source):
        answer = assess(source)
        monkeypatch.setattr("crowbo.evidence.now", lambda: alice.settings.membership.expires_at)
        return answer

    monkeypatch.setattr(alice.jev, "assess", expire)
    result = alice.ingest(batch(item))[0]
    assert result["assessment_ready"] is False
    assert result["errors"][0]["stage"] == "jev"
    assert engine.store.rows[head_id(item.source.logical_id)]["assessment_id"] is None
    assert alice.jev.calls == 1


def test_saved_review_keeps_private_context_and_requires_every_contributor(engine, item):
    engine.settings = engine.settings.model_copy(
        update={"query_processors": ("turbopuffer", "voyage", MODEL)}
    )
    public = regrant(item, reader_groups=("idp:security",), processors=(*item.grant.processors, MODEL))
    restricted = regrant(changed(public, native_id="restricted"), reader_groups=("idp:leaders",))
    engine.ingest(batch(public, restricted))
    alice = reader(engine, "alice", ("idp:security", "idp:leaders"))
    model = reasoner(alice, lambda _: httpx.Response(200, json=response()))
    try:
        result = Review(alice, model).run(
            ReviewRequest(
                question="What should we do next?",
                context="Private operator-provided context.",
                source_ids=(public.source.logical_id, restricted.source.logical_id),
                model=MODEL,
                reasoning_effort="high",
            )
        )
        assert (
            result["answer"]["recommendation"]
            == "Confirm the obligation and available capacity before committing."
        )
        bob = reader(engine, "bob", ("idp:security", "idp:leaders"))
        assert len(bob.inspect_many([public.source.logical_id, restricted.source.logical_id])) == 2
        with pytest.raises(CrowboError, match="unavailable"):
            Review(bob, None).inspect(result["id"])
        engine.ingest(batch(regrant(restricted, reader_groups=())))
        assert alice.inspect(public.source.logical_id).source.title == "Synthetic access review"
        with pytest.raises(CrowboError, match="permission"):
            Review(alice, None).inspect(result["id"])
    finally:
        close(model)


def test_legacy_grant_stays_readable_and_refreshes_metadata_only(engine, item):
    engine.ingest(batch(item))
    head = engine.store.rows[head_id(item.source.logical_id)]
    del head["grant"]["reader_groups"]
    head["index_grant_hash"] = "legacy"
    legacy = Grant.model_validate(head["grant"])
    assert legacy.permits("operator", now()) is True
    assert legacy.permits("alice", now(), groups=("idp:security",)) is False
    assert engine.resume()[0]["index_ready"] is True
    assert engine.inspect(item.source.logical_id).source.title == "Synthetic access review"
    assert engine.jev.calls == 1 and len(engine.store.indexed) == 1


def test_native_queries_prefilter_by_user_or_group_without_returning_chunk_text(settings, monkeypatch):
    sent = []

    def respond(request):
        body = json.loads(request.content)
        sent.append(body)
        row = {"id": "chunk", "logical_id": "permitted", "revision_id": "v1", "generation": 1}
        if body["include_attributes"] == ["body"]:
            row = {"id": "head", "body": json.dumps({"logical_id": "permitted"})}
        return httpx.Response(200, json={"rows": [row], "billing": {}})

    monkeypatch.setattr("crowbo.providers.secret", lambda _: "x" * 32)
    monkeypatch.setattr("crowbo.providers.FixedHostTransport", lambda *_: httpx.MockTransport(respond))
    runtime = Runtime(settings)
    store = TurbopufferStore(runtime)
    try:
        assert (
            store.search("alice", "review", "keyword", 5, groups=("idp:security",))[0]["logical_id"]
            == "permitted"
        )
        assert list(store.heads("alice", groups=("idp:security",))) == [{"logical_id": "permitted"}]
        audience = [
            "Or",
            [["readers", "Contains", "alice"], ["reader_groups", "ContainsAny", ["idp:security"]]],
        ]
        assert all(audience in body["filters"][1] for body in sent)
        assert sent[0]["include_attributes"] == ["logical_id", "revision_id", "generation"]
        store.search("operator", "review", "keyword", 5)
        assert sent[-1]["filters"][1][0] == ["readers", "Contains", "operator"]
    finally:
        store.close()
        runtime.close()
