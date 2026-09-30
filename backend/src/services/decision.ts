import { accessQuestions, ASSESSOR_CONTRACT } from "../domain/access";
import { digest } from "../domain/canonical";
import { type EvidenceView, evidenceView, revisionId, sameValue } from "../domain/contracts";
import { ContractError, CrowboError } from "../domain/errors";
import { calculateLoss, type DecisionRequest, decisionRequest } from "../domain/decision-request";
import { reviewRequest } from "../domain/review";
import { DAY, micros, now } from "../domain/time";
import { type AssessorFactory, assessAccess } from "./access-assessment";
import type { Evidence } from "./evidence";
import { Feedback } from "./feedback";
import { type Proposer, Review } from "./review";

export const DECISION_MODEL = "@cf/zai-org/glm-5.3-flash";

/** One evidence-bound decision over explicitly selected, fresh, fully prepared sources. */
export class Decision {
  constructor(
    readonly evidence: Evidence,
    readonly reasoner: Proposer | null,
    readonly makeAssessor: AssessorFactory | null = null,
  ) {}

  ready(request: DecisionRequest, views: readonly EvidenceView[]): void {
    const at = micros(now());
    for (const view of views) {
      if (request.access === null && (!view.assessment_current || view.assessment === null)) {
        throw new CrowboError("Decision requires current Jev criteria for every selected source");
      }
      if (request.access === null) {
        try {
          this.evidence.questions.check(view.assessment!);
        } catch (error) {
          if (error instanceof ContractError) throw new CrowboError("Decision assessment does not match the active questions");
          throw error;
        }
      }
      const checked = micros(view.last_checked_at ?? view.source.observed_at);
      if (micros(view.source.observed_at) > at || checked > at || at - checked > DAY) {
        throw new CrowboError("Decision source content is stale or future-dated; refresh it first");
      }
      if (!view.index_ready) throw new CrowboError("Decision source preparation is incomplete");
      const expected = request.expected_revisions[view.source_id];
      if (expected !== undefined && expected !== revisionId(view.source)) {
        throw new CrowboError("Decision source revision differs from the requested baseline");
      }
    }
  }

  async run(input: DecisionRequest) {
    const request = decisionRequest.parse(input);
    const processors = this.evidence.settings.query_processors;
    if (!processors.includes("turbopuffer") || !processors.includes(DECISION_MODEL)) {
      throw new CrowboError("Decision storage or reasoning route is not permitted");
    }
    const views = await this.evidence.inspectMany(request.source_ids);
    this.ready(request, views);
    const reassessment = request.prior_feedback_id ? await new Feedback(this.evidence).forReassessment(request.prior_feedback_id, request) : null;

    const checkSnapshot = async () => {
      const current = await this.evidence.inspectMany(request.source_ids);
      const heads = await this.evidence.authorizeHistoryMany(current.map((v) => v.source));
      current.forEach((view, i) => {
        this.evidence.checkProcessing(view, heads[i], DECISION_MODEL);
        if (heads[i].withdrawn) throw new CrowboError("Decision source has been withdrawn");
        if (heads[i].sync_id !== view.sync_id || (heads[i].last_checked_at ?? view.source.observed_at) !== view.last_checked_at) {
          throw new CrowboError("Decision source coverage changed during checking");
        }
      });
      this.ready(request, current);
      if (!sameValue(current, views)) throw new CrowboError("Decision evidence or assessment changed during reasoning");
    };

    const bindings = views.map((view) => ({
      source_id: view.source_id,
      revision_id: revisionId(view.source),
      criteria_version: view.assessment?.criteria_version ?? null,
      criteria_hash: view.assessment?.criteria_hash ?? null,
      content_checked_at: view.last_checked_at ?? view.source.observed_at,
    }));
    const packet: Record<string, any> = {
      request,
      input_fingerprint: digest([request, bindings]),
      bindings,
      checks: {
        source_readiness: "passed",
        content_freshness_hours: 24,
        jev_answers: "source interpretations; no combined score",
        commitment_qualification: "requires obligation, deadline, consequence and owner non-deferral",
        capacity_feasibility: "unresolved; not independently checked",
        accountable_owner: request.accountable_owner ? "operator_assertion" : "unresolved",
      },
      calculation: calculateLoss(request.risk),
      counterfactual: request.counterfactual !== null,
      assessment_at: now(),
    };
    if (reassessment) packet.reassessment = reassessment;
    if (request.access) {
      delete packet.checks.commitment_qualification;
      packet.checks.access_qualification = "account, scope and exact source spans; interpretations require review";
      packet.checks.jev_answers = "contextual source interpretations when supplied; no combined score";
      if (request.method === "crowbo") {
        if (!this.makeAssessor) throw new CrowboError("Contextual Jev assessment is not configured");
        packet.access_assessments = await assessAccess(this.evidence, views, request.access, this.makeAssessor, checkSnapshot);
      }
    }
    const review = reviewRequest.parse({
      question: request.question,
      source_ids: request.source_ids,
      context: request.context,
      model: DECISION_MODEL,
      reasoning_effort: "high",
      max_completion_tokens: 8192,
      answer_format: request.access ? "access" : request.method === "crowbo" ? "deciding_facts" : "prose",
      include_jev: request.method === "crowbo",
      access_guidance: request.access !== null && request.method !== "plain",
    });
    return new Review(this.evidence, this.reasoner).runSnapshot(review, views, { decision: packet, checkSnapshot });
  }

  async inspect(id: string) {
    const result = await new Review(this.evidence, null).inspect(id);
    if (!("decision" in result)) throw new CrowboError("Decision is unavailable");
    const request = decisionRequest.parse(result.decision.request);
    const views = result.evidence.map(({ source_id: _s, id: _i, ...stored }: any) => evidenceView.parse(stored));
    let readiness: string | null = null;
    try {
      this.ready(request, views);
      if (request.access && request.method === "crowbo") {
        const questions = accessQuestions(request.access);
        const assessed = result.decision.access_assessments ?? {};
        if (
          assessed.criteria_version !== questions.version ||
          assessed.criteria_hash !== questions.fingerprint ||
          assessed.provider_contract !== ASSESSOR_CONTRACT
        ) {
          throw new CrowboError("Access assessment criteria changed; reassess the decision");
        }
      }
    } catch (error) {
      if (!(error instanceof CrowboError)) throw error;
      readiness = error.message;
    }
    return { ...result, decision_ready: result.evidence_unchanged && readiness === null, readiness_issue: readiness };
  }
}
