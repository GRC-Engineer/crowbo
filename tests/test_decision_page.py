import pytest
from test_decision import close, configured, model_for, reply

from crowbo.decision import Decision
from crowbo.decision_page import export_decision_page, render_decision_page


def test_private_page_uses_saved_evidence_escapes_text_and_does_not_overwrite(engine, item, tmp_path):
    item, request = configured(engine, item)
    model = model_for(engine, lambda _: reply())
    result = Decision(engine, model).run(request)
    result["answer"]["recommendation"] = '<script>fetch("https://example.org/leak")</script>'
    result["evidence"][0]["source"]["title"] = "<img src=x onerror=alert(1)>"
    result["evidence"][0]["source"]["source_url"] = 'https://example.org/?x=" onclick="alert(1)'
    markup = render_decision_page([result], [])
    assert "<script>" not in markup and "<img " not in markup
    assert "&lt;script&gt;" in markup
    assert "&quot; onclick=&quot;" in markup
    assert "default-src 'none'" in markup
    assert "cannot enforce later permission changes" in markup
    assert all(f'id="{section}"' in markup for section in ("nest", "flock", "feathers", "flight-log"))
    assert "Owner requests an access review" in markup
    target = tmp_path / "private.html"
    export_decision_page(target, [result], [])
    assert target.stat().st_mode & 0o777 == 0o600
    with pytest.raises(FileExistsError):
        export_decision_page(target, [result], [])
    close(model)


def test_private_access_page_renders_options_and_escapes_interpretations(engine, item):
    from test_access import response, setup_access

    _, request = setup_access(engine, item)
    model = model_for(engine, lambda _: response())
    try:
        result = Decision(engine, model).run(request)
        result["decision"]["access_facts"]["options"][1]["description"] = "<script>Reader</script>"
        markup = render_decision_page([result], [])
        assert "svc-reports@example.test" in markup
        assert "&lt;script&gt;Reader&lt;/script&gt;" in markup and "<script>" not in markup
        assert "approval authority: Unresolved" in markup
        assert "Deadline: Unresolved" in markup
        assert "No structured facts" not in markup
        assert "default-src 'none'" in markup
    finally:
        close(model)
