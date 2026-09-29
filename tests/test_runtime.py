from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path
from threading import Barrier

import pytest

from crowbo.runtime import CrowboError, Runtime, Settings, outside_checkout, read_private


def test_request_allowance_persists_across_restart(settings):
    settings = settings.model_copy(update={"max_provider_calls": 1})
    first = Runtime(settings)
    first.reserve("test", "operation")
    first.close()
    second = Runtime(settings)
    with pytest.raises(CrowboError, match="allowance exhausted"):
        second.reserve("test", "operation")
    second.close()


def test_conservative_cost_reservation_stops_requests(settings):
    settings = settings.model_copy(update={"budget_usd": 0.05})
    runtime = Runtime(settings)
    runtime.reserve("test", "operation")
    with pytest.raises(CrowboError, match="reservation exhausted"):
        runtime.reserve("test", "operation")
    runtime.close()


def test_explicit_allowance_extension_keeps_previous_reservations(settings):
    first_settings = settings.model_copy(update={"max_provider_calls": 1, "budget_usd": Decimal("0.05")})
    first = Runtime(first_settings)
    first.reserve("test", "previous_request")
    first.close()
    extended = settings.model_copy(update={"max_provider_calls": 2, "budget_usd": Decimal("0.10")})
    second = Runtime(extended)
    second.reserve("test", "new_request")
    with pytest.raises(CrowboError, match="allowance exhausted"):
        second.reserve("test", "another_request")
    assert second.db.execute("SELECT operation FROM calls ORDER BY id").fetchall() == [
        ("previous_request",),
        ("new_request",),
    ]
    second.close()


def test_runtime_lock_prevents_concurrent_local_workers(settings):
    first, second = Runtime(settings), Runtime(settings)
    with first.locked(), pytest.raises(CrowboError, match="Another local"), second.locked():
        pass
    first.close()
    second.close()


def test_private_inputs_reject_checkouts_and_shared_permissions(tmp_path):
    with pytest.raises(CrowboError, match="checkout"):
        outside_checkout(Path(__file__))
    path = tmp_path / "input.json"
    path.write_text("synthetic")
    path.chmod(0o644)
    with pytest.raises(CrowboError, match="owner-only"):
        read_private(path)
    path.chmod(0o600)
    assert read_private(path) == b"synthetic"
    with pytest.raises(CrowboError, match="size limit"):
        read_private(path, 2)


def test_reports_and_database_are_private(settings):
    runtime = Runtime(settings)
    report = runtime.write_report("test.json", {"basis": "synthetic"})
    assert report.stat().st_mode & 0o777 == 0o600
    assert runtime.directory.stat().st_mode & 0o777 == 0o700
    assert (runtime.directory / "operations.sqlite3").stat().st_mode & 0o777 == 0o600
    runtime.close()


def test_experiment_is_explicit_durable_and_does_not_reset_old_calls(settings):
    runtime = Runtime(settings)
    runtime.reserve("test", "legacy")
    runtime.close()
    settings = settings.model_copy(update={"experiment_id": "test-one", "budget_usd": Decimal("0.05")})
    runtime = Runtime(settings)
    with pytest.raises(CrowboError, match="operator must create"):
        runtime.reserve("test", "read")
    runtime.create_experiment(3, 1)
    runtime.reserve("jev", "assess")
    runtime.close()
    runtime = Runtime(settings)
    assert runtime.create_experiment(3, 1)["model_calls"] == 1
    with pytest.raises(CrowboError, match="cannot be changed"):
        runtime.create_experiment(4, 2)
    with pytest.raises(CrowboError, match="model-call allowance"):
        runtime.reserve("glm", "review")
    runtime.reserve("turbopuffer", "read")
    runtime.reserve("turbopuffer", "read")
    with pytest.raises(CrowboError, match="request allowance"):
        runtime.reserve("turbopuffer", "read")
    assert runtime.db.execute("SELECT count(*) FROM calls").fetchone()[0] == 4
    assert runtime.experiment_status()["requests"] == 3
    runtime.close()


@pytest.mark.parametrize("identity", [{"reader": "other"}, {"tenant": "other"}])
def test_experiment_cannot_be_claimed_by_another_identity(settings, identity):
    settings = settings.model_copy(update={"experiment_id": "test-one"})
    owner = Runtime(settings)
    owner.create_experiment(3, 1)
    other = Runtime(settings.model_copy(update=identity))
    with pytest.raises(CrowboError, match="unavailable"):
        other.reserve("glm", "review")
    with pytest.raises(CrowboError, match="cannot be changed"):
        other.create_experiment(3, 1)
    assert owner.experiment_status()["requests"] == 0
    owner.close()
    other.close()


def test_new_experiment_does_not_require_a_fabricated_dollar_budget(settings):
    data = settings.model_dump(mode="json")
    data.pop("budget_usd")
    data["experiment_id"] = "no-dollar-estimate"
    settings = Settings.model_validate(data)
    runtime = Runtime(settings)
    runtime.create_experiment(2, 1)
    runtime.reserve("glm", "review")
    runtime.reserve("turbopuffer", "query")
    assert runtime.experiment_status()["requests"] == 2
    runtime.close()


def test_concurrent_reservations_cannot_overspend_one_remaining_request(settings):
    settings = settings.model_copy(update={"experiment_id": "one-remaining"})
    runtime = Runtime(settings)
    runtime.create_experiment(1, 1)
    runtime.close()
    barrier = Barrier(2)

    def reserve():
        worker = Runtime(settings)
        try:
            barrier.wait(timeout=5)
            worker.reserve("glm", "review")
            return "reserved"
        except CrowboError as error:
            return str(error)
        finally:
            worker.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: reserve(), range(2)))
    assert sorted(results) == ["Experiment request allowance exhausted", "reserved"]
    runtime = Runtime(settings)
    assert runtime.experiment_status()["requests"] == 1
    runtime.close()
