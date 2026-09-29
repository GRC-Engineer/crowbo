import json
from datetime import timedelta

import httpx
import pytest
from conftest import batch
from pydantic import ValidationError

from crowbo.cli import main
from crowbo.contracts import now
from crowbo.review import Reasoner, Review, ReviewRequest
from crowbo.runtime import CrowboError, Runtime

MODEL = "openai/gpt-6-luna"


@pytest.mark.parametrize(
    "model,effort", [(MODEL, "max"), ("@cf/zai-org/glm-5.3-flash", "xhigh"), ("deepseek/v4.1-flash", "high")]
)
def test_unsupported_model_configuration_is_rejected_before_runtime(model, effort):
    with pytest.raises(ValidationError):
        ReviewRequest(
            question="A fictional question", source_ids=("d" * 64,), model=model, reasoning_effort=effort
        )


def response():
    return {
        "model": "gpt-6-luna",
        "usage": {"prompt_tokens": 120, "completion_tokens": 40},
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": json.dumps(
                        {
                            "recommendation": "Confirm the obligation and available capacity before committing.",
                            "rationale": "The source requests a review but supplies no obligation [E1].",
                            "alternatives": ["Proceed with independently confirmed work."],
                            "uncertainties": ["Available hours are unknown."],
                            "evidence_ids": ["E1"],
                        }
                    )
                },
            }
        ],
    }


def configured(engine, item):
    engine.settings = engine.settings.model_copy(
        update={"query_processors": ("turbopuffer", "voyage", MODEL)}
    )
    item = item.model_copy(
        update={"grant": item.grant.model_copy(update={"processors": (*item.grant.processors, MODEL)})}
    )
    engine.ingest(batch(item))
    return item, ReviewRequest(
        question="What should we do next?",
        source_ids=(item.source.logical_id,),
        model=MODEL,
        reasoning_effort="high",
    )


def reasoner(engine, handler):
    runtime = Runtime(engine.settings)
    return Reasoner(runtime, httpx.Client(transport=httpx.MockTransport(handler)), "test-token")


def close(model):
    model.close()
    model.runtime.close()


def test_review_uses_exact_evidence_preserves_jev_and_history_needs_no_model(engine, item):
    item, request = configured(engine, item)

    def respond(call):
        assert str(call.url).endswith("/ai/v1/chat/completions")
        body = json.loads(call.content)
        assert body["model"] == MODEL and body["reasoning_effort"] == "high"
        assert body["store"] is False and "tools" not in body
        assert call.headers["cf-aig-collect-log-payload"] == "false"
        facts = json.loads(body["messages"][1]["content"])["selected_evidence"]
        assert facts[0]["source"]["text"] == item.source.text
        assert facts[0]["assessment"]["answers"]["commitment_evidence"]["choice"] == "insufficient"
        assert facts[0]["assessment"]["questions"]["obligation_stated"]["type"] == "noul"
        return httpx.Response(200, json=response())

    model = reasoner(engine, respond)
    result = Review(engine, model).run(request)
    assert (
        result["answer"]["recommendation"]
        == "Confirm the obligation and available capacity before committing."
    )
    assert result["evidence_unchanged"] is True
    assert result["feasibility_checked"] is False and result["simulated"] is True
    assert Review(engine, None).inspect(result["id"]) == result
    assert model.runtime.db.execute("SELECT count(*) FROM calls").fetchone()[0] == 1
    close(model)


def test_reasoning_timeout_is_reported_and_recorded_without_saving_review(engine, item):
    _, request = configured(engine, item)

    def timeout(call):
        raise httpx.ReadTimeout("Provider detail must not be logged", request=call)

    model = reasoner(engine, timeout)
    with pytest.raises(CrowboError, match="timed out"):
        Review(engine, model).run(request)
    receipt = json.loads(model.runtime.db.execute("SELECT receipt FROM calls").fetchone()[0])
    assert receipt == {"requested_model": MODEL, "error": "timeout"}
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    close(model)


@pytest.mark.parametrize("denial", ["route", "storage", "source", "expired"])
def test_review_denies_before_any_model_call(engine, item, denial):
    item, request = configured(engine, item)
    if denial == "route":
        engine.settings = engine.settings.model_copy(update={"query_processors": ()})
    elif denial == "storage":
        engine.settings = engine.settings.model_copy(update={"query_processors": (MODEL,)})
    else:
        changes = {"processors": ("turbopuffer", "jev", "voyage"), "checked_at": now()}
        if denial == "expired":
            changes.update(checked_at=now() - timedelta(minutes=2), expires_at=now() - timedelta(minutes=1))
        engine.ingest(batch(item.model_copy(update={"grant": item.grant.model_copy(update=changes)})))
    model = reasoner(engine, lambda _: pytest.fail("Denied content reached inference"))
    with pytest.raises(CrowboError, match="permi"):
        Review(engine, model).run(request)
    assert model.runtime.db.execute("SELECT count(*) FROM calls").fetchone()[0] == 0
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    close(model)


def test_revocation_during_reasoning_prevents_return_and_storage(engine, item):
    item, request = configured(engine, item)

    def respond(_):
        revoked = item.model_copy(
            update={"grant": item.grant.model_copy(update={"revoked": True, "checked_at": now()})}
        )
        engine.ingest(batch(revoked))
        return httpx.Response(200, json=response())

    model = reasoner(engine, respond)
    with pytest.raises(CrowboError, match="permission"):
        Review(engine, model).run(request)
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    close(model)


@pytest.mark.parametrize(
    "failure", ["invented_reference", "inline_reference", "truncated", "wrong_model", "invalid_json"]
)
def test_bad_recommendation_is_not_saved(engine, item, failure):
    item, request = configured(engine, item)
    body = response()
    message = body["choices"][0]["message"]
    if failure == "truncated":
        body["choices"][0]["finish_reason"] = "length"
    elif failure == "wrong_model":
        body["model"] = "unrequested-model"
    elif failure == "invalid_json":
        message["content"] = "not json"
    else:
        answer = json.loads(message["content"])
        if failure == "invented_reference":
            answer["evidence_ids"] = ["E999"]
        else:
            answer["rationale"] = "Unsupported conclusion [E999]."
        message["content"] = json.dumps(answer)
    model = reasoner(engine, lambda _: httpx.Response(200, json=body))
    with pytest.raises(CrowboError):
        Review(engine, model).run(request)
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    close(model)


def test_incomplete_response_preserves_token_receipt_without_saving_recommendation(engine, item):
    _, request = configured(engine, item)
    body = response()
    body["choices"][0]["finish_reason"] = "length"
    body["usage"] = {
        "prompt_tokens": 8120,
        "completion_tokens": 4096,
        "total_tokens": 12216,
        "completion_tokens_details": {"reasoning_tokens": 4096},
    }
    model = reasoner(engine, lambda _: httpx.Response(200, json=body))
    with pytest.raises(CrowboError, match=r"did not finish successfully \(length\)"):
        Review(engine, model).run(request)
    receipt = json.loads(model.runtime.db.execute("SELECT receipt FROM calls").fetchone()[0])
    assert receipt == {
        "http_status": 200,
        "requested_model": "openai/gpt-6-luna",
        "returned_model": "gpt-6-luna",
        "finish_reasons": ["length"],
        "usage": {
            "prompt_tokens": 8120,
            "completion_tokens": 4096,
            "total_tokens": 12216,
            "completion_tokens_details": {"reasoning_tokens": 4096},
        },
    }
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    close(model)


@pytest.mark.parametrize("failure", ["extra_field", "wrong_type", "invalid_json"])
def test_schema_failure_reports_categories_without_private_values(engine, item, failure):
    _, request = configured(engine, item)
    body = response()
    message = body["choices"][0]["message"]
    answer = json.loads(message["content"])
    if failure == "extra_field":
        answer["private-secret-key"] = "private-secret-value"
        category = "extra_forbidden"
    elif failure == "wrong_type":
        answer["recommendation"] = {"private-secret-key": "private-secret-value"}
        category = "string_type"
    else:
        category = "json_invalid"
    message["content"] = "private-secret-value" if failure == "invalid_json" else json.dumps(answer)
    model = reasoner(engine, lambda _: httpx.Response(200, json=body))
    try:
        with pytest.raises(CrowboError, match=category) as failure_info:
            Review(engine, model).run(request)
        receipt = json.loads(model.runtime.db.execute("SELECT receipt FROM calls").fetchone()[0])
        assert receipt["validation"] == {"count": 1, "types": [category]}
        assert receipt["usage"] == {"prompt_tokens": 120, "completion_tokens": 40}
        assert "private-secret" not in json.dumps(receipt) + str(failure_info.value)
        assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    finally:
        close(model)


@pytest.mark.parametrize("reason", ["private provider diagnostic", {"private": "provider diagnostic"}])
def test_provider_metadata_is_sanitized_in_error_and_receipt(engine, item, reason):
    _, request = configured(engine, item)
    body = response()
    body["model"] = "private provider identifier"
    body["choices"][0]["finish_reason"] = reason
    body["usage"] = {
        "prompt_tokens": 50,
        "completion_tokens": -1,
        "total_tokens": "private detail",
        "input_tokens": True,
        "output_tokens": 1_000_000_001,
        "provider_log": "private payload",
        "completion_tokens_details": {"reasoning_tokens": 12, "debug": "private detail"},
    }
    model = reasoner(engine, lambda _: httpx.Response(200, json=body))
    with pytest.raises(CrowboError, match=r"did not finish successfully \(unexpected\)"):
        Review(engine, model).run(request)
    receipt = json.loads(model.runtime.db.execute("SELECT receipt FROM calls").fetchone()[0])
    assert receipt["returned_model"] == "unexpected"
    assert receipt["finish_reasons"] == ["unexpected"]
    assert receipt["usage"] == {"prompt_tokens": 50, "completion_tokens_details": {"reasoning_tokens": 12}}
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    close(model)


def test_history_retains_old_basis_but_rechecks_current_access(engine, item):
    item, request = configured(engine, item)
    model = reasoner(engine, lambda _: httpx.Response(200, json=response()))
    first = Review(engine, model).run(request)
    changed = item.model_copy(
        update={
            "source": item.source.model_copy(
                update={
                    "text": "A new source assertion changes the available options.",
                    "updated_at": now(),
                    "observed_at": now(),
                }
            )
        }
    )
    engine.ingest(batch(changed))
    history = Review(engine, None).inspect(first["id"])
    assert history["evidence_unchanged"] is False
    assert history["evidence"][0]["source"]["text"] == item.source.text
    engine.ingest(
        batch(
            changed.model_copy(
                update={"grant": changed.grant.model_copy(update={"checked_at": now(), "revoked": True})}
            )
        )
    )
    with pytest.raises(CrowboError, match="permission"):
        Review(engine, None).inspect(first["id"])
    close(model)


def test_conflicting_current_evidence_does_not_hide_permitted_history(engine, item):
    item, request = configured(engine, item)
    model = reasoner(engine, lambda _: httpx.Response(200, json=response()))
    first = Review(engine, model).run(request)
    conflict = item.model_copy(
        update={"source": item.source.model_copy(update={"text": "Conflicting assertion"})}
    )
    engine.ingest(batch(conflict))
    with pytest.raises(CrowboError, match="Conflicting"):
        engine.inspect(item.source.logical_id)
    history = Review(engine, None).inspect(first["id"])
    assert history["evidence_unchanged"] is False
    assert history["evidence"][0]["source"]["text"] == item.source.text
    close(model)


def test_source_change_during_reasoning_invalidates_new_result(engine, item):
    item, request = configured(engine, item)

    def respond(_):
        changed = item.model_copy(
            update={
                "source": item.source.model_copy(
                    update={"text": "A material new fact", "updated_at": now(), "observed_at": now()}
                )
            }
        )
        engine.ingest(batch(changed))
        return httpx.Response(200, json=response())

    model = reasoner(engine, respond)
    with pytest.raises(CrowboError, match="changed"):
        Review(engine, model).run(request)
    assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    assert engine.inspect(item.source.logical_id).source.text == "A material new fact"
    close(model)


@pytest.mark.parametrize("revoke", [False, True])
def test_multi_source_review_batches_reads_and_rechecks_nonfirst_source(engine, item, revoke, monkeypatch):
    item, request = configured(engine, item)
    second = item.model_copy(update={"source": item.source.model_copy(update={"native_id": "second"})})
    engine.ingest(batch(second))
    request = request.model_copy(update={"source_ids": (item.source.logical_id, second.source.logical_id)})
    reads = []
    original = engine.store.get_many

    def record(keys):
        reads.append(list(keys))
        return original(keys)

    monkeypatch.setattr(engine.store, "get_many", record)

    def respond(_):
        if revoke:
            engine.ingest(
                batch(
                    second.model_copy(
                        update={
                            "grant": second.grant.model_copy(update={"revoked": True, "checked_at": now()})
                        }
                    )
                )
            )
        return httpx.Response(200, json=response())

    model = reasoner(engine, respond)
    if revoke:
        with pytest.raises(CrowboError, match="permission"):
            Review(engine, model).run(request)
        assert not any(row.get("kind") == "review" for row in engine.store.rows.values())
    else:
        result = Review(engine, model).run(request)
        assert [e["source"]["native_id"] for e in result["evidence"]] == [item.source.native_id, "second"]
        assert result["evidence_unchanged"]
        assert len(reads) <= 10
    close(model)


def test_glm_uses_selected_route_and_preserves_returned_model(engine, item):
    item, original = configured(engine, item)
    glm = "@cf/zai-org/glm-5.3-flash"
    engine.settings = engine.settings.model_copy(update={"query_processors": ("turbopuffer", glm)})
    item = item.model_copy(
        update={
            "grant": item.grant.model_copy(
                update={"processors": (*item.grant.processors, glm), "checked_at": now()}
            )
        }
    )
    engine.ingest(batch(item))
    request = original.model_copy(update={"model": glm, "reasoning_effort": "high"})

    def respond(call):
        body = json.loads(call.content)
        assert body["model"] == glm and body["reasoning_effort"] == "high"
        reply = response()
        reply["model"] = "glm-5.3-flash"
        return httpx.Response(200, json=reply)

    model = reasoner(engine, respond)
    result = Review(engine, model).run(request)
    assert result["provider"]["returned_model"] == "glm-5.3-flash"
    assert result["request"]["model"] == glm
    close(model)


def test_cli_review_writes_private_result_and_prints_no_evidence(engine, item, tmp_path, monkeypatch, capsys):
    item, request = configured(engine, item)
    config = tmp_path / "config.json"
    config.write_text(engine.settings.model_dump_json())
    config.chmod(0o600)
    query = tmp_path / "request.json"
    query.write_text(request.model_dump_json())
    query.chmod(0o600)
    engine.store.close = lambda: None
    monkeypatch.setattr("crowbo.cli.TurbopufferStore", lambda _: engine.store)
    monkeypatch.setattr(
        "crowbo.cli.Reasoner",
        lambda runtime: Reasoner(
            runtime,
            httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response()))),
            "test-token",
        ),
    )
    assert main(["--settings", str(config), "review", str(query)]) == 0
    output = capsys.readouterr().out
    assert "recommendation" not in output and item.source.text not in output
    report = json.loads(output)["private_report"]
    with open(report) as stream:
        saved = json.load(stream)["records"][0]
    assert saved["answer"]["evidence_ids"] == ["E1"]
    assert saved["evidence_unchanged"] is True
