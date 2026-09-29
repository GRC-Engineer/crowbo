"""Synthetic client receipts test the acceptance gate without live providers."""

import asyncio
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def runner():
    spec = importlib.util.spec_from_file_location(
        "scenario_proof", Path(__file__).resolve().parents[1] / "proof" / "mcp_scenarios.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ToolResult:
    def __init__(self, value=None, *, error=False):
        self.structured_content, self.is_error = value, error

    def model_dump(self, **_):
        return {"structuredContent": self.structured_content, "isError": self.is_error}


class FakeClient:
    protocol_version = "2026-07-28"

    def __init__(self, failure=None):
        self.failure = failure
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def list_tools(self):
        return SimpleNamespace(
            tools=[
                SimpleNamespace(name=name)
                for name in ("search_evidence", "inspect_evidence", "run_decision", "inspect_result")
            ]
        )

    async def call_tool(self, name, arguments, **_):
        self.calls.append(name)
        if name == "search_evidence":
            return ToolResult({"records": []}, error=arguments.get("limit") == 50 or self.failure == "search")
        if name == "inspect_evidence":
            records = [{"source_id": key, "revision_id": "b" * 64} for key in arguments["source_ids"]]
            if self.failure == "missing":
                records = []
            elif self.failure == "duplicate":
                records += records
            elif self.failure == "unexpected":
                records[0]["source_id"] = "f" * 64
            return ToolResult({"records": records})
        if name == "run_decision":
            request = arguments["request"]
            return ToolResult(
                {
                    "id": "c" * 64,
                    "simulated": True,
                    "decision": {
                        "calculation": {"status": "missing_input"},
                        "bindings": [
                            {"source_id": key, "revision_id": revision}
                            for key, revision in request["expected_revisions"].items()
                        ],
                    },
                }
            )
        return ToolResult(
            {
                "id": "d" * 64 if self.failure == "wrong_result" else arguments["result_id"],
                "decision_ready": self.failure != "stale",
                "evidence_unchanged": self.failure != "changed",
            },
            error=self.failure == "history",
        )


def execute(runner, monkeypatch, tmp_path, failure=None):
    cases = tmp_path / "cases.json"
    cases.write_text(
        json.dumps(
            {
                "dataset": "synthetic-only",
                "discovery_queries": ["fictional commitment"],
                "cases": [
                    {
                        "request": {"case_id": "synthetic-one", "source_ids": ["a" * 64]},
                        "expected_calculation_status": "missing_input",
                    }
                ],
            }
        )
    )
    cases.chmod(0o600)
    output = tmp_path / "new-result.json"
    client = FakeClient(failure)
    monkeypatch.setattr(runner, "Client", lambda *_, **__: client)
    status = asyncio.run(
        runner.run(
            SimpleNamespace(
                cases=str(cases),
                output=str(output),
                python="unused-python",
                server_dir=str(tmp_path),
                settings="unused-settings",
            )
        )
    )
    return status, json.loads(output.read_text()), client


def test_complete_client_journey_passes_and_records_each_acceptance_check(runner, monkeypatch, tmp_path):
    status, report, _ = execute(runner, monkeypatch, tmp_path)
    assert status == 0
    assert report["discovery"] == [{"query": "fictional commitment", "succeeded": True}]
    assert report["evidence_selection_complete"] is True
    assert report["result_inspection"] == {
        "requested_id": "c" * 64,
        "id_matches": True,
        "decision_ready": True,
        "evidence_unchanged": True,
        "succeeded": True,
    }
    assert report["cases"][0]["deterministic_checks"] == {
        "calculation_status": True,
        "exact_revisions": True,
        "simulation": True,
    }


@pytest.mark.parametrize("failure", ["search", "history", "wrong_result", "stale", "changed"])
def test_successful_decisions_do_not_hide_failed_discovery_or_history(runner, monkeypatch, tmp_path, failure):
    status, report, _ = execute(runner, monkeypatch, tmp_path, failure)
    assert status == 2
    assert report["cases"][0]["result"]["id"] == "c" * 64
    if failure == "search":
        assert report["discovery"] == [{"query": "fictional commitment", "succeeded": False}]
    else:
        assert report["result_inspection"]["succeeded"] is False


@pytest.mark.parametrize("failure", ["missing", "duplicate", "unexpected"])
def test_inexact_inspection_fails_before_any_decision(runner, monkeypatch, tmp_path, failure):
    status, report, client = execute(runner, monkeypatch, tmp_path, failure)
    assert status == 2
    assert report["evidence_selection_complete"] is False
    assert (
        report["failure"]
        == "Evidence inspection failed or returned missing, duplicate or unexpected source IDs"
    )
    assert client.calls == ["search_evidence", "inspect_evidence"]
