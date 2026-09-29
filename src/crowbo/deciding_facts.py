"""Model interpretations with exact source spans; bindings do not establish truth."""

from typing import Literal

from pydantic import Field, model_validator

from .contracts import Record, SourceRevision
from .runtime import CrowboError


class Excerpt(Record):
    evidence_id: str = Field(pattern=r"^E[1-9][0-9]*$")
    quote: str = Field(min_length=12, max_length=600)


class Fact(Record):
    state: Literal["stated", "unknown", "conflicting"]
    value: str | None = Field(default=None, min_length=1, max_length=600)
    citations: tuple[Excerpt, ...] = Field(default=(), max_length=3)

    @model_validator(mode="after")
    def support(self):
        if self.state == "unknown" and (self.value is not None or self.citations):
            raise ValueError("unknown facts have no asserted value or citations")
        if self.state != "unknown" and (self.value is None or not self.citations):
            raise ValueError("stated or conflicting facts require a value and citations")
        if self.state == "conflicting" and len(set(self.citations)) < 2:
            raise ValueError("conflicting facts require distinct cited spans")
        return self


class Deliverable(Record):
    title: str = Field(min_length=1, max_length=200)
    anchor: Excerpt
    obligation: Fact = Fact(state="unknown")
    deadline: Fact = Fact(state="unknown")
    owner: Fact = Fact(state="unknown")
    completion: Fact = Fact(state="unknown")
    consequence: Fact = Fact(state="unknown")
    nondeferral: Fact = Fact(state="unknown")
    capacity: Fact = Fact(state="unknown")


class JevReference(Record):
    evidence_id: str = Field(pattern=r"^E[1-9][0-9]*$")
    question_id: str = Field(min_length=1, max_length=100)


def bind_excerpt(excerpt, evidence, cited_labels):
    by_label = {entry["id"]: entry for entry in evidence}
    if excerpt.evidence_id not in by_label or excerpt.evidence_id not in cited_labels:
        raise CrowboError("Fact cites evidence outside the answer's selected references")
    revision = SourceRevision.model_validate(by_label[excerpt.evidence_id]["source"])
    if revision.text.count(excerpt.quote) != 1:
        raise CrowboError("Deciding fact quote must match one exact span in its cited source")
    start = revision.text.index(excerpt.quote)
    return {
        **excerpt.model_dump(),
        "source_id": revision.logical_id,
        "revision_id": revision.revision_id,
        "start": start,
        "end": start + len(excerpt.quote),
    }


class DecidingFacts(Record):
    deliverables: tuple[Deliverable, ...] = Field(min_length=1, max_length=3)
    jev_references: tuple[JevReference, ...] = Field(default=(), max_length=6)

    def bind(self, evidence, cited_labels):
        by_label = {entry["id"]: entry for entry in evidence}

        def source(label):
            if label not in by_label or label not in cited_labels:
                raise CrowboError("Deciding fact cites evidence outside the answer's selected references")
            return by_label[label]

        def bind_quote(excerpt):
            return bind_excerpt(excerpt, evidence, cited_labels)

        cards = []
        for card in self.deliverables:
            facts = {}
            for name in (
                "obligation",
                "deadline",
                "owner",
                "completion",
                "consequence",
                "nondeferral",
                "capacity",
            ):
                fact = getattr(card, name)
                facts[name] = {
                    **fact.model_dump(),
                    "citations": [bind_quote(c) for c in fact.citations],
                }
            required = ("obligation", "deadline", "owner", "consequence", "nondeferral")
            cards.append(
                {
                    "title": card.title,
                    "anchor": bind_quote(card.anchor),
                    "facts": facts,
                    "unresolved_commitment_fields": [
                        name for name in required if facts[name]["state"] != "stated"
                    ],
                    "authority_verified": False,
                    "capacity_verified": False,
                }
            )
        rows = []
        for ref in self.jev_references:
            entry = source(ref.evidence_id)
            assessment = entry.get("assessment")
            if not assessment or ref.question_id not in assessment["answers"]:
                raise CrowboError("Deciding fact references an unavailable Jev question")
            revision = SourceRevision.model_validate(entry["source"])
            rows.append(
                {
                    **ref.model_dump(),
                    "source_id": revision.logical_id,
                    "revision_id": revision.revision_id,
                    "criteria_hash": assessment["criteria_hash"],
                    "criteria_version": assessment["criteria_version"],
                    "question": assessment["questions"].get(ref.question_id),
                    "answer": assessment["answers"][ref.question_id],
                }
            )
        return {
            "version": "deciding-facts-v1",
            "deliverables": cards,
            "jev": rows,
            "interpretation": "Exact quotations checked; fact meanings and deliverable associations are model interpretations.",
        }
