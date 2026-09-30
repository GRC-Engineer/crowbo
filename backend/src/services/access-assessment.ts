import { type AccessSubject, ASSESSOR_CONTRACT, accessQuestions, contextAssessmentId } from "../domain/access";
import { digest } from "../domain/canonical";
import { type Assessment, assessment as assessmentSchema, type EvidenceView, revisionId } from "../domain/contracts";
import { CrowboError } from "../domain/errors";
import type { QuestionSet } from "../domain/questions";
import type { Evidence } from "./evidence";
import type { Assessor } from "./ports";

export type AssessorFactory = (questions: QuestionSet) => Assessor;

/** Subject-bound Jev assessments, cached per (revision, subject questions, provider contract). */
export async function assessAccess(
  evidence: Evidence,
  views: EvidenceView[],
  subject: AccessSubject,
  makeAssessor: AssessorFactory,
  checkSnapshot: () => Promise<void>,
) {
  if (!evidence.settings.query_processors.includes("jev")) throw new CrowboError("Contextual Jev processing route is not permitted");
  const questions = accessQuestions(subject);
  const keys = views.map((v) => contextAssessmentId(revisionId(v.source), questions));
  await checkSnapshot();
  await evidence.checkProcessingMany(views, "jev");
  const cached = await evidence.store.getMany(keys);
  let jev: Assessor | null = null;
  const records = [];
  for (const [index, view] of views.entries()) {
    const key = keys[index];
    await checkSnapshot();
    await evidence.checkProcessingMany([view], "jev");
    const raw = cached[key];
    let assessed: Assessment;
    if (!raw) {
      jev ??= makeAssessor(questions);
      assessed = await jev.assess(view.source);
    } else {
      if (raw.provider_contract !== ASSESSOR_CONTRACT || raw.assessment_hash !== digest(raw.assessment)) {
        throw new CrowboError("Contextual assessment cache checksum or provider contract mismatch");
      }
      assessed = assessmentSchema.parse(raw.assessment);
    }
    questions.check(assessed);
    if (assessed.source_revision !== revisionId(view.source)) throw new CrowboError("Contextual assessment source revision mismatch");
    await checkSnapshot();
    await evidence.checkProcessingMany([view], "jev");
    if (!raw) {
      await evidence.store.put(
        key,
        "access_assessment",
        { assessment: assessed, assessment_hash: digest(assessed), provider_contract: ASSESSOR_CONTRACT },
        { insertOnly: true },
      );
    }
    records.push({
      evidence_id: `E${index + 1}`,
      assessment_id: key,
      source_revision: assessed.source_revision,
      answers: assessed.answers,
      returned_model: assessed.returned_model,
      assessed_at: assessed.assessed_at,
      input_tokens: assessed.input_tokens,
      output_tokens: assessed.output_tokens,
      elapsed_seconds: assessed.elapsed_seconds,
    });
  }
  return {
    subject,
    criteria_version: questions.version,
    criteria_hash: questions.fingerprint,
    provider_contract: ASSESSOR_CONTRACT,
    questions: questions.questions,
    records,
  };
}
