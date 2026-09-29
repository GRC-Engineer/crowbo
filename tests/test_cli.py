import json

from conftest import batch

from crowbo.cli import main


def test_denied_import_is_reported_as_incomplete(settings, item, engine, tmp_path, monkeypatch, capsys):
    config = tmp_path / "settings.json"
    config.write_text(settings.model_dump_json())
    config.chmod(0o600)
    denied = item.model_copy(update={"grant": item.grant.model_copy(update={"revoked": True})})
    source = tmp_path / "batch.json"
    source.write_text(batch(denied).model_dump_json())
    source.chmod(0o600)
    engine.store.close = lambda: None
    engine.jev.close = lambda: None
    monkeypatch.setattr("crowbo.cli.TurbopufferStore", lambda _: engine.store)
    monkeypatch.setattr("crowbo.cli.Jev", lambda _, **kwargs: engine.jev)
    assert main(["--settings", str(config), "ingest", str(source)]) == 2
    output = json.loads(capsys.readouterr().out)
    assert output["records_with_pending_work"] == 1
    assert not engine.store.rows and not engine.jev.calls
    with open(output["private_report"]) as stream:
        report = json.load(stream)
    assert report["population_complete"] is False
    assert report["records"][0]["status"] == "access_denied"


def test_invalid_private_input_does_not_echo_its_contents(tmp_path, capsys):
    path = tmp_path / "bad.json"
    path.write_text('{"private_marker": "DO_NOT_ECHO_THIS"}')
    path.chmod(0o600)
    assert main(["--settings", str(path), "list"]) == 2
    output = capsys.readouterr().out
    assert "DO_NOT_ECHO_THIS" not in output
    assert "schema validation" in output


def test_feedback_cli_retains_and_inspects_without_constructing_a_model(
    engine, item, tmp_path, monkeypatch, capsys
):
    from test_decision import close, configured, model_for, reply
    from test_feedback import feedback_request

    from crowbo.decision import Decision

    _, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    try:
        parent = Decision(engine, model).run(request)
    finally:
        close(model)
    config = tmp_path / "settings.json"
    config.write_text(engine.settings.model_dump_json())
    config.chmod(0o600)
    path = tmp_path / "feedback.json"
    path.write_text(feedback_request(parent).model_dump_json())
    path.chmod(0o600)
    engine.store.close = lambda: None
    monkeypatch.setattr("crowbo.cli.TurbopufferStore", lambda _: engine.store)

    def no_model(*args, **kwargs):
        pytest.fail("feedback must not construct an inference provider")

    import pytest

    monkeypatch.setattr("crowbo.cli.Reasoner", no_model)
    monkeypatch.setattr("crowbo.cli.Jev", no_model)
    prefix = ["--settings", str(config)]
    assert main([*prefix, "record-feedback", str(path)]) == 0
    output = json.loads(capsys.readouterr().out)
    with open(output["private_report"]) as stream:
        feedback = json.load(stream)["records"][0]
    assert feedback["request"]["result_id"] == parent["id"]
    assert main([*prefix, "inspect-feedback", feedback["id"]]) == 0
    output = json.loads(capsys.readouterr().out)
    with open(output["private_report"]) as stream:
        assert json.load(stream)["records"][0] == feedback
