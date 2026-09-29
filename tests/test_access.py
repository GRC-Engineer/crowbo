"""Synthetic contract and provider-boundary checks, not qualified security judgments."""

import json
from copy import deepcopy

import httpx
import pytest
from conftest import batch
from pydantic import ValidationError
from test_decision import close, configured, model_for

from crowbo.access import AccessFacts, AccessSubject, access_questions, context_assessment_id
from crowbo.contracts import Assessment, digest, now
from crowbo.decision import Decision
from crowbo.evidence import head_id
from crowbo.runtime import CrowboError

SUBJECT = AccessSubject(
    system="ReportingDB", account_id="svc-reports@example.test", scope="org-demo/project-A"
)
IDENTITY = "Account svc-reports@example.test belongs to ReportingDB org-demo/project-A."
WORK = "This account must export the daily report."
CURRENT = "Its current Administrator role completes the daily export."
PASSED = "The project-scoped Reader role passed all required export tasks."
TEXT = f"{IDENTITY} {WORK} {CURRENT} {PASSED} Custodian: owner@example.test. No deadline is assigned."


def stated(value, quote):
    return {"state": "stated", "value": value, "citations": [{"evidence_id": "E1", "quote": quote}]}


def access_answer():
    return {
        "recommendation": "Recommend Reader after separate owner approval and a reversible cutover.",
        "rationale": "The narrower role passed the required export [E1].",
        "alternatives": ["Retain Administrator while approval is pending."],
        "uncertainties": ["No approver or deadline is established."],
        "evidence_ids": ["E1"],
        "access_facts": {
            "subject": SUBJECT.model_dump(),
            "identity": stated("Exact account and scope are stated", IDENTITY),
            "required_work": stated("Daily report export", WORK),
            "current_access": stated("Administrator", CURRENT),
            "custodian": {
                "identifier": "owner@example.test",
                "citation": {"evidence_id": "E1", "quote": "Custodian: owner@example.test."},
            },
            "approval_authority": None,
            "deadline": None,
            "options": [
                {
                    "kind": "retain",
                    "description": "Keep Administrator",
                    "workflow_fit": "supported",
                    "basis": stated("Current role works", CURRENT),
                    "exposure_change": "No reduction",
                    "operational_cost": "No migration",
                    "conditions": ["Separate approval"],
                    "reverses_when": "A narrower option is verified",
                },
                {
                    "kind": "reduce",
                    "description": "Use project Reader",
                    "workflow_fit": "supported",
                    "basis": stated("All required tasks passed", PASSED),
                    "exposure_change": "Less write access",
                    "operational_cost": "One reversible role change",
                    "conditions": ["Separate approval"],
                    "reverses_when": "Required work needs writes",
                },
            ],
            "selected_option": "reduce",
        },
    }


def setup_access(engine, item, method="crowbo_without_jev"):
    item = item.model_copy(update={"source": item.source.model_copy(update={"text": TEXT})})
    item, request = configured(engine, item)
    engine.settings = engine.settings.model_copy(
        update={"query_processors": (*engine.settings.query_processors, "jev")}
    )
    return item, request.model_copy(update={"access": SUBJECT, "method": method})


def response(answer=None):
    return httpx.Response(
        200,
        json={
            "model": "glm-5.3-flash",
            "choices": [
                {"finish_reason": "stop", "message": {"content": json.dumps(answer or access_answer())}}
            ],
        },
    )


@pytest.fixture
def fake_context_jev(monkeypatch):
    calls = []

    class ScopedJev:
        def __init__(self, runtime, questions):
            self.questions = questions

        def assess(self, source):
            calls.append((source.revision_id, self.questions.fingerprint))
            answers = {}
            for key, question in self.questions.questions.items():
                choices = list(question["criteria"])
                answers[key] = {
                    "type": "choice",
                    "choice": choices[0],
                    "confidence": 0.8,
                    "probabilities": {c: float(c == choices[0]) for c in choices},
                }
            return Assessment(
                source_revision=source.revision_id,
                criteria_version=self.questions.version,
                criteria_hash=self.questions.fingerprint,
                returned_model="jev-test",
                answers=answers,
                questions=self.questions.questions,
                input_tokens=1,
                output_tokens=1,
                elapsed_seconds=0.01,
                assessed_at=now(),
            )

        def close(self):
            pass

    monkeypatch.setattr("crowbo.access.Jev", ScopedJev)
    return calls


def test_access_decision_binds_account_options_and_history(engine, item):
    item, request = setup_access(engine, item)
    model = model_for(engine, lambda _: response())
    try:
        result = Decision(engine, model).run(request)
        facts = result["decision"]["access_facts"]
        assert facts["subject"] == SUBJECT.model_dump()
        assert facts["selected_option"] == "reduce"
        assert facts["deadline"] is None and facts["approval_authority"] is None
        assert facts["authority_verified"] is False
        citation = facts["options"][1]["basis"]["citations"][0]
        assert citation["revision_id"] == item.source.revision_id
        assert TEXT[citation["start"] : citation["end"]] == PASSED
        historical = Decision(engine, None).inspect(result["id"])
        assert historical["decision"]["access_facts"] == facts
        assert historical["decision_ready"] is True
        engine.store.rows[head_id(item.source.logical_id)]["grant"]["revoked"] = True
        with pytest.raises(CrowboError, match="permission"):
            Decision(engine, None).inspect(result["id"])
    finally:
        close(model)


@pytest.mark.parametrize(
    "failure",
    [
        "failed_option",
        "missing_option",
        "fake_identity",
        "absent_identity",
        "absent_deadline",
        "absent_owner",
    ],
)
def test_invalid_access_state_is_rejected(failure):
    facts = access_answer()["access_facts"]
    if failure == "failed_option":
        facts["options"][1]["workflow_fit"] = "fails"
    elif failure == "missing_option":
        facts["selected_option"] = "remove"
    elif failure == "fake_identity":
        facts["subject"]["account_id"] = "a-different-account"
    elif failure == "absent_identity":
        facts["identity"] = {"state": "unknown"}
    elif failure == "absent_deadline":
        facts["deadline"] = {
            "date": "No deadline is assigned",
            "citation": {"evidence_id": "E1", "quote": "No deadline is assigned."},
        }
    else:
        facts["custodian"]["identifier"] = "unknown"
    with pytest.raises(ValidationError):
        AccessFacts.model_validate(facts)


def test_investigation_requires_a_deciding_question():
    facts = access_answer()["access_facts"]
    facts["options"][1].update(kind="investigate", workflow_fit="unknown", basis={"state": "unknown"})
    facts["selected_option"] = "investigate"
    with pytest.raises(ValidationError, match="deciding check"):
        AccessFacts.model_validate(facts)
    facts["next_check"] = {
        "question": "Does recovery require writes?",
        "changes_choice_if": "If yes Reader fails",
    }
    value = AccessFacts.model_validate(facts)
    assert value.next_check.question == "Does recovery require writes?"


@pytest.mark.parametrize("failure", ["changed_subject", "fabricated_quote"])
def test_access_provider_cannot_change_subject_or_invent_quotes(engine, item, failure):
    _, request = setup_access(engine, item)
    answer = access_answer()
    if failure == "changed_subject":
        answer["access_facts"]["subject"]["scope"] = "another-organization"
    else:
        answer["access_facts"]["options"][1]["basis"]["citations"][0]["quote"] = (
            "Invented successful recovery test"
        )
    model = model_for(engine, lambda _: response(answer))
    try:
        with pytest.raises(CrowboError):
            Decision(engine, model).run(request)
        assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    finally:
        close(model)


def test_three_methods_share_schema_sources_and_guided_prompt(engine, item, fake_context_jev):
    item, request = setup_access(engine, item)
    payloads, results = {}, {}
    for method in ("plain", "crowbo_without_jev", "crowbo"):

        def respond(call, method=method):
            payloads[method] = json.loads(call.content)
            return response()

        model = model_for(engine, respond)
        try:
            results[method] = Decision(engine, model).run(request.model_copy(update={"method": method}))
        finally:
            close(model)
    assert {r["request"]["answer_format"] for r in results.values()} == {"access"}
    assert {r["answer"]["access_facts"]["selected_option"] for r in results.values()} == {"reduce"}
    assert results["crowbo"]["prompt_hash"] == results["crowbo_without_jev"]["prompt_hash"]
    assert results["plain"]["prompt_hash"] != results["crowbo"]["prompt_hash"]
    bodies = {method: json.loads(p["messages"][1]["content"]) for method, p in payloads.items()}
    contextual = bodies["crowbo"]["decision"].pop("access_assessments")
    assert contextual["subject"] == SUBJECT.model_dump()
    assert contextual["records"][0]["source_revision"] == item.source.revision_id
    assert bodies["plain"] == bodies["crowbo_without_jev"] == bodies["crowbo"]
    assert len({r["provider"]["common_payload_hash"] for r in results.values()}) == 1
    for method, payload in payloads.items():
        assert results[method]["provider"]["user_message_hash"] == digest(payload["messages"][1]["content"])
    assert all("assessment" not in b["selected_evidence"][0] for b in bodies.values())
    assert len(fake_context_jev) == 1


def test_context_cache_reuses_subject_and_keeps_ingestion_head(engine, item, fake_context_jev):
    item, request = setup_access(engine, item, "crowbo")
    before = deepcopy(engine.store.rows[head_id(item.source.logical_id)])
    model = model_for(engine, lambda _: response())
    try:
        one = Decision(engine, model).run(request)
        two = Decision(engine, model).run(request)
        assert two["decision"]["access_assessments"] == one["decision"]["access_assessments"]
        assert len(fake_context_jev) == 1
        assert engine.store.rows[head_id(item.source.logical_id)] == before
        changed = SUBJECT.model_copy(update={"scope": "org-demo/project-B"})
        assert access_questions(changed).fingerprint != access_questions(SUBJECT).fingerprint
        changed_grant = item.grant.model_copy(
            update={"processors": ("turbopuffer", "voyage", "@cf/zai-org/glm-5.3-flash"), "checked_at": now()}
        )
        engine.ingest(batch(item.model_copy(update={"grant": changed_grant})))
        with pytest.raises(CrowboError, match="permission"):
            Decision(engine, model).run(request)
    finally:
        close(model)


def test_plain_access_does_not_require_ingestion_jev(engine, item):
    item, request = setup_access(engine, item, "plain")
    head = engine.store.rows[head_id(item.source.logical_id)]
    head["assessment_id"] = None
    model = model_for(engine, lambda _: response())
    try:
        result = Decision(engine, model).run(request)
        assert result["answer"]["access_facts"]["selected_option"] == "reduce"
        assert result["evidence"][0]["assessment"] is None
    finally:
        close(model)


def test_changed_context_criteria_preserves_history_but_requires_reassessment(
    engine, item, fake_context_jev, monkeypatch
):
    _, request = setup_access(engine, item, "crowbo")
    model = model_for(engine, lambda _: response())
    try:
        saved = Decision(engine, model).run(request)
        assert Decision(engine, None).inspect(saved["id"])["decision_ready"]
        changed = access_questions(SUBJECT).model_copy(update={"version": "access-context-v2"})
        monkeypatch.setattr("crowbo.decision.access_questions", lambda _: changed)
        historical = Decision(engine, None).inspect(saved["id"])
        assert historical["answer"] == saved["answer"]
        assert not historical["decision_ready"]
        assert "criteria changed" in historical["readiness_issue"]
    finally:
        close(model)


def test_context_cache_rejects_wrong_revision(engine, item, fake_context_jev):
    item, request = setup_access(engine, item, "crowbo")
    model = model_for(engine, lambda _: response())
    try:
        good = Decision(engine, model).run(request)
        key = good["decision"]["access_assessments"]["records"][0]["assessment_id"]
        engine.store.rows[key]["assessment"]["source_revision"] = "f" * 64
        engine.store.rows[key]["assessment_hash"] = digest(engine.store.rows[key]["assessment"])
        with pytest.raises(CrowboError, match="revision mismatch"):
            Decision(engine, model).run(request)
        assert len(fake_context_jev) == 1
        assert (
            Decision(engine, None).inspect(good["id"])["answer"]["access_facts"]["selected_option"]
            == "reduce"
        )
    finally:
        close(model)


def test_permission_change_during_jev_cannot_publish_cache_or_answer(
    engine, item, fake_context_jev, monkeypatch
):
    item, request = setup_access(engine, item, "crowbo")
    from crowbo.access import Jev

    original = Jev.assess

    def revoke(self, source):
        result = original(self, source)
        engine.store.rows[head_id(source.logical_id)]["grant"]["revoked"] = True
        return result

    monkeypatch.setattr(Jev, "assess", revoke)
    model = model_for(engine, lambda _: response())
    try:
        with pytest.raises(CrowboError, match="permission"):
            Decision(engine, model).run(request)
        questions = access_questions(SUBJECT)
        key = context_assessment_id(item.source.revision_id, questions)
        assert key not in engine.store.rows
        assert len(fake_context_jev) == 1
        assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    finally:
        close(model)


def test_context_cache_rejects_changed_answer_and_separates_subjects(engine, item, fake_context_jev):
    _, request = setup_access(engine, item, "crowbo")
    model = model_for(engine, lambda _: response())
    try:
        one = Decision(engine, model).run(request)
        key = one["decision"]["access_assessments"]["records"][0]["assessment_id"]
        engine.store.rows[key]["assessment"]["answers"]["subject_match"]["confidence"] = 0.4
        with pytest.raises(CrowboError, match="checksum"):
            Decision(engine, model).run(request)
        changed = SUBJECT.model_copy(update={"scope": "org-demo/project-B"})
        changed_answer = access_answer()
        facts = changed_answer["access_facts"]
        facts["subject"] = changed.model_dump()
        facts["identity"] = {"state": "unknown"}
        facts["options"][1].update(kind="investigate", workflow_fit="unknown", basis={"state": "unknown"})
        facts["selected_option"] = "investigate"
        facts["next_check"] = {
            "question": "Does this account belong to project-B?",
            "changes_choice_if": "If not, find evidence for the requested scope before a role choice.",
        }
        changed_answer["recommendation"] = "Investigate the requested account scope before any change."
        second_model = model_for(engine, lambda _: response(changed_answer))
        try:
            two = Decision(engine, second_model).run(request.model_copy(update={"access": changed}))
            assert two["decision"]["access_assessments"]["records"][0]["assessment_id"] != key
            assert len(fake_context_jev) == 2
        finally:
            close(second_model)
    finally:
        close(model)


@pytest.mark.parametrize("failure", ["unknown_fact", "private_field", "missing_selected_option"])
def test_access_failure_diagnostics_only_include_schema_names(engine, item, failure):
    _, request = setup_access(engine, item)
    answer = access_answer()
    if failure == "unknown_fact":
        answer["access_facts"]["required_work"] = {"state": "unknown", "value": "private-secret-value"}
        expected = {"path": ["access_facts", "required_work"], "constraint": "unknown_fact_has_assertion"}
    elif failure == "private_field":
        answer["access_facts"]["private-secret-field"] = "private-secret-value"
        expected = {"path": ["access_facts", "unknown_field"], "constraint": "schema"}
    else:
        answer["access_facts"]["selected_option"] = "investigate"
        expected = {"path": ["access_facts"], "constraint": "selected_option_missing"}
    model = model_for(engine, lambda _: response(answer))
    try:
        with pytest.raises(CrowboError, match="schema validation"):
            Decision(engine, model).run(request)
        receipt = json.loads(model.runtime.db.execute("SELECT receipt FROM calls").fetchone()[0])
        assert receipt["validation"]["details"] == [expected]
        assert "private-secret" not in json.dumps(receipt)
    finally:
        close(model)
