"""Synthetic feedback/reassessment behavior, not qualified security judgment."""

import json
from datetime import timedelta

import pytest
from conftest import batch
from pydantic import ValidationError
from test_decision import MODEL, close, configured, model_for, reply

from crowbo.contracts import now
from crowbo.decision import Decision, DecisionRequest
from crowbo.evidence import head_id
from crowbo.feedback import Feedback, FeedbackRequest
from crowbo.review import Review
from crowbo.runtime import CrowboError


def feedback_request(result, **changes):
    return FeedbackRequest.model_validate(
        {
            "result_id": result["id"],
            "reviewed_at": now(),
            "choice": {"kind": "alternative", "alternative_index": 0},
            "rationale": "Synthetic reviewer chooses the independently confirmed urgent work.",
            "corrections": [{"statement": "Capacity remains unknown.", "basis": "Operator assertion"}],
            "revisit_when": ["A confirmed delivery owner supplies an estimate."],
            **changes,
        }
    )


def next_request(request, feedback, **changes):
    return DecisionRequest.model_validate(
        {
            **request.model_dump(mode="json"),
            "case_version": "2",
            "prior_feedback_id": feedback["id"],
            **changes,
        }
    )


def test_feedback_is_retained_without_inference_and_replays_after_uncertain_write(engine, item):
    _, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    try:
        parent = Decision(engine, model).run(request)
    finally:
        close(model)
    app = Feedback(engine)
    request = feedback_request(parent)
    write = engine.store.put

    def uncertain(*args, **kwargs):
        write(*args, **kwargs)
        raise CrowboError("Synthetic lost storage response")

    engine.store.put = uncertain
    result = app.record(request)
    writes = engine.store.writes
    assert app.record(request) == result
    assert engine.store.writes == writes
    assert result["selected_choice"] == parent["answer"]["alternatives"][0]
    assert result["simulated"] and not result["authority_verified"] and not result["outcome_verified"]
    assert "human identity is not verified" in result["attribution"]
    assert (
        app.inspect(result["id"])["request"]["corrections"] == request.model_dump(mode="json")["corrections"]
    )
    assert Review(engine, None).inspect(parent["id"]) == parent
    engine.store.rows[head_id(item.source.logical_id)]["grant"]["revoked"] = True
    with pytest.raises(CrowboError, match="permission"):
        app.record(request)


def test_feedback_does_not_swallow_failed_insert_or_return_after_revocation(engine, item):
    _, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    try:
        parent = Decision(engine, model).run(request)
    finally:
        close(model)
    app = Feedback(engine)
    request = feedback_request(parent)
    write = engine.store.put

    def failed(*args, **kwargs):
        raise CrowboError("Synthetic storage failure")

    engine.store.put = failed
    with pytest.raises(CrowboError, match="storage failure"):
        app.record(request)

    def revoked(*args, **kwargs):
        write(*args, **kwargs)
        engine.store.rows[head_id(item.source.logical_id)]["grant"]["revoked"] = True

    engine.store.put = revoked
    with pytest.raises(CrowboError, match="permission"):
        app.record(request)


def test_changed_evidence_reassessment_retains_reported_outcome_and_old_citation_map(engine, item):
    item, request = configured(engine, item)
    other = item.model_copy(update={"source": item.source.model_copy(update={"native_id": "restore-test"})})
    engine.ingest(batch(other))
    requests = []

    def respond(call):
        requests.append(json.loads(json.loads(call.content)["messages"][1]["content"]))
        response = reply().json()
        answer = json.loads(response["choices"][0]["message"]["content"])
        answer["recommendation"] += " Device E1 is an ordinary asset name."
        response["choices"][0]["message"]["content"] = json.dumps(answer)
        return type(reply())(200, json=response)

    model = model_for(engine, respond)
    try:
        app = Decision(engine, model)
        parent = app.run(request)
        changed = item.model_copy(
            update={
                "source": item.source.model_copy(
                    update={
                        "text": "Synthetic repair completed; retest pending.",
                        "updated_at": now(),
                        "observed_at": now(),
                    }
                )
            }
        )
        engine.ingest(batch(changed))
        feedback = Feedback(engine).record(
            feedback_request(
                parent,
                supporting_revisions={other.source.logical_id: other.source.revision_id},
                outcome={
                    "observed_on": now().date(),
                    "statement": "A rehearsal was reported.",
                    "basis": "Synthetic source assertion, not verified causality.",
                    "source_ids": [other.source.logical_id],
                },
            )
        )
        new_request = next_request(
            request,
            feedback,
            source_ids=[other.source.logical_id, item.source.logical_id],
            expected_revisions={
                item.source.logical_id: changed.source.revision_id,
                other.source.logical_id: other.source.revision_id,
            },
        )
        child = app.run(new_request)
        packet = requests[-1]["decision"]["reassessment"]
        assert packet["prior_bindings"]["P1"] == {
            "source_id": item.source.logical_id,
            "revision_id": item.source.revision_id,
        }
        assert requests[-1]["selected_evidence"][0]["source_id"] == other.source.logical_id
        assert "[P1]" in packet["prior_answer"]["rationale"]
        assert "[E1]" not in packet["prior_answer"]["rationale"]
        assert "Device E1" in packet["prior_answer"]["recommendation"]
        assert packet["prior_answer"]["evidence_ids"] == ["P1"]
        assert packet["feedback"]["outcome_verified"] is False
        assert child["decision"]["request"]["prior_feedback_id"] == feedback["id"]
        assert child["feasibility_checked"] is False
        assert app.inspect(parent["id"])["evidence_unchanged"] is False
        assert engine.store.get(parent["id"])["answer"] == parent["answer"]

        child_feedback = Feedback(engine).record(feedback_request(child))
        get = engine.store.get

        def no_ancestor(identifier):
            assert identifier not in {parent["id"], feedback["id"]}, "reassessment must not walk ancestors"
            return get(identifier)

        engine.store.get = no_ancestor
        grandchild = app.run(next_request(new_request, child_feedback, case_version="3"))
        assert grandchild["decision"]["reassessment"]["prior_result_id"] == child["id"]
        engine.store.get = get
        engine.store.rows[head_id(item.source.logical_id)]["grant"]["revoked"] = True
        for operation in (app.inspect, Review(engine, None).inspect):
            with pytest.raises(CrowboError, match="permission"):
                operation(grandchild["id"])
        with pytest.raises(CrowboError, match="permission"):
            Feedback(engine).inspect(child_feedback["id"])
    finally:
        close(model)


@pytest.mark.parametrize(
    "failure",
    [
        "omit_parent",
        "omit_support",
        "glm_revoked",
        "reader_revoked",
        "withdrawn",
        "other_case",
        "same_version",
    ],
)
def test_reassessment_rejects_invalid_lineage_before_inference(engine, item, failure):
    item, request = configured(engine, item)
    other = item.model_copy(update={"source": item.source.model_copy(update={"native_id": "support"})})
    engine.ingest(batch(other))
    calls = []
    model = model_for(engine, lambda call: (calls.append(call), reply())[1])
    try:
        app = Decision(engine, model)
        parent = app.run(request)
        feedback = Feedback(engine).record(
            feedback_request(parent, supporting_revisions={other.source.logical_id: other.source.revision_id})
        )
        raw = {
            **request.model_dump(mode="json"),
            "source_ids": [other.source.logical_id, item.source.logical_id],
            "expected_revisions": {},
            "case_version": "2",
            "prior_feedback_id": feedback["id"],
        }
        if failure == "omit_parent":
            raw["source_ids"] = [other.source.logical_id]
        elif failure == "omit_support":
            raw["source_ids"] = [item.source.logical_id]
        elif failure == "glm_revoked":
            head = engine.store.rows[head_id(item.source.logical_id)]
            head["grant"]["processors"].remove(MODEL)
            # Re-import refreshes index access metadata; failure must be processing permission.
            from crowbo.contracts import Grant

            engine.ingest(batch(item.model_copy(update={"grant": Grant.model_validate(head["grant"])})))
            assert Review(engine, None).inspect(parent["id"])
        elif failure == "reader_revoked":
            engine.store.rows[head_id(item.source.logical_id)]["grant"]["revoked"] = True
        elif failure == "withdrawn":
            engine.store.rows[head_id(other.source.logical_id)]["withdrawn"] = True
        elif failure == "other_case":
            raw["case_id"] = "different-case"
        else:
            raw["case_version"] = "1"
        with pytest.raises(CrowboError) as error:
            app.run(DecisionRequest.model_validate(raw))
        if failure == "glm_revoked":
            assert "permission" in str(error.value)
        assert len(calls) == 1
    finally:
        close(model)


def test_model_failure_preserves_feedback_and_historical_citations_are_rejected(engine, item):
    _, request = configured(engine, item)
    calls = []

    def respond(call):
        calls.append(call)
        response = reply()
        if len(calls) > 1:
            body = response.json()
            answer = json.loads(body["choices"][0]["message"]["content"])
            answer["rationale"] += " The historical answer claimed this [P1]."
            body["choices"][0]["message"]["content"] = json.dumps(answer)
            return type(response)(200, json=body)
        return response

    model = model_for(engine, respond)
    try:
        app = Decision(engine, model)
        parent = app.run(request)
        feedback = Feedback(engine).record(feedback_request(parent))
        with pytest.raises(CrowboError, match="citations"):
            app.run(next_request(request, feedback))
        assert Feedback(engine).inspect(feedback["id"]) == feedback
        assert len([r for r in engine.store.rows.values() if r.get("kind") == "review"]) == 1
    finally:
        close(model)


@pytest.mark.parametrize(
    "changes",
    [
        {"reviewed_at": now() + timedelta(days=2)},
        {"reviewed_at": "2026-01-01T10:00:00"},
        {"choice": {"kind": "alternative"}},
        {"choice": {"kind": "custom", "alternative_index": 0, "custom": "fictional"}},
        {"choice": None, "corrections": []},
        {"authority_verified": True},
        {"rationale": "A correction quoting ambiguous old evidence [E1]."},
        {"choice": {"kind": "custom", "custom": "Follow older advice [P1]."}},
        {"corrections": [{"statement": "unsupported", "basis": "no source", "source_ids": ["a" * 64]}]},
        {
            "outcome": {
                "statement": "future",
                "basis": "fictional",
                "observed_on": (now() + timedelta(days=2)).date(),
            }
        },
    ],
)
def test_feedback_bounds_and_attribution_cannot_be_bypassed(changes):
    with pytest.raises(ValidationError):
        feedback_request({"id": "b" * 64}, **changes)


def test_invalid_option_or_supporting_revision_cannot_be_recorded(engine, item):
    _, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    try:
        parent = Decision(engine, model).run(request)
    finally:
        close(model)
    for changes in (
        {"choice": {"kind": "alternative", "alternative_index": 19}},
        {"supporting_revisions": {"f" * 64: item.source.revision_id}},
        {"supporting_revisions": {item.source.logical_id: "f" * 64}},
    ):
        with pytest.raises(CrowboError):
            Feedback(engine).record(feedback_request(parent, **changes))
    assert not any(r.get("kind") == "decision_feedback" for r in engine.store.rows.values())


def test_feedback_cannot_expand_inherited_selection_beyond_fifteen_sources(engine, item):
    _, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    try:
        parent = Decision(engine, model).run(request)
    finally:
        close(model)
    support = {f"{i:064x}": "a" * 64 for i in range(15)}
    with pytest.raises(CrowboError, match="15-source"):
        Feedback(engine).record(feedback_request(parent, supporting_revisions=support))
    assert not any(r.get("kind") == "decision_feedback" for r in engine.store.rows.values())
