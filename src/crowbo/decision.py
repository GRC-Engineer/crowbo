"""One evidence-bound decision and optional, attributed expected-loss calculation."""

from datetime import date, timedelta
from decimal import Decimal, localcontext
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .access import ASSESSOR_CONTRACT, AccessSubject, access_questions, assess_access
from .contracts import EvidenceView, Record, digest, now
from .feedback import Feedback, SourceId
from .review import Review, ReviewRequest
from .runtime import CrowboError

Text = Annotated[str, Field(min_length=1, max_length=1000)]
Amount = Annotated[Decimal, Field(ge=0, max_digits=24, decimal_places=8, allow_inf_nan=False)]
MODEL = "@cf/zai-org/glm-5.3-flash"


class Provenance(Record):
    kind: Literal["source_assertion", "operator_assertion", "counterfactual"]
    attributed_to: str = Field(min_length=1, max_length=300)
    basis: str = Field(min_length=1, max_length=2000)
    source_ids: tuple[SourceId, ...] = Field(default=(), max_length=15)

    @model_validator(mode="after")
    def source_binding(self):
        if self.kind == "source_assertion" and not self.source_ids:
            raise ValueError("source assertions require selected evidence")
        if len(set(self.source_ids)) != len(self.source_ids):
            raise ValueError("duplicate provenance source")
        return self


class RiskEstimate(Record):
    value: Amount
    provenance: Provenance
    low: Amount | None = None
    high: Amount | None = None

    @model_validator(mode="after")
    def bounds(self):
        if (self.low is None) != (self.high is None):
            raise ValueError("sensitivity bounds require both low and high")
        if self.low is not None and not self.low <= self.value <= self.high:
            raise ValueError("sensitivity bounds must contain the stated value")
        return self


class RiskInputs(Record):
    scenario: Text
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    annual_frequency: RiskEstimate | None = None
    mean_loss_per_event: RiskEstimate | None = None


class Counterfactual(Record):
    label: Text
    attributed_to: str = Field(min_length=1, max_length=300)
    changes: str = Field(min_length=1, max_length=4000)


class DecisionRequest(Record):
    case_id: str = Field(default="ad-hoc", min_length=1, max_length=100)
    case_version: str = Field(default="1", min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=4000)
    source_ids: tuple[SourceId, ...] = Field(min_length=1, max_length=15)
    expected_revisions: dict[SourceId, SourceId] = Field(default_factory=dict, max_length=15)
    subject: Text
    scope: Text
    window_start: date
    window_end: date
    objectives: tuple[Text, ...] = Field(min_length=1, max_length=10)
    accountable_owner: str | None = Field(default=None, min_length=1, max_length=300)
    context: str = Field(default="", max_length=10000)
    counterfactual: Counterfactual | None = None
    risk: RiskInputs | None = None
    prior_feedback_id: SourceId | None = None
    method: Literal["crowbo", "plain", "crowbo_without_jev"] = "crowbo"
    access: AccessSubject | None = None

    @model_validator(mode="after")
    def boundaries(self):
        if self.method == "crowbo_without_jev" and self.access is None:
            raise ValueError("the matched no-Jev method requires an access decision")
        if len(set(self.source_ids)) != len(self.source_ids):
            raise ValueError("duplicate source reference")
        if not timedelta() <= self.window_end - self.window_start <= timedelta(days=31):
            raise ValueError("decision window must be ordered and at most 31 days")
        if self.expected_revisions and set(self.expected_revisions) != set(self.source_ids):
            raise ValueError("expected revisions must bind every selected source")
        if self.risk:
            for estimate in (self.risk.annual_frequency, self.risk.mean_loss_per_event):
                if estimate is None:
                    continue
                if not set(estimate.provenance.source_ids).issubset(self.source_ids):
                    raise ValueError("risk provenance must use selected evidence")
                if estimate.provenance.kind == "counterfactual" and self.counterfactual is None:
                    raise ValueError("counterfactual risk requires an explicit overlay")
        return self


def calculate_loss(inputs: RiskInputs | None):
    """Conditional expected annual loss; bounds show sensitivity, never percentiles."""
    result = {
        "formula_version": "annual-expected-loss-v1",
        "formula": "annual_frequency * mean_loss_per_event",
        "input_units": {"annual_frequency": "events/year", "mean_loss_per_event": "currency/event"},
        "unit": f"{inputs.currency}/year" if inputs else None,
        "interpretation": "Conditional arithmetic from attributed inputs; not a calibrated forecast.",
    }
    missing = [
        name
        for name in ("annual_frequency", "mean_loss_per_event")
        if inputs is None or getattr(inputs, name) is None
    ]
    if missing:
        return {**result, "status": "missing_input", "missing": missing}
    frequency, loss = inputs.annual_frequency, inputs.mean_loss_per_event
    with localcontext() as context:
        context.prec = 60
        result.update(status="calculated", expected_annual_loss=format(frequency.value * loss.value, "f"))
        if frequency.low is not None or loss.low is not None:
            result["sensitivity_envelope"] = {
                "low": format(
                    (frequency.low if frequency.low is not None else frequency.value)
                    * (loss.low if loss.low is not None else loss.value),
                    "f",
                ),
                "high": format(
                    (frequency.high if frequency.high is not None else frequency.value)
                    * (loss.high if loss.high is not None else loss.value),
                    "f",
                ),
                "meaning": "Input bounds only; not a probability or confidence interval.",
            }
    return result


class Decision:
    def __init__(self, evidence, reasoner):
        self.evidence, self.reasoner = evidence, reasoner

    def _ready(self, request, views):
        at = now()
        for view in views:
            if request.access is None and (not view.assessment_current or view.assessment is None):
                raise CrowboError("Decision requires current Jev criteria for every selected source")
            if request.access is None:
                try:
                    self.evidence.questions.check(view.assessment)
                except ValueError:
                    raise CrowboError("Decision assessment does not match the active questions") from None
            checked = view.last_checked_at or view.source.observed_at
            if view.source.observed_at > at or checked > at or at - checked > timedelta(hours=24):
                raise CrowboError("Decision source content is stale or future-dated; refresh it first")
            if not view.index_ready:
                raise CrowboError("Decision source preparation is incomplete")
            expected = request.expected_revisions.get(view.source_id)
            if expected is not None and expected != view.source.revision_id:
                raise CrowboError("Decision source revision differs from the requested baseline")

    def run(self, request: DecisionRequest):
        if not {"turbopuffer", MODEL}.issubset(self.evidence.settings.query_processors):
            raise CrowboError("Decision storage or reasoning route is not permitted")
        views = self.evidence.inspect_many(request.source_ids)
        self._ready(request, views)
        reassessment = (
            Feedback(self.evidence).for_reassessment(request.prior_feedback_id, request)
            if request.prior_feedback_id
            else None
        )

        def check_snapshot():
            current = self.evidence.inspect_many(request.source_ids)
            heads = self.evidence.authorize_history_many([view.source for view in current])
            for view, head in zip(current, heads, strict=True):
                self.evidence._check_processing(view, head, MODEL)
                if head.withdrawn:
                    raise CrowboError("Decision source has been withdrawn")
                if (
                    head.sync_id != view.sync_id
                    or (head.last_checked_at or view.source.observed_at) != view.last_checked_at
                ):
                    raise CrowboError("Decision source coverage changed during checking")
            self._ready(request, current)
            if current != views:
                raise CrowboError("Decision evidence or assessment changed during reasoning")

        bindings = [
            {
                "source_id": view.source_id,
                "revision_id": view.source.revision_id,
                "criteria_version": view.assessment.criteria_version if view.assessment else None,
                "criteria_hash": view.assessment.criteria_hash if view.assessment else None,
                "content_checked_at": (view.last_checked_at or view.source.observed_at).isoformat(),
            }
            for view in views
        ]
        packet = {
            "request": request.model_dump(mode="json"),
            "input_fingerprint": digest([request.model_dump(mode="json"), bindings]),
            "bindings": bindings,
            "checks": {
                "source_readiness": "passed",
                "content_freshness_hours": 24,
                "jev_answers": "source interpretations; no combined score",
                "commitment_qualification": "requires obligation, deadline, consequence and owner non-deferral",
                "capacity_feasibility": "unresolved; not independently checked",
                "accountable_owner": "operator_assertion" if request.accountable_owner else "unresolved",
            },
            "calculation": calculate_loss(request.risk),
            "counterfactual": request.counterfactual is not None,
            "assessment_at": now().isoformat(),
        }
        if reassessment is not None:
            packet["reassessment"] = reassessment
        if request.access is not None:
            packet["checks"].pop("commitment_qualification")
            packet["checks"]["access_qualification"] = (
                "account, scope and exact source spans; interpretations require review"
            )
            packet["checks"]["jev_answers"] = (
                "contextual source interpretations when supplied; no combined score"
            )
            if request.method == "crowbo":
                packet["access_assessments"] = assess_access(
                    self.evidence, views, request.access, self.reasoner.runtime, check_snapshot
                )
        review = ReviewRequest(
            question=request.question,
            source_ids=request.source_ids,
            context=request.context,
            model=MODEL,
            reasoning_effort="high",
            max_completion_tokens=8192,
            answer_format="access"
            if request.access
            else ("deciding_facts" if request.method == "crowbo" else "prose"),
            include_jev=request.method == "crowbo",
            access_guidance=request.access is not None and request.method != "plain",
        )
        return Review(self.evidence, self.reasoner)._run_snapshot(
            review,
            views,
            decision=packet,
            check_snapshot=check_snapshot,
        )

    def inspect(self, identifier):
        result = Review(self.evidence, None).inspect(identifier)
        if "decision" not in result:
            raise CrowboError("Decision is unavailable")
        request = DecisionRequest.model_validate(result["decision"]["request"])
        views = [
            EvidenceView.model_validate({k: v for k, v in stored.items() if k not in {"source_id", "id"}})
            for stored in result["evidence"]
        ]
        readiness = None
        try:
            self._ready(request, views)
            if request.access is not None and request.method == "crowbo":
                questions = access_questions(request.access)
                assessment = result["decision"].get("access_assessments", {})
                if (
                    assessment.get("criteria_version") != questions.version
                    or assessment.get("criteria_hash") != questions.fingerprint
                    or assessment.get("provider_contract") != ASSESSOR_CONTRACT
                ):
                    raise CrowboError("Access assessment criteria changed; reassess the decision")
        except CrowboError as error:
            readiness = str(error)
        return {
            **result,
            "decision_ready": result["evidence_unchanged"] and readiness is None,
            "readiness_issue": readiness,
        }
