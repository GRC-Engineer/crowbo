"""Paired development inputs must remain comparable before inference."""

import importlib.util
from copy import deepcopy
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "scenarios", Path(__file__).resolve().parents[1] / "proof" / "mcp_scenarios.py"
)
scenarios = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scenarios)


def pair():
    return [
        {
            "comparison_group": "synthetic",
            "request": {
                "case_id": "fictional-" + method,
                "method": method,
                "question": "What comes next?",
                "source_ids": ["a" * 64],
                "context": "Synthetic example",
            },
            "feedback": {"rationale": "Candidate correction"},
        }
        for method in ("crowbo", "plain")
    ]


@pytest.mark.parametrize("difference", ["question", "source_ids", "feedback"])
def test_unequal_comparisons_fail_before_dispatch(difference):
    cases = pair()
    if difference == "feedback":
        cases[1]["feedback"]["rationale"] = "A different correction"
    else:
        cases[1]["request"][difference] = "Different"
    with pytest.raises(ValueError, match="inputs or corrections differ"):
        scenarios.comparison_contract(cases)


def test_receipt_does_not_claim_equivalence_when_limits_or_source_bindings_differ():
    cases = pair()
    result = {
        "id": "fictional-id",
        "decision": {"bindings": [{"revision_id": "a" * 64, "criteria_hash": "b" * 64}]},
        "reasoning_configuration": {
            "model": "test",
            "reasoning_effort": "high",
            "max_completion_tokens": 8192,
        },
        "provider": {"returned_model": "test"},
        "prompt_hash": "synthetic-prompt-hash",
    }
    report = {"cases": [{"case": case, "result": deepcopy(result)} for case in cases]}
    for case in report["cases"]:
        structured = case["case"]["request"]["method"] == "crowbo"
        case["result"]["reasoning_configuration"].update(
            include_jev=structured, answer_format="deciding_facts" if structured else "prose"
        )
    assert scenarios.comparison_receipts(report)[0]["equivalent_inputs_verified"] is True
    report["cases"][1]["result"]["reasoning_configuration"]["max_completion_tokens"] = 4096
    assert scenarios.comparison_receipts(report)[0]["equivalent_inputs_verified"] is False


def access_triple():
    cases = pair()
    cases.append(deepcopy(cases[0]))
    cases[-1]["request"]["method"] = "crowbo_without_jev"
    for case in cases:
        case.pop("feedback")
        case["request"]["access"] = {"system": "demo", "account_id": "demo-account", "scope": "demo-org"}
    return cases


@pytest.mark.parametrize("failure", ["third_input", "feedback", "missing_arm"])
def test_access_comparison_rejects_unfair_inputs(failure):
    cases = access_triple()
    if failure == "third_input":
        cases[-1]["request"]["context"] = "A private hint unavailable to the other arms"
    elif failure == "feedback":
        cases[-1]["feedback"] = {"rationale": "A corrective hint"}
    else:
        cases.pop()
    with pytest.raises(ValueError):
        scenarios.comparison_contract(cases)


def test_access_receipt_requires_same_schema_sources_and_guided_prompt():
    cases = access_triple()
    report = {"cases": []}
    for case in cases:
        method = case["request"]["method"]
        report["cases"].append(
            {
                "case": case,
                "result": {
                    "id": method,
                    "decision": {"bindings": [{"revision_id": "a" * 64}]},
                    "reasoning_configuration": {
                        "model": "test",
                        "reasoning_effort": "high",
                        "max_completion_tokens": 8192,
                        "answer_format": "access",
                        "include_jev": method == "crowbo",
                        "access_guidance": method != "plain",
                    },
                    "provider": {"returned_model": "test", "common_payload_hash": "same-payload"},
                    "prompt_hash": "plain" if method == "plain" else "guided",
                    "answer_schema_hash": "same-schema",
                    "source_input_hash": "same-sources",
                },
            }
        )
    assert scenarios.comparison_receipts(report)[0]["equivalent_inputs_verified"] is True
    report["cases"][-1]["result"]["provider"]["common_payload_hash"] = "different"
    assert scenarios.comparison_receipts(report)[0]["equivalent_inputs_verified"] is False
    report["cases"][-1]["result"]["provider"]["common_payload_hash"] = "same-payload"
    report["cases"][-1]["result"]["answer_schema_hash"] = "different"
    assert scenarios.comparison_receipts(report)[0]["equivalent_inputs_verified"] is False
    report["cases"][-1]["result"]["answer_schema_hash"] = "same-schema"
    report["cases"][-1]["result"]["prompt_hash"] = "different"
    assert scenarios.comparison_receipts(report)[0]["equivalent_inputs_verified"] is False
