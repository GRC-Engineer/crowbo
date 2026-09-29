"""Synthetic behavior tests; these do not qualify a professional recommendation."""

import json
from datetime import timedelta

import httpx
import pytest
from conftest import batch
from pydantic import ValidationError

from crowbo.contracts import now
from crowbo.decision import Decision, DecisionRequest, RiskInputs, calculate_loss
from crowbo.evidence import head_id
from crowbo.review import Reasoner
from crowbo.runtime import CrowboError, Runtime

MODEL = "@cf/zai-org/glm-5.3-flash"


def configured(engine, item):
    engine.settings = engine.settings.model_copy(
        update={"query_processors": ("turbopuffer", "voyage", MODEL)}
    )
    item = item.model_copy(
        update={"grant": item.grant.model_copy(update={"processors": (*item.grant.processors, MODEL)})}
    )
    engine.ingest(batch(item))
    request = DecisionRequest(
        case_id="synthetic-review",
        question="Which action should the owner take next?",
        source_ids=(item.source.logical_id,),
        expected_revisions={item.source.logical_id: item.source.revision_id},
        subject="Synthetic security programme",
        scope="Fictional access review",
        window_start=now().date(),
        window_end=now().date() + timedelta(days=14),
        objectives=("Meet confirmed obligations, then reduce supported exposure",),
    )
    return item, request


def fact_payload():
    unknown = {"state": "unknown", "value": None, "citations": []}
    return {
        "deliverables": [
            {
                "title": "Synthetic access review",
                "anchor": {
                    "evidence_id": "E1",
                    "quote": "Owner requests an access review; no obligation is stated.",
                },
                **{
                    name: unknown
                    for name in (
                        "obligation",
                        "deadline",
                        "owner",
                        "completion",
                        "consequence",
                        "nondeferral",
                        "capacity",
                    )
                },
            }
        ],
        "jev_references": [{"evidence_id": "E1", "question_id": "obligation_stated"}],
    }


def reply(*, structured=True):
    return httpx.Response(
        200,
        json={
            "model": "glm-5.3-flash",
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "content": json.dumps(
                            {
                                "recommendation": "Ask the accountable owner to confirm the obligation and capacity.",
                                "rationale": "The invented source requests work but establishes no obligation [E1].",
                                "alternatives": ["Proceed with separately confirmed urgent work."],
                                "uncertainties": ["Neither obligation nor capacity is confirmed."],
                                "evidence_ids": ["E1"],
                                **({"deciding_facts": fact_payload()} if structured else {}),
                            }
                        )
                    },
                }
            ],
        },
    )


def model_for(engine, handler):
    return Reasoner(
        Runtime(engine.settings), httpx.Client(transport=httpx.MockTransport(handler)), "test-token"
    )


def close(model):
    model.close()
    model.runtime.close()


def risk_data(kind="operator_assertion", source_ids=()):
    provenance = {
        "kind": kind,
        "attributed_to": "Synthetic operator",
        "basis": "Invented development inputs, not company estimates",
        "source_ids": source_ids,
    }
    return {
        "scenario": "A fictional loss event",
        "currency": "GBP",
        "annual_frequency": {"value": "0.2", "low": "0.1", "high": "0.3", "provenance": provenance},
        "mean_loss_per_event": {"value": "12000.50", "provenance": provenance},
    }


def test_loss_uses_decimal_units_and_reports_bounds_as_sensitivity():
    result = calculate_loss(RiskInputs.model_validate(risk_data()))
    assert result["status"] == "calculated"
    assert result["expected_annual_loss"] == "2400.100"
    assert result["unit"] == "GBP/year"
    assert result["sensitivity_envelope"] == {
        "low": "1200.050",
        "high": "3600.150",
        "meaning": "Input bounds only; not a probability or confidence interval.",
    }


def test_missing_risk_input_remains_missing_and_zero_is_not_missing():
    inputs = risk_data()
    inputs.pop("annual_frequency")
    result = calculate_loss(RiskInputs.model_validate(inputs))
    assert result["status"] == "missing_input"
    assert result["missing"] == ["annual_frequency"]
    inputs["annual_frequency"] = {"value": "0", "provenance": inputs["mean_loss_per_event"]["provenance"]}
    assert calculate_loss(RiskInputs.model_validate(inputs))["expected_annual_loss"] == "0.00"
    assert calculate_loss(None)["missing"] == ["annual_frequency", "mean_loss_per_event"]


@pytest.mark.parametrize(
    "change",
    [
        {"annual_frequency": {"value": "NaN"}},
        {"annual_frequency": {"value": "-1"}},
        {"annual_frequency": {"low": "0.4", "high": "0.5"}},
        {"annual_frequency": {"low": None}},
        {"currency": "pounds"},
    ],
)
def test_risk_inputs_reject_ambiguous_units_nonfinite_or_incoherent_bounds(change):
    raw = risk_data()
    for key, value in change.items():
        if isinstance(value, dict):
            raw[key].update(value)
        else:
            raw[key] = value
    with pytest.raises(ValidationError):
        RiskInputs.model_validate(raw)


def test_decision_binds_checks_and_calculation_to_model_evidence_without_combining_jev(engine, item):
    item, request = configured(engine, item)
    raw = request.model_dump(mode="json")
    raw.update(
        risk=risk_data("counterfactual", [item.source.logical_id]),
        counterfactual={
            "label": "Invented annual exposure",
            "attributed_to": "Test author",
            "changes": "Assume the explicitly supplied event frequency and mean loss.",
        },
    )
    request = DecisionRequest.model_validate(raw)

    def respond(call):
        envelope = json.loads(call.content)
        body = json.loads(envelope["messages"][1]["content"])
        assert envelope["model"] == "@cf/zai-org/glm-5.3-flash"
        assert body["decision"]["request"]["subject"] == "Synthetic security programme"
        assert body["selected_evidence"][0]["source"]["text"] == item.source.text
        assert body["decision"]["bindings"][0]["revision_id"] == item.source.revision_id
        assert body["decision"]["calculation"]["expected_annual_loss"] == "2400.100"
        return reply()

    model = model_for(engine, respond)
    result = Decision(engine, model).run(request)
    assert (
        result["answer"]["recommendation"]
        == "Ask the accountable owner to confirm the obligation and capacity."
    )
    assert result["decision"]["counterfactual"] is True
    assert result["decision"]["checks"]["accountable_owner"] == "unresolved"
    assert result["evidence"][0]["assessment"]["answers"]["obligation_stated"]["noul"] == 0.01
    assert Decision(engine, None).inspect(result["id"])["decision_ready"] is True
    close(model)


@pytest.mark.parametrize(
    "failure, message",
    [
        ("wrong_criteria", "current Jev criteria"),
        ("missing_answer", "active questions"),
        ("stale", "stale or future"),
        ("future", "stale or future"),
        ("withdrawn", "withdrawn"),
        ("revision", "requested baseline"),
    ],
)
def test_unready_evidence_blocks_inference_and_saved_recommendation(engine, item, failure, message):
    item, request = configured(engine, item)
    head = engine.store.rows[head_id(item.source.logical_id)]
    if failure == "wrong_criteria":
        engine.questions = engine.questions.model_copy(update={"version": "new-criteria"})
    elif failure == "missing_answer":
        engine.store.rows[head["assessment_id"]]["answers"].pop("deadline_stated")
    elif failure in {"stale", "future"}:
        offset = timedelta(hours=-25 if failure == "stale" else 1)
        head["last_checked_at"] = (now() + offset).isoformat()
    elif failure == "withdrawn":
        head["withdrawn"] = True
    else:
        request = request.model_copy(update={"expected_revisions": {item.source.logical_id: "a" * 64}})
    model = model_for(engine, lambda _: pytest.fail("Unready evidence reached the model"))
    with pytest.raises(CrowboError, match=message):
        Decision(engine, model).run(request)
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    assert model.runtime.db.execute("SELECT count(*) FROM calls").fetchone()[0] == 0
    close(model)


@pytest.mark.parametrize("change", ["revision", "criteria", "withdrawal"])
def test_changes_during_reasoning_reject_result_before_storage(engine, item, change):
    item, request = configured(engine, item)

    def respond(_):
        if change == "revision":
            engine.ingest(
                batch(
                    item.model_copy(
                        update={
                            "source": item.source.model_copy(
                                update={
                                    "text": "A changed synthetic fact",
                                    "updated_at": now(),
                                    "observed_at": now(),
                                }
                            )
                        }
                    )
                )
            )
        elif change == "criteria":
            engine.questions = engine.questions.model_copy(update={"version": "new-criteria"})
        else:
            engine.store.rows[head_id(item.source.logical_id)]["withdrawn"] = True
        return reply()

    model = model_for(engine, respond)
    with pytest.raises(CrowboError, match="revision|criteria|withdrawn"):
        Decision(engine, model).run(request)
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    close(model)


def test_history_reports_stale_readiness_and_denies_withdrawn_contributor(engine, item, monkeypatch):
    item, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    result = Decision(engine, model).run(request)
    later = now() + timedelta(hours=25)
    monkeypatch.setattr("crowbo.decision.now", lambda: later)
    inspected = Decision(engine, None).inspect(result["id"])
    assert inspected["decision_ready"] is False
    assert (
        inspected["readiness_issue"] == "Decision source content is stale or future-dated; refresh it first"
    )
    engine.store.rows[head_id(item.source.logical_id)]["withdrawn"] = True
    with pytest.raises(CrowboError, match="withdrawn"):
        Decision(engine, None).inspect(result["id"])
    close(model)


def test_unselected_provenance_and_unlabelled_hypothetical_are_rejected(engine, item):
    _, request = configured(engine, item)
    raw = request.model_dump(mode="json")
    raw["risk"] = risk_data("source_assertion", ["f" * 64])
    with pytest.raises(ValidationError, match="selected evidence"):
        DecisionRequest.model_validate(raw)
    raw["risk"] = risk_data("counterfactual")
    with pytest.raises(ValidationError, match="explicit overlay"):
        DecisionRequest.model_validate(raw)
    raw["risk"] = risk_data("source_assertion")
    with pytest.raises(ValidationError, match="require selected evidence"):
        DecisionRequest.model_validate(raw)


def test_counterfactual_reassessment_preserves_original_request_and_source(engine, item):
    item, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    decision = Decision(engine, model)
    original = decision.run(request)
    raw = request.model_dump(mode="json")
    raw.update(
        case_version="capacity-after-deadline",
        counterfactual={
            "label": "Capacity arrives late",
            "attributed_to": "Synthetic operator",
            "changes": "Assume qualified capacity is available only after the planning window.",
        },
    )
    changed = decision.run(DecisionRequest.model_validate(raw))
    assert original["id"] != changed["id"]
    assert decision.inspect(original["id"])["decision"]["request"]["case_version"] == "1"
    assert changed["decision"]["request"]["counterfactual"]["label"] == "Capacity arrives late"
    assert changed["evidence"][0]["source"]["text"] == item.source.text
    close(model)


def test_revoking_nonfirst_risk_contributor_denies_saved_decision(engine, item):
    item, request = configured(engine, item)
    second = item.model_copy(update={"source": item.source.model_copy(update={"native_id": "second"})})
    engine.ingest(batch(second))
    raw = request.model_dump(mode="json")
    raw.update(
        source_ids=[item.source.logical_id, second.source.logical_id],
        expected_revisions={
            item.source.logical_id: item.source.revision_id,
            second.source.logical_id: second.source.revision_id,
        },
        risk=risk_data("source_assertion", [second.source.logical_id]),
    )
    model = model_for(engine, lambda _: reply())
    result = Decision(engine, model).run(DecisionRequest.model_validate(raw))
    assert result["decision"]["calculation"]["expected_annual_loss"] == "2400.100"
    engine.ingest(
        batch(
            second.model_copy(
                update={"grant": second.grant.model_copy(update={"checked_at": now(), "revoked": True})}
            )
        )
    )
    with pytest.raises(CrowboError, match="permission"):
        Decision(engine, None).inspect(result["id"])
    close(model)
