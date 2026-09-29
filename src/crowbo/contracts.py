import json
from datetime import UTC, datetime
from hashlib import sha256
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    JsonValue,
    computed_field,
    model_validator,
)

ReasoningModel = Literal["openai/gpt-6-luna", "@cf/zai-org/glm-5.3-flash"]


def now() -> datetime:
    return datetime.now(UTC)


def digest(value: object) -> str:
    return sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)


class SourceRevision(Record):
    fingerprint_version: Literal[1, 2] = 1
    tenant: str = Field(min_length=1, max_length=100)
    connector: Literal[
        "linear", "notion", "slack", "hibob", "github", "granola", "drive", "manual", "fixture"
    ]
    workspace: str = Field(min_length=1, max_length=100)
    native_id: str = Field(min_length=1, max_length=200)
    source_url: HttpUrl
    title: str = Field(min_length=1, max_length=1000)
    text: str = Field(min_length=1, max_length=40000)
    updated_at: AwareDatetime
    observed_at: AwareDatetime
    timestamp_basis: Literal["source_update", "observation"] = "source_update"
    basis: Literal["real", "synthetic", "public"]
    kind: Literal[
        "issue",
        "comment",
        "page",
        "owner_statement",
        "thread",
        "calendar_snapshot",
        "pull_request",
        "team_membership",
        "meeting_summary",
    ]
    owner: str | None = Field(default=None, max_length=300)
    status: str | None = Field(default=None, max_length=100)
    due_date: str | None = Field(default=None, max_length=30)
    limitations: tuple[str, ...] = ()

    @model_validator(mode="after")
    def times(self):
        if self.updated_at > self.observed_at:
            raise ValueError("source update is later than observation")
        if self.timestamp_basis == "observation" and self.updated_at != self.observed_at:
            raise ValueError("observation-based revisions must use their capture timestamp")
        return self

    @property
    def logical_id(self) -> str:
        return digest([self.tenant, self.connector, self.workspace, self.native_id])

    @property
    def revision_id(self) -> str:
        body = self.model_dump(mode="json", exclude={"observed_at", "fingerprint_version"})
        if self.fingerprint_version == 2:
            body.pop("updated_at")
            body.pop("timestamp_basis")
            return digest(["source-v2", body])
        if self.timestamp_basis == "source_update":
            # Preserve revision IDs written before timestamp provenance was explicit.
            body.pop("timestamp_basis")
        return digest(body)


class Grant(Record):
    readers: tuple[str, ...]
    reader_groups: tuple[Annotated[str, Field(min_length=1, max_length=200)], ...] = Field(
        default=(), max_length=100
    )
    processors: tuple[Literal["turbopuffer", "voyage", "jev"] | ReasoningModel, ...]
    checked_at: AwareDatetime
    expires_at: AwareDatetime
    revoked: bool = False

    @model_validator(mode="after")
    def times(self):
        if self.expires_at <= self.checked_at:
            raise ValueError("permission expiry must follow its check")
        return self

    def permits(
        self, reader: str, at: datetime, processor: str | None = None, *, groups: tuple[str, ...] = ()
    ) -> bool:
        return (
            not self.revoked
            and (reader in self.readers or bool(set(groups).intersection(self.reader_groups)))
            and self.checked_at <= at < self.expires_at
            and (processor is None or processor in self.processors)
        )


class SourceInput(Record):
    source: SourceRevision
    grant: Grant


class SourceBatch(Record):
    schema_version: Literal[1] = 1
    scope: str = Field(min_length=1, max_length=2000)
    coverage: Literal["partial", "complete"]
    limitations: tuple[str, ...]
    records: tuple[SourceInput, ...] = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def bounded(self):
        if sum(len(r.source.text.encode()) for r in self.records) > 200_000:
            raise ValueError("pilot exceeds its 200 KB text limit")
        if len({r.source.logical_id for r in self.records}) != len(self.records):
            raise ValueError("a batch must contain one revision per source identity")
        return self


class Noul(Record):
    type: Literal["noul"]
    noul: float = Field(ge=0, le=1, allow_inf_nan=False)


class Choice(Record):
    type: Literal["choice"]
    choice: str
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    probabilities: dict[str, float]

    @model_validator(mode="after")
    def distribution(self):
        if self.choice not in self.probabilities:
            raise ValueError("choice absent from distribution")
        if any(not 0 <= v <= 1 for v in self.probabilities.values()):
            raise ValueError("invalid probability")
        if abs(sum(self.probabilities.values()) - 1) > 0.02:
            raise ValueError("invalid probability total")
        return self


class Score(Record):
    type: Literal["score"]
    score: float = Field(ge=0, allow_inf_nan=False)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    legend: dict[str, JsonValue]
    probabilities: dict[str, float]

    @model_validator(mode="after")
    def distribution(self):
        expected = {str(i) for i in range(len(self.legend))}
        if len(expected) < 2 or set(self.legend) != expected or set(self.probabilities) != expected:
            raise ValueError("invalid score levels")
        if self.score > len(expected) - 1 or any(not 0 <= v <= 1 for v in self.probabilities.values()):
            raise ValueError("score outside its scale")
        if abs(sum(self.probabilities.values()) - 1) > 0.02:
            raise ValueError("invalid probability total")
        return self


Answer = Annotated[Noul | Choice | Score, Field(discriminator="type")]


class Assessment(Record):
    source_revision: str
    criteria_version: str
    criteria_hash: str
    requested_model: Literal["typesafe/jev"] = "typesafe/jev"
    returned_model: str = Field(pattern=r"^(?:typesafe/)?jev[-\w.]+$")
    answers: dict[str, Answer]
    questions: dict[str, dict[str, JsonValue]] = Field(default_factory=dict)
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    elapsed_seconds: float = Field(ge=0, allow_inf_nan=False)
    assessed_at: AwareDatetime
    interpretation_only: Literal[True] = True


class Head(Record):
    logical_id: str
    revision_id: str
    updated_at: AwareDatetime
    grant: Grant
    scope: str
    coverage: Literal["partial", "complete"]
    limitations: tuple[str, ...]
    assessment_id: str | None = None
    indexed_revision: str | None = None
    conflicted: bool = False
    generation: int = Field(default=0, ge=0)
    last_checked_at: AwareDatetime | None = None
    index_grant_hash: str | None = None
    sync_id: str | None = None
    withdrawn: bool = False


class EvidenceView(Record):
    source: SourceRevision
    assessment: Assessment | None
    coverage: Literal["partial", "complete"]
    limitations: tuple[str, ...]
    index_ready: bool
    assessment_current: bool = False
    last_checked_at: AwareDatetime | None = None
    sync_id: str | None = None

    @computed_field
    @property
    def source_id(self) -> str:
        return self.source.logical_id
