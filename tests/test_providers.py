import json

import httpx
import pytest
from conftest import answers

from crowbo.providers import FixedHostTransport, Jev, LimitedStream, TurbopufferStore
from crowbo.runtime import CrowboError, Runtime


def payload():
    return {
        "success": True,
        "errors": [],
        "result": {
            "state": "Completed",
            "result": {
                "model": "jev-test",
                "answers": answers(),
                "usage": {"input_tokens": 40, "output_tokens": 20},
            },
        },
    }


def test_jev_validates_nested_response_and_disables_payload_logging(settings, item):
    def respond(request):
        assert request.url.host == "api.cloudflare.com"
        assert request.headers["cf-aig-collect-log"] == "false"
        assert request.headers["cf-aig-collect-log-payload"] == "false"
        assert request.headers["cf-aig-skip-cache"] == "true"
        return httpx.Response(200, json=payload())

    with Runtime(settings).locked():
        runtime = Runtime(settings)
        adapter = Jev(
            runtime, client=httpx.Client(transport=httpx.MockTransport(respond)), token="test-token"
        )
        result = adapter.assess(item.source)
        assert result.source_revision == item.source.revision_id
        assert result.answers["commitment_evidence"].choice == "insufficient"
        assert result.input_tokens == 40
        adapter.close()
        runtime.close()


@pytest.mark.parametrize("failure", ["missing_answer", "probabilities", "failed_state", "failed_envelope"])
def test_jev_invalid_responses_cannot_become_assessments(settings, item, failure):
    body = payload()
    if failure == "missing_answer":
        del body["result"]["result"]["answers"]["deadline_stated"]
    elif failure == "probabilities":
        body["result"]["result"]["answers"]["commitment_evidence"]["probabilities"]["sufficient"] = 1.0
    elif failure == "failed_state":
        body["result"]["state"] = "queued"
    else:
        body["success"] = False
    runtime = Runtime(settings)
    adapter = Jev(
        runtime,
        client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body))),
        token="test-token",
    )
    with pytest.raises(CrowboError):
        adapter.assess(item.source)
    adapter.close()
    runtime.close()


def test_creating_jev_does_not_resolve_credentials(settings, monkeypatch):
    def forbidden(_):
        raise AssertionError("Credential resolution should be lazy")

    monkeypatch.setattr("crowbo.providers.secret", forbidden)
    runtime = Runtime(settings)
    adapter = Jev(runtime, client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(500))))
    adapter.close()
    runtime.close()


@pytest.mark.parametrize(
    "url", ["http://api.cloudflare.com/a", "https://attacker.example/a", "https://api.cloudflare.com:444/a"]
)
def test_provider_transport_rejects_other_destinations(url):
    transport = FixedHostTransport("api.cloudflare.com")
    with pytest.raises(CrowboError, match="destination"):
        transport.handle_request(httpx.Request("GET", url))
    transport.close()


def test_provider_transport_rejects_redirects():
    transport = FixedHostTransport("api.cloudflare.com")
    transport.transport.close()
    transport.transport = httpx.MockTransport(
        lambda _: httpx.Response(302, headers={"location": "https://attacker.example"})
    )
    with pytest.raises(CrowboError, match="redirects"):
        transport.handle_request(httpx.Request("GET", "https://api.cloudflare.com/test"))
    transport.close()


def test_response_size_is_bounded():
    stream = LimitedStream(httpx.ByteStream(b"12345"), 4)
    with pytest.raises(CrowboError, match="size limit"):
        b"".join(stream)


def test_index_reuses_unchanged_vectors_and_cleanup_only_targets_older_generations(
    settings, item, monkeypatch
):
    writes = []

    def respond(request):
        body = json.loads(request.content)
        if request.url.path.endswith("/query"):
            return httpx.Response(
                200,
                json={
                    "rows": [
                        {
                            "id": "prior",
                            "chunk_text": item.source.title + "\n" + item.source.text,
                            "embed_chunk_text": [0.25] * 1024,
                        }
                    ],
                    "billing": {},
                },
            )
        if "upsert_rows" not in body and "patch_rows" not in body:
            assert body["schema"]["generation"] == "uint"
            writes.append("schema_ready")
            return httpx.Response(200, json={"rows_affected": 0, "billing": {}})
        assert writes and writes[0] == "schema_ready", (
            "Conditional filters require the schema migration first"
        )
        writes.append(body)
        return httpx.Response(
            200,
            json={
                "rows_affected": 1,
                "rows_upserted": 1,
                "rows_patched": 1,
                "rows_deleted": 0,
                "rows_remaining": False,
                "billing": {},
            },
        )

    monkeypatch.setattr("crowbo.providers.secret", lambda _: "x" * 32)
    monkeypatch.setattr("crowbo.providers.FixedHostTransport", lambda *_: httpx.MockTransport(respond))
    runtime = Runtime(settings)
    store = TurbopufferStore(runtime)
    try:
        store.index(item.source, item.grant, 2)
        assert writes[1]["upsert_rows"][0]["embed_chunk_text"] == [0.25] * 1024
        assert writes[1]["delete_by_filter"] == [
            "And",
            [
                ["logical_id", "Eq", item.source.logical_id],
                ["Or", [["generation", "Eq", None], ["generation", "Lt", 2]]],
            ],
        ]
        store.refresh_index(item.source, item.grant, 2)
        assert set(writes[2]["patch_rows"][0]) == {
            "id",
            "readers",
            "reader_groups",
            "expires_at",
            "access_checked_at",
        }
        assert writes[2]["patch_rows"][0]["readers"] == ["operator"]
        assert writes[2]["patch_condition"] == [
            "Or",
            [
                ["access_checked_at", "Eq", None],
                ["access_checked_at", "Lte", {"$ref_new": "access_checked_at"}],
            ],
        ]
    finally:
        store.close()
        runtime.close()


def test_missing_index_rows_are_not_claimed_as_refreshed(settings, item, monkeypatch):
    monkeypatch.setattr("crowbo.providers.secret", lambda _: "x" * 32)
    monkeypatch.setattr(
        "crowbo.providers.FixedHostTransport",
        lambda *_: httpx.MockTransport(
            lambda _: httpx.Response(200, json={"rows_affected": 0, "rows_patched": 0, "billing": {}})
        ),
    )
    runtime = Runtime(settings)
    store = TurbopufferStore(runtime)
    try:
        with pytest.raises(CrowboError, match="not fully refreshed"):
            store.refresh_index(item.source, item.grant, 2)
    finally:
        store.close()
        runtime.close()


@pytest.mark.parametrize("bad_rows", [None, "duplicate", "unexpected"])
def test_batch_lookup_is_bounded_and_checks_returned_ids(settings, monkeypatch, bad_rows):
    keys = ["a" * 64, "b" * 64]
    rows = [{"id": key, "body": json.dumps({"value": key})} for key in reversed(keys)]
    if bad_rows == "duplicate":
        rows[1] = rows[0]
    elif bad_rows == "unexpected":
        rows[1]["id"] = "c" * 64

    def respond(request):
        query = json.loads(request.content)
        assert query["filters"] == ["id", "In", keys]
        assert query["top_k"] == 2
        assert query["consistency"] == {"level": "strong"}
        return httpx.Response(200, json={"rows": rows, "billing": {}})

    monkeypatch.setattr("crowbo.providers.secret", lambda _: "x" * 32)
    monkeypatch.setattr("crowbo.providers.FixedHostTransport", lambda *_: httpx.MockTransport(respond))
    runtime = Runtime(settings)
    store = TurbopufferStore(runtime)
    try:
        assert store.get_many([]) == {}
        with pytest.raises(CrowboError, match="limit"):
            store.get_many([str(i) for i in range(121)])
        if bad_rows:
            with pytest.raises(CrowboError, match="identity"):
                store.get_many(keys)
        else:
            assert store.get_many(keys) == {key: {"value": key} for key in keys}
        assert runtime.db.execute("SELECT count(*) FROM calls").fetchone()[0] == 1
    finally:
        store.close()
        runtime.close()
