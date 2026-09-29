"""Synthetic protocol tests; the real provider experiment lives outside Git."""

import asyncio
import json
import sys
from contextlib import contextmanager

import pytest
from mcp import Client
from mcp.client.stdio import StdioServerParameters
from test_decision import close, configured, model_for, reply
from test_feedback import feedback_request

from crowbo.decision import Decision
from crowbo.evidence import head_id
from crowbo.mcp_server import build_server, session
from crowbo.runtime import CrowboError


def test_wire_decision_and_history_reject_revoked_contributor(engine, item):
    item, request = configured(engine, item)

    @contextmanager
    def resources():
        model = model_for(engine, lambda _: reply())
        try:
            yield engine, Decision(engine, model)
        finally:
            close(model)

    async def exercise():
        async with Client(build_server(engine.settings, session_factory=resources)) as client:
            inspected = await client.call_tool("inspect_evidence", {"source_ids": list(request.source_ids)})
            assert not inspected.is_error, inspected.content
            assert inspected.structured_content["records"][0]["title"] == item.source.title
            result = await client.call_tool("run_decision", {"request": request.model_dump(mode="json")})
            assert not result.is_error
            body = result.structured_content
            assert body["decision"]["calculation"]["status"] == "missing_input"
            assert (
                body["answer"]["recommendation"]
                == "Ask the accountable owner to confirm the obligation and capacity."
            )
            saved = await client.call_tool("inspect_result", {"result_id": body["id"]})
            assert saved.structured_content["decision_ready"] is True
            assert saved.structured_content["feasibility_checked"] is False
            feedback_input = feedback_request(body).model_dump(mode="json")
            feedback = await client.call_tool("record_feedback", {"request": feedback_input})
            assert not feedback.is_error, feedback.content
            feedback_body = feedback.structured_content
            replay = await client.call_tool("record_feedback", {"request": feedback_input})
            assert replay.structured_content == feedback_body
            inspected_feedback = await client.call_tool(
                "inspect_feedback", {"feedback_id": feedback_body["id"]}
            )
            assert inspected_feedback.structured_content == feedback_body
            next_input = {
                **request.model_dump(mode="json"),
                "case_version": "2",
                "prior_feedback_id": feedback_body["id"],
            }
            child = await client.call_tool("run_decision", {"request": next_input})
            assert not child.is_error, child.content
            assert child.structured_content["decision"]["reassessment"]["prior_result_id"] == body["id"]
            engine.store.rows[head_id(item.source.logical_id)]["grant"]["revoked"] = True
            denied = await client.call_tool("inspect_result", {"result_id": body["id"]})
            assert denied.is_error
            assert "permission is unavailable" in denied.content[0].text
            assert item.source.text not in denied.content[0].text
            for tool, arguments in (
                ("inspect_feedback", {"feedback_id": feedback_body["id"]}),
                ("inspect_result", {"result_id": child.structured_content["id"]}),
            ):
                denied = await client.call_tool(tool, arguments)
                assert denied.is_error
                assert "permission is unavailable" in denied.content[0].text

    asyncio.run(exercise())


@pytest.mark.parametrize("mode,version", [("auto", "2026-07-28"), ("legacy", "2025-11-25")])
def test_stdio_client_discovers_tools_and_rejects_unbounded_inputs(engine, tmp_path, mode, version):
    settings = tmp_path / "settings.json"
    settings.write_text(engine.settings.model_dump_json())
    settings.chmod(0o600)

    async def exercise():
        params = StdioServerParameters(
            command=sys.executable,
            args=["-m", "crowbo.mcp_server", "--settings", str(settings)],
        )
        async with Client(params, mode=mode, read_timeout_seconds=15) as client:
            assert client.protocol_version == version
            listed = await client.list_tools()
            assert {tool.name for tool in listed.tools} == {
                "search_evidence",
                "inspect_evidence",
                "run_decision",
                "inspect_result",
                "record_feedback",
                "inspect_feedback",
            }
            rejected = await client.call_tool("search_evidence", {"query": "fictional", "limit": 50})
            assert rejected.is_error
            assert "less than or equal to 8" in rejected.content[0].text
            rejected = await client.call_tool("inspect_evidence", {"source_ids": ["../../secrets"]})
            assert rejected.is_error
            assert "String should match pattern" in rejected.content[0].text
            rejected = await client.call_tool(
                "record_feedback", {"request": {"result_id": "../private", "authority_verified": True}}
            )
            assert rejected.is_error

    asyncio.run(exercise())


def test_provider_exception_does_not_escape_to_mcp(engine):
    @contextmanager
    def unavailable():
        raise RuntimeError("sensitive upstream response and secret")
        yield

    async def exercise():
        async with Client(build_server(engine.settings, session_factory=unavailable)) as client:
            result = await client.call_tool("search_evidence", {"query": "fictional"})
            assert result.is_error
            assert result.content[0].text == (
                "Error executing tool search_evidence: Crowbo could not complete this operation; "
                "inspect the private runtime receipt"
            )
            assert "secret" not in json.dumps(result.model_dump())

    asyncio.run(exercise())


def test_session_closes_runtime_if_provider_creation_fails(engine, monkeypatch):
    from crowbo import mcp_server
    from crowbo.questions import DEFAULT_QUESTIONS

    opened = []
    real_runtime = mcp_server.Runtime

    def runtime(settings):
        value = real_runtime(settings)
        opened.append(value)
        return value

    def fail(_):
        raise CrowboError("Provider unavailable")

    monkeypatch.setattr(mcp_server, "Runtime", runtime)
    monkeypatch.setattr(mcp_server, "TurbopufferStore", fail)
    with (
        pytest.raises(CrowboError, match="Provider unavailable"),
        session(engine.settings, DEFAULT_QUESTIONS),
    ):
        pytest.fail("Failed session must not yield")
    import sqlite3

    with pytest.raises(sqlite3.ProgrammingError, match="closed database"):
        opened[0].db.execute("SELECT 1")
