from copy import deepcopy
from datetime import timedelta

import pytest

from crowbo.contracts import Assessment, Grant, Head, SourceBatch, SourceInput, SourceRevision, digest, now
from crowbo.evidence import Evidence
from crowbo.questions import CRITERIA_HASH, CRITERIA_VERSION
from crowbo.runtime import CrowboError, Settings


def answers():
    return {
        **{
            key: {"type": "noul", "noul": 0.01}
            for key in (
                "obligation_stated",
                "deadline_stated",
                "consequence_stated",
                "owner_nondeferral_stated",
            )
        },
        "commitment_evidence": {
            "type": "choice",
            "choice": "insufficient",
            "confidence": 0.99,
            "probabilities": {"sufficient": 0.0, "insufficient": 1.0, "conflicting": 0.0},
        },
    }


class MemoryStore:
    """Test double for failure injection; does not establish hosted database behaviour."""

    def __init__(self):
        self.rows = {}
        self.indexed = []
        self.hits = []
        self.fail_index = False
        self.writes = 0

    def get(self, identifier):
        return deepcopy(self.rows.get(identifier))

    def get_many(self, identifiers):
        return {key: self.get(key) for key in identifiers if key in self.rows}

    def put(self, identifier, kind, body, *, expected_hash=None, insert_only=False, **kwargs):
        old = self.rows.get(identifier)
        if (insert_only and old is not None) or (expected_hash is not None and digest(old) != expected_hash):
            raise CrowboError("Concurrent update")
        self.rows[identifier] = deepcopy(body)
        self.writes += 1

    def heads(self, reader, *, groups=()):
        for row in list(self.rows.values()):
            if "grant" in row:
                head = Head.model_validate(row)
                if not head.withdrawn and head.grant.permits(reader, now(), groups=groups):
                    yield deepcopy(row)

    def index(self, source, grant, generation=0):
        if self.fail_index:
            raise CrowboError("Simulated embedding failure")
        self.indexed.append(source.revision_id)

    def refresh_index(self, source, grant, generation):
        if self.fail_index:
            raise CrowboError("Simulated permission update failure")

    def delete_chunks(self, logical_id, generation):
        self.hits = [
            hit
            for hit in self.hits
            if hit["logical_id"] != logical_id or hit.get("generation", 0) > generation
        ]

    def search(self, reader, query, mode, limit, *, groups=()):
        return self.hits[:limit]


class FakeJev:
    def __init__(self):
        self.calls = 0
        self.fail = False

    def assess(self, source):
        self.calls += 1
        if self.fail:
            raise CrowboError("Simulated Jev failure")
        return Assessment(
            source_revision=source.revision_id,
            criteria_version=CRITERIA_VERSION,
            criteria_hash=CRITERIA_HASH,
            returned_model="jev-test",
            answers=answers(),
            input_tokens=1,
            output_tokens=1,
            elapsed_seconds=0.01,
            assessed_at=now(),
        )


@pytest.fixture
def settings(tmp_path):
    return Settings(
        tenant="synthetic",
        reader="operator",
        source_scopes=("fixture:public",),
        runtime_dir=tmp_path / "runtime",
        cloudflare_account="0" * 32,
        budget_usd="10.00",
        query_processors=("turbopuffer", "voyage"),
    )


@pytest.fixture
def item():
    at = now()
    return SourceInput(
        source=SourceRevision(
            tenant="synthetic",
            connector="fixture",
            workspace="public",
            native_id="issue-1",
            source_url="https://example.org/issues/1",
            title="Synthetic access review",
            text="An invented development example. Owner requests an access review; no obligation is stated.",
            updated_at=at - timedelta(days=2),
            observed_at=at,
            basis="synthetic",
            kind="issue",
        ),
        grant=Grant(
            readers=("operator",),
            processors=("turbopuffer", "jev", "voyage"),
            checked_at=at - timedelta(minutes=5),
            expires_at=at + timedelta(hours=1),
        ),
    )


def batch(*items):
    return SourceBatch(
        scope="Synthetic test only", coverage="partial", limitations=("No real evidence",), records=items
    )


@pytest.fixture
def engine(settings):
    return Evidence(settings, MemoryStore(), FakeJev())
