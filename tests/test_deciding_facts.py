"""Fictional evidence; origin checks do not qualify the model's semantic judgment."""

import json

import pytest
from pydantic import ValidationError
from test_decision import close, configured, fact_payload, model_for, reply

from crowbo.deciding_facts import DecidingFacts, Fact
from crowbo.decision import Decision
from crowbo.runtime import CrowboError


def test_bound_facts_resolve_actual_jev_value_and_exact_revision(engine, item):
    item, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    result = Decision(engine, model).run(request)
    facts = result["decision"]["deciding_facts"]
    card = facts["deliverables"][0]
    assert card["anchor"]["revision_id"] == item.source.revision_id
    assert item.source.text[card["anchor"]["start"] : card["anchor"]["end"]] == card["anchor"]["quote"]
    assert card["facts"]["capacity"] == {"state": "unknown", "value": None, "citations": []}
    assert "deadline" in card["unresolved_commitment_fields"]
    assert card["authority_verified"] is False
    assert facts["jev"][0]["answer"]["noul"] == 0.01
    assert facts["jev"][0]["source_id"] == item.source.logical_id
    assert Decision(engine, None).inspect(result["id"])["decision"]["deciding_facts"] == facts
    close(model)


@pytest.mark.parametrize("failure", ["quote", "wrong_source", "question", "number"])
def test_invalid_model_bindings_are_not_saved(engine, item, failure):
    _, request = configured(engine, item)

    def respond(_):
        response = reply()
        data = response.json()
        answer = json.loads(data["choices"][0]["message"]["content"])
        facts = answer["deciding_facts"]
        if failure == "quote":
            facts["deliverables"][0]["anchor"]["quote"] = "A fabricated delivery deadline"
        elif failure == "wrong_source":
            facts["deliverables"][0]["anchor"]["evidence_id"] = "E2"
        elif failure == "question":
            facts["jev_references"][0]["question_id"] = "invented"
        else:
            facts["jev_references"][0]["score"] = 0.95
        data["choices"][0]["message"]["content"] = json.dumps(answer)
        return type(response)(200, json=data)

    model = model_for(engine, respond)
    with pytest.raises(CrowboError):
        Decision(engine, model).run(request)
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    assert model.runtime.db.execute("SELECT count(*) FROM calls").fetchone()[0] == 1
    close(model)


def test_unknown_facts_cannot_assert_values_and_conflicts_need_distinct_spans():
    with pytest.raises(ValidationError):
        Fact(state="unknown", value="Two people are available")
    quote = {"evidence_id": "E1", "quote": "A fictional deadline"}
    with pytest.raises(ValidationError):
        Fact(state="conflicting", value="Two deadlines", citations=[quote, quote])


def test_source_binding_does_not_certify_interpretation(engine, item):
    item, _ = configured(engine, item)
    raw = fact_payload()
    raw["deliverables"][0]["deadline"] = {
        "state": "stated",
        "value": "An incorrect model interpretation",
        "citations": [raw["deliverables"][0]["anchor"]],
    }
    view = engine.inspect(item.source.logical_id)
    facts = DecidingFacts.model_validate(raw).bind([{"id": "E1", **view.model_dump(mode="json")}], {"E1"})
    assert facts["deliverables"][0]["authority_verified"] is False
    assert "model interpretations" in facts["interpretation"]


def test_plain_comparison_keeps_identical_text_but_omits_jev_and_fact_prompt(engine, item):
    item, request = configured(engine, item)
    request = request.model_copy(update={"method": "plain"})

    def respond(call):
        envelope = json.loads(call.content)
        body = json.loads(envelope["messages"][1]["content"])
        assert body["selected_evidence"][0]["source"]["text"] == item.source.text
        assert "assessment" not in body["selected_evidence"][0]
        assert "deciding_facts" not in envelope["messages"][0]["content"]
        return reply(structured=False)

    model = model_for(engine, respond)
    result = Decision(engine, model).run(request)
    assert "deciding_facts" not in result["decision"]
    assert result["evidence"][0]["assessment"] is not None
    close(model)
