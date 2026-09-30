import { digest } from "../domain/canonical";
import { logicalId, revisionId, sameValue, sourceRevision } from "../domain/contracts";
import { CrowboError } from "../domain/errors";
import { type FeedbackRequest, feedbackRequestSchema } from "../domain/feedback";
import { now } from "../domain/time";
import type { Evidence } from "./evidence";
import { Review } from "./review";

export const feedbackRequest = feedbackRequestSchema(now);

/** Attributed feedback on immutable advice: no approval, inference or source edits. */
export class Feedback {
  constructor(readonly evidence: Evidence) {}

  private async resolve(body: Record<string, any>) {
    const request = feedbackRequest.parse(body.request);
    const parent = await new Review(this.evidence, null).inspect(request.result_id);
    if (!("decision" in parent)) throw new CrowboError("Feedback requires a saved decision");
    const contributors = new Set<string>([...parent.request.source_ids, ...Object.keys(request.supporting_revisions)]);
    if (contributors.size > 15) throw new CrowboError("Feedback exceeds the 15-source decision limit");
    let selected: string | null = null;
    const choice = request.choice;
    if (choice) {
      if (choice.kind === "recommendation") selected = parent.answer.recommendation;
      else if (choice.kind === "alternative") {
        const alternatives = parent.answer.alternatives as string[];
        if (choice.alternative_index! >= alternatives.length) throw new CrowboError("Selected alternative does not exist in the saved decision");
        selected = alternatives[choice.alternative_index!];
      } else if (choice.kind === "custom") selected = choice.custom;
    }
    const sources = [];
    const supporting = Object.entries(request.supporting_revisions);
    if (supporting.length) {
      const rows = await this.evidence.store.getMany(supporting.map(([, revision]) => revision));
      for (const [source, revision] of supporting) {
        if (!rows[revision]) throw new CrowboError("Feedback supporting revision is unavailable");
        const parsed = sourceRevision.parse(rows[revision]);
        if (logicalId(parsed) !== source || revisionId(parsed) !== revision) {
          throw new CrowboError("Feedback supporting revision failed its integrity check");
        }
        sources.push(parsed);
      }
    }
    sources.push(...parent.evidence.map((entry: any) => sourceRevision.parse(entry.source)));
    const heads = await this.evidence.authorizeHistoryMany(sources);
    let current: boolean = parent.evidence_unchanged;
    sources.forEach((source, i) => {
      if (heads[i].withdrawn) throw new CrowboError("A feedback contributing source has been withdrawn");
      current &&= !heads[i].conflicted && heads[i].revision_id === revisionId(source);
    });
    const result: Record<string, any> = { ...body, source_ids: [...contributors].sort(), selected_choice: selected, evidence_unchanged: current };
    return { parent, result };
  }

  async record(input: FeedbackRequest) {
    const request = feedbackRequest.parse(input);
    if (!this.evidence.settings.query_processors.includes("turbopuffer")) throw new CrowboError("Feedback storage route is not permitted");
    const body = {
      kind: "decision_feedback",
      tenant: this.evidence.settings.tenant,
      reader: this.evidence.settings.reader,
      request,
      simulated: true,
      attribution: "startup-bound operator assertion; human identity is not verified",
      authority_verified: false,
      outcome_verified: false,
    };
    const id = digest(["decision_feedback", body]);
    const existing = await this.evidence.store.get(id);
    if (existing) {
      if (!sameValue(existing, body)) throw new CrowboError("Feedback replay differs from its stored record");
      return this.inspect(id);
    }
    await this.resolve(body);
    try {
      await this.evidence.store.put(id, "decision_feedback", body, { insertOnly: true });
    } catch (error) {
      if (!(error instanceof CrowboError) || !sameValue(await this.evidence.store.get(id), body)) throw error;
    }
    return this.inspect(id);
  }

  async inspect(id: string): Promise<Record<string, any>> {
    const body = await this.evidence.store.get(id);
    if (
      !body ||
      body.kind !== "decision_feedback" ||
      body.tenant !== this.evidence.settings.tenant ||
      body.reader !== this.evidence.settings.reader ||
      digest(["decision_feedback", body]) !== id
    ) {
      throw new CrowboError("Feedback is unavailable");
    }
    const { result } = await this.resolve(body);
    return { id, ...result };
  }

  async forReassessment(id: string, request: { case_id: string; case_version: string; source_ids: readonly string[] }) {
    const feedback = await this.inspect(id);
    const parent = await new Review(this.evidence, null).inspect(feedback.request.result_id);
    const prior = parent.decision.request;
    if (prior.case_id !== request.case_id || prior.case_version === request.case_version) {
      throw new CrowboError("Reassessment requires the same case and a different version");
    }
    if (!feedback.source_ids.every((source: string) => request.source_ids.includes(source))) {
      throw new CrowboError("Reassessment must retain every prior and feedback contributor");
    }
    const historical = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/\[E(\d+)\]/g, "[P$1]"));
    const priorAnswer = historical(parent.answer);
    priorAnswer.evidence_ids = parent.answer.evidence_ids.map((label: string) => "P" + label.slice(1));
    const { selected_choice, ...rest } = feedback;
    return {
      feedback: rest,
      prior_result_id: parent.id,
      prior_answer: priorAnswer,
      prior_selected_choice: historical(selected_choice),
      prior_bindings: Object.fromEntries(
        parent.request.source_ids.map((source: string, i: number) => [
          `P${i + 1}`,
          { source_id: source, revision_id: revisionId(sourceRevision.parse(parent.evidence[i].source)) },
        ]),
      ),
      interpretation:
        "Reported feedback and historical advice, not authority or verified outcomes. " +
        "P labels refer only to historical revisions; reassess using current E evidence.",
    };
  }
}
