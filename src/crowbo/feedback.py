"""Attributed feedback on immutable advice; no approval, inference or source edits."""

import json
import re
from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, model_validator

from .contracts import Record, SourceRevision, digest, now
from .review import Review
from .runtime import CrowboError

SourceId = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Text = Annotated[str, Field(min_length=1, max_length=2000)]


class ReportedChoice(Record):
    kind: Literal["recommendation", "alternative", "custom", "defer"]
    alternative_index: int | None = Field(default=None, ge=0, le=19)
    custom: Text | None = None

    @model_validator(mode="after")
    def selection(self):
        if (self.kind == "alternative") != (self.alternative_index is not None):
            raise ValueError("only an alternative choice requires its zero-based index")
        if (self.kind == "custom") != (self.custom is not None):
            raise ValueError("only a custom choice requires proposed text")
        return self


class ReportedNote(Record):
    statement: Text
    basis: Text
    source_ids: tuple[SourceId, ...] = Field(default=(), max_length=15)


class ReportedOutcome(ReportedNote):
    observed_on: date


class FeedbackRequest(Record):
    result_id: SourceId
    reviewed_at: AwareDatetime
    rationale: Text
    choice: ReportedChoice | None = None
    corrections: tuple[ReportedNote, ...] = Field(default=(), max_length=5)
    outcome: ReportedOutcome | None = None
    revisit_when: tuple[Text, ...] = Field(default=(), max_length=5)
    supporting_revisions: dict[SourceId, SourceId] = Field(default_factory=dict, max_length=15)

    @model_validator(mode="after")
    def bounds(self):
        if re.search(r"\[(?:E|P)\d+\]", self.model_dump_json()):
            raise ValueError("feedback must use exact source references, not local E/P citation labels")
        if self.reviewed_at > now():
            raise ValueError("reported review time cannot be in the future")
        if self.outcome and self.outcome.observed_on > self.reviewed_at.date():
            raise ValueError("reported outcome cannot follow the reported review date")
        if not (self.choice or self.corrections or self.outcome):
            raise ValueError("feedback needs a choice, correction or reported outcome")
        for note in (*self.corrections, *((self.outcome,) if self.outcome else ())):
            if len(set(note.source_ids)) != len(note.source_ids):
                raise ValueError("duplicate feedback source reference")
            if not set(note.source_ids).issubset(self.supporting_revisions):
                raise ValueError("feedback source references require exact supporting revisions")
        return self


class Feedback:
    def __init__(self, evidence):
        self.evidence = evidence

    def _resolve(self, body):
        request = FeedbackRequest.model_validate(body["request"])
        parent = Review(self.evidence, None).inspect(request.result_id)
        if "decision" not in parent:
            raise CrowboError("Feedback requires a saved decision")
        contributors = set(parent["request"]["source_ids"]) | set(request.supporting_revisions)
        if len(contributors) > 15:
            raise CrowboError("Feedback exceeds the 15-source decision limit")
        selected = None
        if request.choice:
            choice = request.choice
            if choice.kind == "recommendation":
                selected = parent["answer"]["recommendation"]
            elif choice.kind == "alternative":
                alternatives = parent["answer"]["alternatives"]
                if choice.alternative_index >= len(alternatives):
                    raise CrowboError("Selected alternative does not exist in the saved decision")
                selected = alternatives[choice.alternative_index]
            elif choice.kind == "custom":
                selected = choice.custom
        sources = []
        if request.supporting_revisions:
            rows = self.evidence.store.get_many(request.supporting_revisions.values())
            for source_id, revision_id in request.supporting_revisions.items():
                if revision_id not in rows:
                    raise CrowboError("Feedback supporting revision is unavailable")
                source = SourceRevision.model_validate(rows[revision_id])
                if source.logical_id != source_id or source.revision_id != revision_id:
                    raise CrowboError("Feedback supporting revision failed its integrity check")
                sources.append(source)
        sources.extend(SourceRevision.model_validate(entry["source"]) for entry in parent["evidence"])
        heads = self.evidence.authorize_history_many(sources)
        current = parent["evidence_unchanged"]
        for source, head in zip(sources, heads, strict=True):
            if head.withdrawn:
                raise CrowboError("A feedback contributing source has been withdrawn")
            current &= not head.conflicted and head.revision_id == source.revision_id
        return parent, {
            **body,
            "source_ids": sorted(contributors),
            "selected_choice": selected,
            "evidence_unchanged": bool(current),
        }

    def record(self, request: FeedbackRequest):
        if "turbopuffer" not in self.evidence.settings.query_processors:
            raise CrowboError("Feedback storage route is not permitted")
        body = {
            "kind": "decision_feedback",
            "tenant": self.evidence.settings.tenant,
            "reader": self.evidence.settings.reader,
            "request": request.model_dump(mode="json"),
            "simulated": True,
            "attribution": "startup-bound operator assertion; human identity is not verified",
            "authority_verified": False,
            "outcome_verified": False,
        }
        identifier = digest(["decision_feedback", body])
        existing = self.evidence.store.get(identifier)
        if existing is not None:
            if existing != body:
                raise CrowboError("Feedback replay differs from its stored record")
            return self.inspect(identifier)
        self._resolve(body)
        try:
            self.evidence.store.put(identifier, "decision_feedback", body, insert_only=True)
        except CrowboError:
            if self.evidence.store.get(identifier) != body:
                raise
        return self.inspect(identifier)

    def inspect(self, identifier):
        body = self.evidence.store.get(identifier)
        if (
            not body
            or body.get("kind") != "decision_feedback"
            or body.get("tenant") != self.evidence.settings.tenant
            or body.get("reader") != self.evidence.settings.reader
            or digest(["decision_feedback", body]) != identifier
        ):
            raise CrowboError("Feedback is unavailable")
        _, result = self._resolve(body)
        return {"id": identifier, **result}

    def for_reassessment(self, identifier, request):
        feedback = self.inspect(identifier)
        parent = Review(self.evidence, None).inspect(feedback["request"]["result_id"])
        prior = parent["decision"]["request"]
        if prior["case_id"] != request.case_id or prior["case_version"] == request.case_version:
            raise CrowboError("Reassessment requires the same case and a different version")
        if not set(feedback["source_ids"]).issubset(request.source_ids):
            raise CrowboError("Reassessment must retain every prior and feedback contributor")

        def historical(value):
            return json.loads(re.sub(r"\[E(\d+)\]", r"[P\1]", json.dumps(value)))

        prior_answer = historical(parent["answer"])
        prior_answer["evidence_ids"] = ["P" + label[1:] for label in parent["answer"]["evidence_ids"]]

        return {
            "feedback": {key: value for key, value in feedback.items() if key != "selected_choice"},
            "prior_result_id": parent["id"],
            "prior_answer": prior_answer,
            "prior_selected_choice": historical(feedback["selected_choice"]),
            "prior_bindings": {
                f"P{i}": {
                    "source_id": source_id,
                    "revision_id": SourceRevision.model_validate(entry["source"]).revision_id,
                }
                for i, (source_id, entry) in enumerate(
                    zip(parent["request"]["source_ids"], parent["evidence"], strict=True), 1
                )
            },
            "interpretation": "Reported feedback and historical advice, not authority or verified outcomes. "
            "P labels refer only to historical revisions; reassess using current E evidence.",
        }
