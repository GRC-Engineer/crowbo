import json
import time

import httpx
from pydantic import ValidationError
from turbopuffer import APIError, NotFoundError, Turbopuffer

from .contracts import Assessment, SourceRevision, digest, now
from .questions import DEFAULT_QUESTIONS
from .runtime import CrowboError, Runtime, secret


def cloudflare_headers(runtime, token):
    return {
        "Authorization": "Bearer " + (token or secret("cloudflare")),
        "cf-aig-gateway-id": runtime.settings.gateway,
        "cf-aig-collect-log": "false",
        "cf-aig-collect-log-payload": "false",
        "cf-aig-skip-cache": "true",
        "cf-aig-max-attempts": "1",
    }


class LimitedStream(httpx.SyncByteStream):
    def __init__(self, stream, maximum):
        self.stream, self.maximum = stream, maximum

    def __iter__(self):
        count = 0
        for part in self.stream:
            count += len(part)
            if count > self.maximum:
                raise CrowboError("Provider response exceeded the size limit")
            yield part

    def close(self):
        self.stream.close()


class FixedHostTransport(httpx.BaseTransport):
    def __init__(self, host: str, maximum=8_000_000):
        self.host, self.maximum = host, maximum
        self.transport = httpx.HTTPTransport(retries=0, trust_env=False)

    def handle_request(self, request):
        if (
            request.url.scheme != "https"
            or request.url.host != self.host
            or request.url.port not in (None, 443)
        ):
            raise CrowboError("Provider request destination is not permitted")
        response = self.transport.handle_request(request)
        if 300 <= response.status_code < 400:
            response.close()
            raise CrowboError("Provider redirects are not permitted")
        response.stream = LimitedStream(response.stream, self.maximum)
        return response

    def close(self):
        self.transport.close()


class Jev:
    def __init__(self, runtime: Runtime, client=None, token=None, questions=DEFAULT_QUESTIONS):
        self.runtime = runtime
        self.questions = questions
        self.client = client or httpx.Client(
            transport=FixedHostTransport("api.cloudflare.com", 131072),
            timeout=30,
            follow_redirects=False,
            trust_env=False,
        )
        self.token = token

    def assess(self, source: SourceRevision) -> Assessment:
        settings = self.runtime.settings
        headers = cloudflare_headers(self.runtime, self.token)
        body = {
            "model": "typesafe/jev",
            "input": {
                "state": source.model_dump(mode="json"),
                "questions": self.questions.questions,
            },
        }
        call = self.runtime.reserve("jev", "assess")
        started = time.monotonic()
        try:
            response = self.client.post(
                f"https://api.cloudflare.com/client/v4/accounts/{settings.cloudflare_account}/ai/run",
                json=body,
                headers=headers,
            )
            self.runtime.receipt(call, {"http_status": response.status_code})
            if response.status_code != 200:
                raise CrowboError(f"Jev request failed with HTTP {response.status_code}")
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("success") is not True or payload.get("errors"):
                raise CrowboError("Jev returned an unsuccessful response")
            data = payload["result"]
            if isinstance(data, dict) and "result" in data:
                state = data.get("state")
                if not isinstance(state, str) or state.casefold() not in {
                    "completed",
                    "complete",
                    "succeeded",
                    "success",
                }:
                    raise CrowboError("Jev did not complete synchronously")
                data = data["result"]
            assessment = Assessment(
                source_revision=source.revision_id,
                criteria_version=self.questions.version,
                criteria_hash=self.questions.fingerprint,
                returned_model=data["model"],
                answers=data["answers"],
                questions=self.questions.questions,
                input_tokens=data["usage"]["input_tokens"],
                output_tokens=data["usage"]["output_tokens"],
                elapsed_seconds=time.monotonic() - started,
                assessed_at=now(),
            )
            self.questions.check(assessment)
            self.runtime.receipt(
                call,
                {
                    "http_status": 200,
                    "model": assessment.returned_model,
                    "input_tokens": assessment.input_tokens,
                    "output_tokens": assessment.output_tokens,
                    "elapsed_seconds": assessment.elapsed_seconds,
                },
            )
            return assessment
        except (httpx.HTTPError, ValueError, KeyError, TypeError, ValidationError):
            raise CrowboError("Jev transport or typed-response validation failed") from None

    def close(self):
        self.client.close()


RECORD_SCHEMA = {
    "kind": "string",
    "logical_id": "string",
    "revision_id": "string",
    "state_hash": "string",
    "body": {"type": "string", "filterable": False},
    "readers": "[]string",
    "reader_groups": "[]string",
    "expires_at": "datetime",
}
CHUNK_SCHEMA = {
    "logical_id": "string",
    "revision_id": "string",
    "generation": "uint",
    "access_checked_at": "datetime",
    "readers": "[]string",
    "reader_groups": "[]string",
    "expires_at": "datetime",
    "chunk_text": {
        "type": "string",
        "full_text_search": True,
        "embed": {"model": "voyage/voyage-4-large", "dims": 1024},
    },
    "offset_start": "uint",
    "offset_end": "uint",
}


class TurbopufferStore:
    def __init__(self, runtime: Runtime):
        self.runtime = runtime
        self.client = Turbopuffer(
            api_key=secret("turbopuffer"),
            region="aws-eu-west-2",
            base_url="https://{region}.turbopuffer.com",
            max_retries=0,
            http_client=httpx.Client(
                transport=FixedHostTransport("aws-eu-west-2.turbopuffer.com"),
                timeout=30,
                follow_redirects=False,
                trust_env=False,
            ),
        )
        self.records = self.client.namespace(runtime.settings.namespace_prefix + "-records")
        self.chunks = self.client.namespace(runtime.settings.namespace_prefix + "-chunks")
        self._chunk_schema_ready = False

    def _call(self, operation, method, **kwargs):
        call = self.runtime.reserve("turbopuffer", operation)
        try:
            result = method(**kwargs)
            self.runtime.receipt(call, {"ok": True, "billing": result.billing.model_dump(mode="json")})
            return result
        except NotFoundError:
            self.runtime.receipt(call, {"http_status": 404})
            raise
        except (APIError, httpx.HTTPError):
            self.runtime.receipt(call, {"ok": False})
            raise CrowboError("Turbopuffer request failed; source preparation remains resumable") from None

    def get(self, identifier: str) -> dict | None:
        return self.get_many([identifier]).get(identifier)

    def get_many(self, identifiers):
        keys = list(dict.fromkeys(identifiers))
        if not keys:
            return {}
        if len(keys) > 120:
            raise CrowboError("Record lookup exceeds the pilot limit")
        try:
            result = self._call(
                "get" if len(keys) == 1 else "get_many",
                self.records.query,
                rank_by=["id", "asc"],
                filters=["id", "In", keys],
                top_k=len(keys),
                include_attributes=["body"],
                consistency={"level": "strong"},
            )
        except NotFoundError:
            return {}
        found = {}
        for row in result.rows or []:
            if row.id not in keys or row.id in found:
                raise CrowboError("Record lookup returned an unexpected identity")
            found[row.id] = json.loads(row.model_dump()["body"])
        return found

    def put(
        self,
        identifier: str,
        kind: str,
        body: dict,
        *,
        logical_id="",
        revision_id="",
        readers=(),
        reader_groups=(),
        expires_at=None,
        expected_hash=None,
        insert_only=False,
    ):
        row = {
            "id": identifier,
            "kind": kind,
            "body": json.dumps(body, ensure_ascii=False),
            "logical_id": logical_id,
            "revision_id": revision_id,
            "state_hash": digest(body),
            "readers": list(readers),
            "reader_groups": list(reader_groups),
            "expires_at": expires_at,
        }
        options = {"upsert_rows": [row], "schema": RECORD_SCHEMA}
        if insert_only:
            options["upsert_condition"] = ["id", "Eq", None]
        elif expected_hash is not None:
            options["upsert_condition"] = ["state_hash", "Eq", expected_hash]
        result = self._call("put_" + kind, self.records.write, **options)
        if result.rows_affected != 1:
            raise CrowboError("Source state changed concurrently; reload before resuming")

    @staticmethod
    def _audience_filter(reader, groups):
        direct = ["readers", "Contains", reader]
        return ["Or", [direct, ["reader_groups", "ContainsAny", list(groups)]]] if groups else direct

    def heads(self, reader: str, *, groups=()):
        cursor = None
        for _ in range(20):
            filters = [
                ["kind", "Eq", "head"],
                self._audience_filter(reader, groups),
                ["expires_at", "Gt", now().isoformat()],
            ]
            if cursor:
                filters.append(["id", "Gt", cursor])
            try:
                result = self._call(
                    "list",
                    self.records.query,
                    filters=["And", filters],
                    rank_by=["id", "asc"],
                    top_k=50,
                    include_attributes=["body"],
                )
            except NotFoundError:
                return
            rows = result.rows or []
            for row in rows:
                yield json.loads(row.model_dump()["body"])
            if len(rows) < 50:
                return
            cursor = rows[-1].id
        raise CrowboError("Source listing exceeds the pilot limit; completeness is unresolved")

    def _chunk_rows(self, source, generation):
        text = source.title + "\n" + source.text
        rows = []
        for start in range(0, len(text), 1000):
            end = min(len(text), start + 1200)
            rows.append(
                {
                    "id": digest([source.revision_id, start, "chunks-v1"])
                    if generation == 0
                    else digest([source.logical_id, generation, start, "chunks-v2"]),
                    "logical_id": source.logical_id,
                    "revision_id": source.revision_id,
                    "generation": generation,
                    "offset_start": start,
                    "offset_end": end,
                    "chunk_text": text[start:end],
                }
            )
        return rows

    @staticmethod
    def _access(grant):
        return {
            "readers": list(grant.readers) if not grant.revoked else [],
            "reader_groups": list(grant.reader_groups) if not grant.revoked else [],
            "expires_at": grant.expires_at.isoformat(),
            "access_checked_at": grant.checked_at.isoformat(),
        }

    @staticmethod
    def _older_access():
        return [
            "Or",
            [
                ["access_checked_at", "Eq", None],
                ["access_checked_at", "Lte", {"$ref_new": "access_checked_at"}],
            ],
        ]

    @staticmethod
    def _generations(logical_id, generation, comparison):
        return [
            "And",
            [
                ["logical_id", "Eq", logical_id],
                ["Or", [["generation", "Eq", None], ["generation", comparison, generation]]],
            ],
        ]

    def index(self, source: SourceRevision, grant, generation=0):
        namespace_exists = True
        try:
            previous = self._call(
                "reuse_vectors",
                self.chunks.query,
                filters=["logical_id", "Eq", source.logical_id],
                rank_by=["id", "asc"],
                top_k=120,
                include_attributes=["chunk_text", "embed_chunk_text"],
                consistency={"level": "strong"},
            )
            vectors = {}
            for row in previous.rows or []:
                values = row.model_dump()
                vector = values.get("embed_chunk_text")
                if isinstance(vector, list) and len(vector) == 1024:
                    vectors[values["chunk_text"]] = vector
        except NotFoundError:
            vectors = {}
            namespace_exists = False
        if namespace_exists:
            self._configure_chunk_schema()
        rows = self._chunk_rows(source, generation)
        for row in rows:
            row.update(self._access(grant))
            if row["chunk_text"] in vectors:
                row["embed_chunk_text"] = vectors[row["chunk_text"]]
        conditions = {}
        if namespace_exists:
            conditions["upsert_condition"] = self._older_access()
            if generation:
                conditions["delete_by_filter"] = self._generations(source.logical_id, generation, "Lt")
        result = self._call(
            "index",
            self.chunks.write,
            upsert_rows=rows,
            **conditions,
            schema=CHUNK_SCHEMA,
            distance_metric="cosine_distance",
        )
        if result.rows_upserted != len(rows) or result.rows_remaining:
            raise CrowboError("Search generation was not fully published; resume preparation")
        self._chunk_schema_ready = True

    def _configure_chunk_schema(self):
        if not self._chunk_schema_ready:
            # Filter evaluation precedes schema changes within a write request.
            self._call(
                "configure_index", self.chunks.write, schema=CHUNK_SCHEMA, distance_metric="cosine_distance"
            )
            self._chunk_schema_ready = True

    def refresh_index(self, source, grant, generation):
        self._configure_chunk_schema()
        rows = [{"id": row["id"], **self._access(grant)} for row in self._chunk_rows(source, generation)]
        result = self._call(
            "refresh_index_access",
            self.chunks.write,
            patch_rows=rows,
            patch_condition=self._older_access(),
            schema=CHUNK_SCHEMA,
        )
        if result.rows_patched != len(rows):
            raise CrowboError("Search permissions were not fully refreshed; resume preparation")

    def delete_chunks(self, logical_id, generation):
        try:
            self._configure_chunk_schema()
            result = self._call(
                "withdraw_chunks",
                self.chunks.write,
                delete_by_filter=self._generations(logical_id, generation, "Lte"),
                schema=CHUNK_SCHEMA,
            )
        except NotFoundError:
            return
        if result.rows_remaining:
            raise CrowboError("Withdrawn chunks remain; resume withdrawal")

    def search(self, reader: str, query: str, mode: str, limit: int, *, groups=()):
        rank = (
            ["chunk_text", "ANN", ["Embed", query]] if mode == "semantic" else ["chunk_text", "BM25", query]
        )
        try:
            result = self._call(
                "search_" + mode,
                self.chunks.query,
                rank_by=rank,
                top_k=limit,
                filters=[
                    "And",
                    [self._audience_filter(reader, groups), ["expires_at", "Gt", now().isoformat()]],
                ],
                include_attributes=["logical_id", "revision_id", "generation"],
                consistency={"level": "strong"},
            )
        except NotFoundError:
            return []
        return [row.model_dump() for row in result.rows or []]

    def close(self):
        self.client.close()
