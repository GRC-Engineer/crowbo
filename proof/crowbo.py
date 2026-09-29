"""Offline, synthetic programme decision proof. No execution or network capability."""

import argparse
import hashlib
import itertools
import json
import re
import sys
from datetime import date
from pathlib import Path


VERSION = "programme-proof-0.1"
FIXTURE = Path(__file__).parent / "fixtures" / "programme.json"
RESOURCES = ("security_half_days", "platform_half_days", "cash_usd")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    require(path.stat().st_size <= 2_000_000, "Input exceeds the 2 MB proof limit")

    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Duplicate JSON field")
            result[key] = value
        return result

    return json.loads(path.read_text(), object_pairs_hook=unique_pairs)


def text(value):
    return isinstance(value, str) and 0 < len(value) <= 4000


def identifier(value):
    return isinstance(value, str) and re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", value)


def number(value):
    return type(value) is int and 0 <= value <= 1_000_000


def day(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value), "Expected ISO date")
    return date.fromisoformat(value)


def validate(data):
    require(data["synthetic"] is True and data["schema_version"] == 1, "Only synthetic v1 packets are supported")
    require(identifier(data["tenant"]) and identifier(data["owner"]), "Invalid programme identity")
    require(data["owner"] in data["principals"], "Owner must be a declared principal")
    require(all(identifier(p) for p in data["principals"]), "Invalid principal")
    controls = data["controls"]
    require(1 <= len(controls) <= 10, "Expected 1 to 10 controls")
    for key, control in controls.items():
        require(identifier(key) and text(control["scope"]) and text(control["claim"]), "Invalid control")
        require(number(control["max_age_days"]), "Invalid freshness window")
    records = data["evidence"]
    require(len(records) <= 1000, "Too many evidence records")
    ids = [e["id"] for e in records]
    require(len(ids) == len(set(ids)), "Duplicate evidence identifier")
    by_id = {e["id"]: e for e in records}
    for evidence in records:
        require(identifier(evidence["id"]) and identifier(evidence["tenant"]), "Invalid evidence identity")
        require(evidence["control"] in controls, "Unknown evidence control")
        require(evidence["kind"] in {"observation", "assertion", "requirement"}, "Invalid source kind")
        require(type(evidence["gap"]) is bool, "Gap interpretation must be a boolean")
        require(evidence["coverage"] in {"complete", "partial"}, "Invalid coverage")
        require(evidence["synthetic"] is True, "Non-synthetic evidence is outside this proof")
        require(all(text(evidence[k]) for k in ("scope", "source", "text", "interpretation_basis")), "Invalid evidence text")
        require(isinstance(evidence["readers"], list) and all(identifier(p) for p in evidence["readers"]), "Invalid evidence readers")
        require(day(evidence["observed_start"]) <= day(evidence["observed_end"]) <= day(evidence["recorded_at"]), "Invalid observation chronology")
        if evidence.get("supersedes"):
            old = by_id[evidence["supersedes"]]
            require(all(evidence[k] == old[k] for k in ("tenant", "control", "scope")), "Supersession changes claim scope")
            require(day(old["recorded_at"]) < day(evidence["recorded_at"]), "Supersession must move forward in time")
    actions = data["actions"]
    require(1 <= len(actions) <= 12, "Expected 1 to 12 actions for bounded enumeration")
    require(len({a["id"] for a in actions}) == len(actions), "Duplicate action identifier")
    for action in actions:
        require(identifier(action["id"]) and action["control"] in controls, "Invalid action identity")
        require(action["mode"] in {"improve", "investigate", "maintain"}, "Invalid action mode")
        require(number(action["priority"]), "Invalid proposed priority")
        require(all(text(action[k]) for k in ("label", "business_basis", "assumption", "would_change")), "Invalid action explanation")
        for resource in RESOURCES:
            bounds = action["effort"][resource]
            require(isinstance(bounds, list) and len(bounds) == 2 and all(number(n) for n in bounds) and bounds[0] <= bounds[1], "Invalid effort range")
    for case in data["cases"].values():
        day(case["as_of"])
        require(set(case["evidence_ids"]) <= set(ids), "Unknown case evidence")
        require(set(case["required_actions"]) <= {a["id"] for a in actions}, "Unknown commitment action")
        require(all(case["capacity"][r] is None or number(case["capacity"][r]) for r in RESOURCES), "Invalid capacity")


def packet(path, case_id, tenant, principal, as_of):
    data = read_json(path)
    validate(data)
    require(tenant == data["tenant"] and principal in data["principals"], "Unknown tenant or principal")
    require(case_id in data["cases"], "Unknown case")
    case = data["cases"][case_id]
    require(as_of == case["as_of"], "Assessment date must match the selected case snapshot")
    instant = day(as_of)
    visible = [e for e in data["evidence"] if e["id"] in case["evidence_ids"]
               and e["tenant"] == tenant and principal in e["readers"]
               and day(e["recorded_at"]) <= instant and day(e["observed_end"]) <= instant]
    visible_ids = {e["id"] for e in visible}
    visible = [{k: v for k, v in e.items() if k != "supersedes" or v in visible_ids} for e in visible]
    return {
        "schema_version": 1, "synthetic": True, "case_id": case_id,
        "tenant": tenant, "principal": principal, "as_of": as_of,
        "owner": data["owner"], "question": data["question"],
        "scope": data["scope"], "horizon": data["horizon"],
        "controls": data["controls"], "actions": sorted(data["actions"], key=lambda a: a["id"]),
        "capacity": case["capacity"], "required_actions": case["required_actions"],
        "evidence": sorted(visible, key=lambda e: e["id"]),
        "method_status": "Assistant-authored scenario criteria; awaiting qualified review",
    }


def assess_evidence(basis):
    assessments = {}
    superseded = {e["supersedes"] for e in basis["evidence"] if e.get("supersedes")}
    for control_id, control in sorted(basis["controls"].items()):
        records = [e for e in basis["evidence"] if e["control"] == control_id]
        assessed = []
        for evidence in records:
            limits = []
            if evidence["id"] in superseded:
                limits.append("superseded")
            if evidence["scope"] != control["scope"]:
                limits.append("scope_mismatch")
            if (day(basis["as_of"]) - day(evidence["observed_end"])).days > control["max_age_days"]:
                limits.append("stale")
            if evidence["coverage"] != "complete":
                limits.append("partial")
            if evidence["kind"] != "observation":
                limits.append("not_operating_evidence")
            assessed.append({"id": evidence["id"], "gap": evidence["gap"], "limits": limits})
        usable = [e for e in assessed if not e["limits"]]
        values = {e["gap"] for e in usable}
        state = {frozenset({True}): "gap_supported", frozenset({False}): "no_gap_observed",
                 frozenset({True, False}): "conflicting"}.get(frozenset(values), "unresolved")
        assessments[control_id] = {"state": state, "claim": control["claim"], "scope": control["scope"],
                                   "records": assessed,
                                   "limitation": "Applies only to this claim, scope and period; no compliance pass or risk reduction is inferred."}
    return assessments


def totals(actions, bound):
    return {resource: sum(a["effort"][resource][bound] for a in actions) for resource in RESOURCES}


def fits(usage, capacity):
    return all(capacity[r] is not None and usage[r] <= capacity[r] for r in RESOURCES)


def recommend(basis):
    evidence = assess_evidence(basis)
    alternatives = []
    for action in basis["actions"]:
        state = evidence[action["control"]]["state"]
        eligible = (action["mode"] == "maintain"
                    or action["mode"] == "improve" and state == "gap_supported"
                    or action["mode"] == "investigate" and state in {"conflicting", "unresolved"})
        alternatives.append({**action, "evidence_state": state, "eligible": eligible,
                             "reason": "Evidence prerequisite met" if eligible else "Evidence prerequisite not met; no automatic commitment",
                             "evidence_refs": [e["id"] for e in evidence[action["control"]]["records"]]})
    candidates = sorted([a for a in alternatives if a["eligible"]], key=lambda a: (a["priority"], a["id"]))
    feasible = []
    for length in range(len(candidates) + 1):
        for chosen in itertools.combinations(candidates, length):
            if fits(totals(chosen, 1), basis["capacity"]):
                chosen_ids = {a["id"] for a in chosen}
                preference = (len(chosen_ids.intersection(basis["required_actions"])),
                              tuple(int(a["id"] in chosen_ids) for a in candidates))
                feasible.append((preference, chosen))
    feasible.sort(key=lambda item: item[0], reverse=True)
    selected = list(feasible[0][1]) if feasible else []
    selected_ids = sorted(a["id"] for a in selected)
    unmet = sorted(set(basis["required_actions"]) - set(selected_ids))
    for alternative in alternatives:
        if alternative["id"] in selected_ids:
            alternative["disposition"] = "proposed"
        elif not alternative["eligible"]:
            alternative["disposition"] = "needs_evidence_or_not_indicated"
        else:
            alternative["disposition"] = "deferred_by_capacity_and_declared_preference"
    status = "needs_owner_resolution" if unmet or any(v is None for v in basis["capacity"].values()) else "conditional_recommendation"
    return {
        "kind": "recommendation", "engine_version": VERSION, "basis_hash": digest(basis), "basis": basis,
        "status": status, "evidence_assessment": evidence, "alternatives": alternatives,
        "selected": selected_ids, "usage_range": {"low": totals(selected, 0), "high": totals(selected, 1)},
        "unmet_commitments": unmet,
        "method": "Enumerate feasible subsets at upper effort bounds. Maximise count of named commitments, then the explicit action preference order. This is a proposed scenario policy, not a risk model or trained judgment.",
        "other_feasible_portfolios": [{"actions": sorted(a["id"] for a in group), "usage_high": totals(group, 1)} for _, group in feasible[1:6]],
        "uncertainties": ["Effort and benefits are synthetic estimates; confirm scope and delivery feasibility with owners.",
                          "Missing or restricted evidence cannot establish that a control works.",
                          "The preference order is unreviewed and may change the chosen portfolio."],
        "next_step": "The simulated owner must resolve missing capacity or unmet commitments before any commitment." if status == "needs_owner_resolution" else "Ask the simulated owner to review the assumptions and choose a feasible portfolio or defer.",
        "authority": "Recommendation only. No action executes and no real authorisation is granted.",
        "authored_by": "Codex", "review_status": "proposed_unreviewed",
    }


def save_record(directory, body):
    directory.mkdir(parents=True, exist_ok=True)
    root = directory.resolve(strict=True)
    record_id = digest(body)
    path = root / f"{record_id}.json"
    envelope = {"id": record_id, "body": body}
    try:
        with path.open("x", encoding="utf-8") as output:
            output.write(json.dumps(envelope, indent=2, sort_keys=True) + "\n")
    except FileExistsError:
        require(not path.is_symlink() and read_json(path) == envelope, "Existing record differs or is a symlink")
    return record_id


def load_record(directory, record_id):
    require(isinstance(record_id, str) and re.fullmatch(r"[0-9a-f]{64}", record_id), "Expected a SHA-256 record ID")
    path = directory.resolve(strict=True) / f"{record_id}.json"
    require(not path.is_symlink(), "Record symlinks are not accepted")
    envelope = read_json(path)
    require(envelope["id"] == record_id and digest(envelope["body"]) == record_id, "Record content hash mismatch")
    return envelope["body"]


def same_context(body, tenant, principal):
    basis = body["basis"]
    require(basis["tenant"] == tenant and basis["principal"] == principal, "Record context does not match")


def owner_decision(recommendation, recommendation_id, owner, selected, rationale):
    require(recommendation["kind"] == "recommendation", "Owner choice requires a recommendation")
    require(owner == recommendation["basis"]["owner"], "Unknown simulated owner")
    require(text(rationale), "A simulated owner rationale is required")
    require(len(selected) == len(set(selected)), "Duplicate selected action")
    by_id = {a["id"]: a for a in recommendation["alternatives"] if a["eligible"]}
    require(set(selected) <= set(by_id), "Unknown action or unmet evidence prerequisite")
    actions = [by_id[key] for key in selected]
    require(not selected or fits(totals(actions, 1), recommendation["basis"]["capacity"]), "Owner choice exceeds capacity")
    unmet = sorted(set(recommendation["basis"]["required_actions"]) - set(selected))
    return {"kind": "simulated_owner_decision", "recommendation_id": recommendation_id,
            "tenant": recommendation["basis"]["tenant"], "principal": recommendation["basis"]["principal"],
            "owner": owner, "selected": sorted(selected), "rationale": rationale,
            "unmet_commitments": unmet, "disposition": "deferred_pending_commitment_resolution" if unmet else "simulated_choice",
            "authority": "Fictional choice only. No execution, purchase, acceptance of real risk or identity verification."}


def reassess(basis, previous, previous_id, decision, decision_id):
    require(previous["kind"] == "recommendation", "Previous record must be a recommendation")
    require(decision["kind"] == "simulated_owner_decision" and decision["recommendation_id"] == previous_id, "Owner decision does not belong to the previous recommendation")
    same_context(previous, basis["tenant"], basis["principal"])
    require(day(basis["as_of"]) > day(previous["basis"]["as_of"]), "Reassessment must be later")
    result = recommend(basis)
    result["previous_recommendation_id"] = previous_id
    result["previous_owner_decision_id"] = decision_id
    result["changes"] = {
        "evidence_states": {key: {"before": previous["evidence_assessment"][key]["state"], "after": value["state"]}
                            for key, value in result["evidence_assessment"].items() if previous["evidence_assessment"][key]["state"] != value["state"]},
        "added_actions": sorted(set(result["selected"]) - set(previous["selected"])),
        "displaced_actions": sorted(set(previous["selected"]) - set(result["selected"])),
        "owner_choice_now_needs_review": decision["selected"] != result["selected"],
        "capacity_changed": basis["capacity"] != previous["basis"]["capacity"],
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, default=FIXTURE)
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--principal", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("inspect", "assess", "reassess"):
        command = sub.add_parser(name)
        command.add_argument("--case", required=True)
        command.add_argument("--as-of", required=True)
        if name != "inspect":
            command.add_argument("--output", type=Path, required=True)
        if name == "reassess":
            command.add_argument("--previous", required=True)
            command.add_argument("--owner-decision", required=True)
    choose = sub.add_parser("decide")
    choose.add_argument("--output", type=Path, required=True)
    choose.add_argument("--recommendation", required=True)
    choose.add_argument("--owner", required=True)
    choose.add_argument("--select", nargs="*", default=[])
    choose.add_argument("--rationale", required=True)
    replay = sub.add_parser("replay")
    replay.add_argument("--output", type=Path, required=True)
    replay.add_argument("--record", required=True)
    args = parser.parse_args()
    try:
        if args.command in {"inspect", "assess", "reassess"}:
            basis = packet(args.fixture, args.case, args.tenant, args.principal, args.as_of)
            if args.command == "inspect":
                print(json.dumps(basis, indent=2, sort_keys=True))
                return
            body = recommend(basis)
            if args.command == "reassess":
                previous = load_record(args.output, args.previous)
                decision = load_record(args.output, args.owner_decision)
                body = reassess(basis, previous, args.previous, decision, args.owner_decision)
        elif args.command == "decide":
            previous = load_record(args.output, args.recommendation)
            same_context(previous, args.tenant, args.principal)
            body = owner_decision(previous, args.recommendation, args.owner, args.select, args.rationale)
        else:
            body = load_record(args.output, args.record)
            if body["kind"] == "recommendation":
                same_context(body, args.tenant, args.principal)
            else:
                require(body["tenant"] == args.tenant and body["principal"] == args.principal, "Record context does not match")
            print(json.dumps(body, indent=2, sort_keys=True))
            return
        record_id = save_record(args.output, body)
        print(json.dumps({"record_id": record_id, "kind": body["kind"], "selected": body["selected"],
                          "status": body.get("status", body.get("disposition")), "changes": body.get("changes")}, indent=2))
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(2, f"Input or record rejected: {error}\n")


if __name__ == "__main__":
    main()
