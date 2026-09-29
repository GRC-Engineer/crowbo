"""Replay private development cases through MCP; imports no Crowbo internals."""

import argparse
import asyncio
import json
import os
import time
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path

from mcp import Client
from mcp.client.stdio import StdioServerParameters


def private_path(value):
    path = Path(value).expanduser().resolve()
    if any((parent / ".git").exists() for parent in (path, *path.parents)):
        raise ValueError("Evaluation inputs and outputs must be outside Git checkouts")
    if path.exists() and path.stat().st_mode & 0o077:
        raise ValueError("Private files require owner-only permissions")
    return path


def comparison_contract(cases):
    """Reject unequal paired inputs before dispatch. Expectations never enter model input."""
    groups = {}
    for case in cases:
        if group := case.get("comparison_group"):
            groups.setdefault(group, []).append(case)
    for pair in groups.values():
        access = all(case["request"].get("access") for case in pair)
        methods = {"crowbo", "plain", "crowbo_without_jev"} if access else {"crowbo", "plain"}
        if len(pair) != len(methods) or {case["request"].get("method") for case in pair} != methods:
            raise ValueError("Comparison requires every declared method exactly once")
        if access and any(case.get("feedback") for case in pair):
            raise ValueError("Access comparisons must not include corrective feedback")
        inputs = [
            {
                "request": {
                    k: v for k, v in case["request"].items() if k not in {"method", "case_id", "case_version"}
                },
                "feedback": case.get("feedback"),
            }
            for case in pair
        ]
        if any(value != inputs[0] for value in inputs) or any(
            case["request"].get("prior_feedback_id") for case in pair
        ):
            raise ValueError("Paired comparison inputs or corrections differ")
    return groups


def comparison_receipts(report):
    groups = comparison_contract([case["case"] for case in report["cases"]])
    receipts = []
    for group in groups:
        pair = [c for c in report["cases"] if c["case"].get("comparison_group") == group]
        results = [c["result"] for c in pair]
        if not all(results):
            receipts.append({"group": group, "complete": False})
            continue
        common = []
        for result in results:
            config = result.get("reasoning_configuration", {})
            common.append(
                {
                    "bindings": result["decision"]["bindings"],
                    "model": config.get("model"),
                    "effort": config.get("reasoning_effort"),
                    "max_completion_tokens": config.get("max_completion_tokens"),
                    "returned_model": result["provider"]["returned_model"],
                    **(
                        {
                            "source_input_hash": result.get("source_input_hash"),
                            "answer_schema_hash": result.get("answer_schema_hash"),
                            "common_payload_hash": result["provider"].get("common_payload_hash"),
                        }
                        if pair[0]["case"]["request"].get("access")
                        else {}
                    ),
                }
            )
        comparable = all(value == common[0] for value in common) and all(
            common[0][k] is not None for k in ("model", "effort", "max_completion_tokens")
        )
        access = bool(pair[0]["case"]["request"].get("access"))
        assistance = all(
            result.get("reasoning_configuration", {}).get("include_jev")
            == (case["case"]["request"]["method"] == "crowbo")
            and result.get("reasoning_configuration", {}).get("answer_format")
            == (
                "access"
                if access
                else ("deciding_facts" if case["case"]["request"]["method"] == "crowbo" else "prose")
            )
            and result.get("prompt_hash")
            for case, result in zip(pair, results, strict=True)
        )
        if access:
            methods = {
                case["case"]["request"]["method"]: result for case, result in zip(pair, results, strict=True)
            }
            assistance &= all(
                result["reasoning_configuration"].get("access_guidance") == (method != "plain")
                for method, result in methods.items()
            )
            assistance &= methods["crowbo"]["prompt_hash"] == methods["crowbo_without_jev"]["prompt_hash"]
            comparable &= all(
                common[0][key] for key in ("source_input_hash", "answer_schema_hash", "common_payload_hash")
            )
        shared_request = {
            k: v
            for k, v in pair[0]["case"]["request"].items()
            if k not in {"method", "case_id", "case_version"}
        }
        receipts.append(
            {
                "group": group,
                "complete": True,
                "equivalent_inputs_verified": bool(comparable and assistance),
                "common_input_hash": sha256(
                    json.dumps(
                        [shared_request, pair[0]["case"].get("feedback"), common[0]], sort_keys=True
                    ).encode()
                ).hexdigest()
                if comparable
                else None,
                "result_ids": [r["id"] for r in results],
                "declared_difference": (
                    "Same access schema and source payload: strong plain prompt; guided without Jev; same guided prompt with contextual Jev. Guided pair isolates supplied Jev context."
                    if access
                    else "Jev plus structured fact assistance versus prose without Jev; not an isolated Jev test"
                ),
            }
        )
    return receipts


async def run(args):
    cases = json.loads(private_path(args.cases).read_text())
    comparison_contract(cases["cases"])
    if not 1 <= len(cases["cases"]) <= 10:
        raise ValueError("Select one to ten bounded development cases")
    discovery_queries = cases.get("discovery_queries", [])
    if len(discovery_queries) > 2:
        raise ValueError("Select at most two discovery queries")
    output = private_path(args.output)
    if output.exists():
        raise ValueError("Choose a new result filename; prior runs are immutable")
    report = {
        "started_at": datetime.now(UTC).isoformat(),
        "dataset": cases["dataset"],
        "expectation_qualification": "assistant-authored development candidates; not independently reviewed",
        "judgment_qualified": False,
        "calls": [],
        "cases": [],
        "discovery": [],
        "result_inspection": {"succeeded": False},
    }

    def persist():
        with output.open("w") as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
        output.chmod(0o600)

    async def call(client, name, arguments):
        started = time.monotonic()
        result = await client.call_tool(name, arguments, read_timeout_seconds=240)
        value = result.model_dump(mode="json")
        report["calls"].append(
            {"tool": name, "seconds": round(time.monotonic() - started, 3), "result": value}
        )
        persist()
        if result.is_error:
            return None
        return result.structured_content

    params = StdioServerParameters(
        command=args.python,
        args=["-m", "crowbo.mcp_server", "--settings", args.settings],
        cwd=args.server_dir,
    )
    async with Client(params, read_timeout_seconds=240) as client:
        report["protocol_version"] = client.protocol_version
        report["tools"] = [tool.name for tool in (await client.list_tools()).tools]
        for query in discovery_queries:
            discovered = await call(
                client, "search_evidence", {"query": query, "mode": "semantic", "limit": 3}
            )
            report["discovery"].append({"query": query, "succeeded": discovered is not None})
        ids = list(dict.fromkeys(key for case in cases["cases"] for key in case["request"]["source_ids"]))
        inspected = await call(client, "inspect_evidence", {"source_ids": ids})
        returned_ids = [record["source_id"] for record in inspected["records"]] if inspected else []
        report["evidence_selection_complete"] = (
            inspected is not None
            and bool(ids)
            and len(returned_ids) == len(ids)
            and set(returned_ids) == set(ids)
        )
        if not report["evidence_selection_complete"]:
            report["failure"] = (
                "Evidence inspection failed or returned missing, duplicate or unexpected source IDs"
            )
            report["completed_at"] = datetime.now(UTC).isoformat()
            persist()
            return 2
        revisions = {r["source_id"]: r["revision_id"] for r in inspected["records"]}
        for case in cases["cases"]:
            request = case["request"]
            if not request.get("expected_revisions"):
                request["expected_revisions"] = {key: revisions[key] for key in request["source_ids"]}
            result = await call(client, "run_decision", {"request": request})
            checks = {}
            if result is not None:
                calculation = result["decision"]["calculation"]
                checks["calculation_status"] = calculation["status"] == case["expected_calculation_status"]
                if "expected_annual_loss" in case:
                    from decimal import Decimal

                    checks["arithmetic"] = Decimal(calculation["expected_annual_loss"]) == Decimal(
                        case["expected_annual_loss"]
                    )
                checks["exact_revisions"] = {
                    b["source_id"]: b["revision_id"] for b in result["decision"]["bindings"]
                } == request["expected_revisions"]
                checks["simulation"] = result["simulated"] is True
            case_report = {"case": case, "result": result, "deterministic_checks": checks}
            report["cases"].append(case_report)
            persist()
            print(
                json.dumps({"case": request["case_id"], "completed": result is not None, "checks": checks}),
                flush=True,
            )
            if result is not None and "feedback" in case:
                feedback_request = {
                    **case["feedback"],
                    "result_id": result["id"],
                    "reviewed_at": datetime.now(UTC).isoformat(),
                    "supporting_revisions": request["expected_revisions"],
                }
                feedback = await call(client, "record_feedback", {"request": feedback_request})
                case_report["feedback"] = feedback
                checks["feedback_saved"] = feedback is not None
                if feedback is not None:
                    corrected = {
                        **request,
                        "case_version": request["case_version"] + "-corrected",
                        "prior_feedback_id": feedback["id"],
                    }
                    reassessed = await call(client, "run_decision", {"request": corrected})
                    case_report["reassessment"] = reassessed
                    checks["reassessment_saved"] = reassessed is not None
                    if reassessed is not None:
                        checks["feedback_referenced"] = (
                            reassessed["decision"]["request"]["prior_feedback_id"] == feedback["id"]
                        )
                        checks["reassessment_revisions"] = (
                            reassessed["decision"]["bindings"] == result["decision"]["bindings"]
                        )
                    original = await call(client, "inspect_result", {"result_id": result["id"]})
                    checks["original_preserved"] = (
                        original is not None and original["answer"] == result["answer"]
                    )
                persist()
                print(json.dumps({"case": request["case_id"], "correction_checks": checks}), flush=True)
        completed = [case for case in report["cases"] if case["result"] is not None]
        if completed:
            identifier = completed[0]["result"]["id"]
            saved = await call(client, "inspect_result", {"result_id": identifier})
            inspection = {
                "requested_id": identifier,
                "id_matches": saved is not None and saved.get("id") == identifier,
                "decision_ready": saved is not None and saved.get("decision_ready") is True,
                "evidence_unchanged": saved is not None and saved.get("evidence_unchanged") is True,
            }
            report["result_inspection"] = {
                **inspection,
                "succeeded": all(
                    inspection[key] for key in ("id_matches", "decision_ready", "evidence_unchanged")
                ),
            }
        # Expected schema denial: no source access or provider call should be attempted.
        denied = await client.call_tool("search_evidence", {"query": "bounded test", "limit": 50})
        report["expected_schema_denial"] = denied.is_error
        report["comparisons"] = comparison_receipts(report)
        report["completed_at"] = datetime.now(UTC).isoformat()
        persist()
    return (
        0
        if len(completed) == len(cases["cases"])
        and all(all(case["deterministic_checks"].values()) for case in completed)
        and all(item["succeeded"] for item in report["discovery"])
        and report["result_inspection"]["succeeded"]
        and report["expected_schema_denial"]
        and all(c.get("equivalent_inputs_verified", False) for c in report["comparisons"])
        else 2
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("python", "server-dir", "settings", "cases", "output"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
