import copy
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from crowbo import FIXTURE, canonical, digest, load_record, packet, read_json, recommend, save_record, validate
from retrieval import search


HERE = Path(__file__).parent


def case(name="baseline", fixture=FIXTURE):
    date = read_json(fixture)["cases"][name]["as_of"]
    return packet(fixture, name, "northstar-demo", "grc-lead", date)


class ProofTests(unittest.TestCase):
    def test_baseline_uses_existing_resources_and_retains_uncertainty(self):
        result = recommend(case())
        self.assertEqual(result["selected"], ["ai_data_review", "application_fix", "record_cleanup", "recovery_fix"])
        self.assertEqual(result["usage_range"]["high"], {"security_half_days": 6, "platform_half_days": 8, "cash_usd": 0})
        self.assertEqual(result["evidence_assessment"]["ai"]["state"], "unresolved")
        self.assertTrue(result["other_feasible_portfolios"])

    def test_future_foreign_and_restricted_evidence_never_enters_packet(self):
        basis = case()
        self.assertEqual(len(basis["evidence"]), 5)
        result = canonical(recommend(basis))
        for forbidden in ("access_incident", "foreign_canary", "restricted_canary", "SYNTHETIC_FOREIGN_CANARY", "SYNTHETIC_RESTRICTED_CANARY"):
            self.assertNotIn(forbidden, result)

    def test_wrong_tenant_principal_or_time_is_rejected(self):
        for tenant, principal, as_of in (("another-demo", "grc-lead", "2026-09-25"),
                                        ("northstar-demo", "unknown", "2026-09-25"),
                                        ("northstar-demo", "grc-lead", "2026-10-02")):
            with self.subTest(tenant=tenant, principal=principal, as_of=as_of), self.assertRaises(ValueError):
                packet(FIXTURE, "baseline", tenant, principal, as_of)

    def test_material_change_displaces_flexible_work(self):
        result = recommend(case("incident"))
        self.assertIn("identity_fix", result["selected"])
        self.assertNotIn("application_fix", result["selected"])
        self.assertIn("recovery_fix", result["selected"])
        self.assertEqual(result["evidence_assessment"]["identity"]["state"], "gap_supported")

    def test_conflict_requires_reconciliation(self):
        result = recommend(case("contradictory"))
        self.assertEqual(result["evidence_assessment"]["application"]["state"], "conflicting")
        self.assertIn("application_investigate", result["selected"])
        self.assertNotIn("application_fix", result["selected"])

    def test_stale_and_partial_evidence_do_not_pass(self):
        stale = recommend(case("stale"))
        self.assertTrue(all(e["state"] == "unresolved" for e in stale["evidence_assessment"].values()))
        self.assertEqual(stale["unmet_commitments"], ["recovery_fix"])
        partial = recommend(case("partial"))
        self.assertEqual(partial["evidence_assessment"]["application"]["state"], "unresolved")
        self.assertIn("application_investigate", partial["selected"])

    def test_missing_capacity_does_not_become_zero_or_unlimited(self):
        result = recommend(case("missing_capacity"))
        self.assertEqual(result["selected"], [])
        self.assertEqual(result["status"], "needs_owner_resolution")

    def test_capacity_cut_reports_unmet_commitment(self):
        result = recommend(case("capacity_cut"))
        self.assertEqual(result["status"], "needs_owner_resolution")
        self.assertIn("recovery_fix", result["unmet_commitments"])
        for resource, usage in result["usage_range"]["high"].items():
            self.assertLessEqual(usage, result["basis"]["capacity"][resource])

    def test_supported_pilot_is_possible(self):
        result = recommend(case("supported_pilot"))
        self.assertIn("endpoint_pilot", result["selected"])
        self.assertEqual(result["usage_range"]["high"]["cash_usd"], 6000)
        self.assertIn("recovery_fix", result["selected"])

    def test_evidence_instructions_cannot_grant_authority(self):
        baseline = recommend(case())
        result = recommend(case("injection"))
        self.assertEqual(result["selected"], baseline["selected"])
        self.assertEqual(result["authority"], baseline["authority"])
        self.assertNotIn("endpoint_pilot", result["selected"])

    def test_wording_and_order_do_not_change_structured_choice(self):
        basis = case()
        changed = copy.deepcopy(basis)
        changed["evidence"].reverse()
        changed["actions"].reverse()
        for evidence in changed["evidence"]:
            evidence["text"] = "Different wording; structured interpretation is unchanged."
        self.assertEqual(recommend(basis)["selected"], recommend(changed)["selected"])

    def test_preference_and_effort_sensitivity_are_visible(self):
        basis = case("incident")
        for action in basis["actions"]:
            if action["id"] == "identity_fix":
                action["effort"]["platform_half_days"] = [2, 10]
        result = recommend(basis)
        self.assertNotIn("identity_fix", result["selected"])
        self.assertIn("application_fix", result["selected"])
        # The confirmed access gap remains visible even when its repair is infeasible.
        self.assertEqual(result["evidence_assessment"]["identity"]["state"], "gap_supported")

    def test_invalid_numbers_references_dates_and_duplicates_are_rejected(self):
        source = read_json(FIXTURE)
        variants = []
        changed = copy.deepcopy(source)
        changed["actions"][0]["effort"]["cash_usd"] = [-1, 0]
        variants.append(changed)
        changed = copy.deepcopy(source)
        changed["cases"]["baseline"]["capacity"]["platform_half_days"] = True
        variants.append(changed)
        changed = copy.deepcopy(source)
        changed["cases"]["baseline"]["evidence_ids"].append("missing")
        variants.append(changed)
        changed = copy.deepcopy(source)
        changed["evidence"][0]["observed_end"] = "2099-01-01"
        variants.append(changed)
        changed = copy.deepcopy(source)
        changed["evidence"].append(changed["evidence"][0])
        variants.append(changed)
        for changed in variants:
            with self.subTest(), self.assertRaises((ValueError, KeyError)):
                validate(changed)

    def test_content_addressed_records_are_idempotent_and_detect_edits(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            body = recommend(case())
            record_id = save_record(directory, body)
            self.assertEqual(save_record(directory, body), record_id)
            self.assertEqual(len(list(directory.iterdir())), 1)
            self.assertEqual(load_record(directory, record_id), body)
            (directory / f"{record_id}.json").write_text('{"id":"altered","body":{}}')
            with self.assertRaises(ValueError):
                load_record(directory, record_id)
            with self.assertRaises(ValueError):
                save_record(directory, body)

    def test_record_paths_cannot_escape_output_and_symlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with self.assertRaises(ValueError):
                load_record(directory, "../some-file")
            body = {"synthetic": True}
            target = directory / "target.json"
            target.write_text("untouched")
            (directory / f"{digest(body)}.json").symlink_to(target)
            with self.assertRaises(ValueError):
                save_record(directory, body)
            self.assertEqual(target.read_text(), "untouched")

    def test_fts_query_text_cannot_change_sql_or_return_unindexed_evidence(self):
        with sqlite3.connect(":memory:") as connection:
            connection.execute("CREATE VIRTUAL TABLE evidence USING fts5(id UNINDEXED, content)")
            connection.executemany("INSERT INTO evidence VALUES (?, ?)", [(e["id"], e["text"]) for e in case()["evidence"]])
            found = search(connection, 'approval"; DROP TABLE evidence; --')
            self.assertIn("access_sample", found)
            self.assertEqual(connection.execute("SELECT count(*) FROM evidence").fetchone()[0], 5)

    def test_cli_full_loop_and_owner_boundary(self):
        with tempfile.TemporaryDirectory() as temporary:
            prefix = [sys.executable, str(HERE / "crowbo.py"), "--tenant", "northstar-demo", "--principal", "grc-lead"]

            def cli(*args, success=True):
                result = subprocess.run([*prefix, *args], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0 if success else 2, result.stderr)
                return json.loads(result.stdout) if success else result.stderr

            first = cli("assess", "--case", "baseline", "--as-of", "2026-09-25", "--output", temporary)
            first_id = first["record_id"]
            first_bytes = (Path(temporary) / f"{first_id}.json").read_bytes()
            cli("decide", "--output", temporary, "--recommendation", first_id, "--owner", "impostor", "--rationale", "No identity verification", success=False)
            cli("decide", "--output", temporary, "--recommendation", first_id, "--owner", "grc-lead", "--select", "endpoint_pilot", "--rationale", "Unsupported pilot", success=False)
            chosen = cli("decide", "--output", temporary, "--recommendation", first_id, "--owner", "grc-lead", "--select", "application_fix", "recovery_fix", "ai_data_review", "--rationale", "Keep the remaining half day as contingency instead of cleaning records.")
            second = cli("reassess", "--case", "incident", "--as-of", "2026-10-02", "--output", temporary, "--previous", first_id, "--owner-decision", chosen["record_id"])
            self.assertEqual(second["changes"]["added_actions"], ["identity_fix"])
            self.assertEqual(second["changes"]["displaced_actions"], ["application_fix"])
            self.assertTrue(second["changes"]["owner_choice_now_needs_review"])
            self.assertEqual((Path(temporary) / f"{first_id}.json").read_bytes(), first_bytes)
            replayed = cli("replay", "--output", temporary, "--record", first_id)
            self.assertEqual(replayed["selected"], first["selected"])
            self.assertEqual(len(list(Path(temporary).iterdir())), 3)


if __name__ == "__main__":
    unittest.main()
