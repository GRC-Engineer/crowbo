import json

import httpx
import pytest
from conftest import batch
from pydantic import ValidationError

from crowbo.evidence import Evidence
from crowbo.providers import Jev
from crowbo.questions import QuestionSet
from crowbo.runtime import CrowboError, Runtime


@pytest.mark.parametrize(
    "kind,criteria",
    [
        ("score", [0, 1]),
        ("noul", {"true": True, "false": False}),
        ("choice", {"yes": 1, "unknown": None}),
    ],
)
def test_invalid_question_descriptions_fail_at_configuration(kind, criteria):
    with pytest.raises(ValidationError, match="descriptions"):
        QuestionSet(
            version="invalid",
            questions={"q": {"type": kind, "instructions": "A bounded judgment", "criteria": criteria}},
        )


def test_custom_jev_questions_reassess_without_reembedding_and_keep_old_answers(engine, item, settings):
    engine.ingest(batch(item))
    original = engine.inspect(item.source.logical_id).assessment
    questions = QuestionSet(
        version="exposure-v1",
        questions={
            "deployment": {
                "type": "choice",
                "instructions": "What deployment state is actually evidenced?",
                "criteria": {"verified": "Live verification", "unknown": "No live verification"},
            },
            "impact": {
                "type": "score",
                "instructions": "How much supported impact is described?",
                "criteria": ["Unestablished", "Limited", "Material"],
            },
        },
    )

    def respond(request):
        sent = json.loads(request.content)
        assert sent["input"]["state"]["text"] == item.source.text
        assert sent["input"]["questions"]["deployment"]["criteria"] == {
            "verified": "Live verification",
            "unknown": "No live verification",
        }
        return httpx.Response(
            200,
            json={
                "success": True,
                "result": {
                    "model": "jev-test",
                    "usage": {"input_tokens": 10, "output_tokens": 5},
                    "answers": {
                        "deployment": {
                            "type": "choice",
                            "choice": "unknown",
                            "confidence": 0.99,
                            "probabilities": {"verified": 0.0, "unknown": 1.0},
                        },
                        "impact": {
                            "type": "score",
                            "score": 0,
                            "confidence": 0.99,
                            "legend": {"0": "Unestablished", "1": "Limited", "2": "Material"},
                            "probabilities": {"0": 1.0, "1": 0.0, "2": 0.0},
                        },
                    },
                },
            },
        )

    runtime = Runtime(settings)
    jev = Jev(runtime, httpx.Client(transport=httpx.MockTransport(respond)), "test-token", questions)
    revised = Evidence(settings, engine.store, jev, questions)
    before = revised.inspect(item.source.logical_id)
    assert before.assessment == original and before.assessment_current is False
    assert revised.resume()[0]["assessment_ready"] is True
    view = revised.inspect(item.source.logical_id)
    assert view.assessment_current is True
    assert view.assessment.answers["deployment"].choice == "unknown"
    assert view.assessment.answers["impact"].score == 0
    assert view.assessment.questions == questions.questions
    revised.resume()
    assert runtime.db.execute("SELECT count(*) FROM calls").fetchone()[0] == 1
    assert len(engine.store.indexed) == 1
    assert any(row.get("criteria_hash") == original.criteria_hash for row in engine.store.rows.values())
    jev.close()
    runtime.close()


def test_answer_cannot_introduce_unconfigured_choice(settings, item):
    questions = QuestionSet(
        version="v1",
        questions={
            "state": {
                "type": "choice",
                "instructions": "Is deployment verified?",
                "criteria": {"verified": "Yes", "unknown": "Not established"},
            }
        },
    )
    body = {
        "success": True,
        "result": {
            "model": "jev-test",
            "usage": {"input_tokens": 1, "output_tokens": 1},
            "answers": {
                "state": {
                    "type": "choice",
                    "choice": "invented",
                    "confidence": 1,
                    "probabilities": {"invented": 1},
                }
            },
        },
    }
    runtime = Runtime(settings)
    jev = Jev(
        runtime,
        httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body))),
        "test-token",
        questions,
    )
    with pytest.raises(CrowboError, match="validation"):
        jev.assess(item.source)
    jev.close()
    runtime.close()
