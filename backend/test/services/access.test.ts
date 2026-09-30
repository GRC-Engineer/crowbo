// Port of tests/test_access.py. Synthetic contract and provider-boundary checks, not qualified security judgments.
import { describe, expect, it, vi } from "vitest";
import { type AccessSubject, accessFacts, accessQuestions, contextAssessmentId } from "../../src/domain/access";
import { digest } from "../../src/domain/canonical";
import { type Assessment, assessment, logicalId, revisionId, type SourceInput, type SourceRevision } from "../../src/domain/contracts";
import { type DecisionRequest, decisionRequest } from "../../src/domain/decision-request";
import { CrowboError } from "../../src/domain/errors";
import { QuestionSet } from "../../src/domain/questions";
import { settings as settingsSchema } from "../../src/domain/settings";
import type { AssessorFactory } from "../../src/services/access-assessment";
import { Decision } from "../../src/services/decision";
import { type Evidence, headId } from "../../src/services/evidence";
import type { Assessor } from "../../src/services/ports";
import { batch, clone, makeEngine, makeItem, type MemoryStore, now, withGrant, withSource } from "../helpers";
import { type Call, chatResponse, configured, modelFor, mutate } from "./decision-fixtures";

// Python monkeypatched `crowbo.decision.access_questions`; TS has no seam, so the module is
// wrapped and the override is only set after the decision under test has been saved.
const override = vi.hoisted(() => ({ accessQuestions: null as null | ((subject: any) => any) }));
vi.mock("../../src/domain/access", async (original) => {
  const actual = await original<typeof import("../../src/domain/access")>();
  return {
    ...actual,
    accessQuestions: (subject: AccessSubject) => (override.accessQuestions ?? actual.accessQuestions)(subject),
  };
});

const SUBJECT: AccessSubject = { system: "ReportingDB", account_id: "svc-reports@example.test", scope: "org-demo/project-A" };
const IDENTITY = "Account svc-reports@example.test belongs to ReportingDB org-demo/project-A.";
const WORK = "This account must export the daily report.";
const CURRENT = "Its current Administrator role completes the daily export.";
const PASSED = "The project-scoped Reader role passed all required export tasks.";
const TEXT = `${IDENTITY} ${WORK} ${CURRENT} ${PASSED} Custodian: owner@example.test. No deadline is assigned.`;

const stated = (value: string, quote: string) => ({ state: "stated", value, citations: [{ evidence_id: "E1", quote }] });

function accessAnswer(): Record<string, any> {
  return {
    recommendation: "Recommend Reader after separate owner approval and a reversible cutover.",
    rationale: "The narrower role passed the required export [E1].",
    alternatives: ["Retain Administrator while approval is pending."],
    uncertainties: ["No approver or deadline is established."],
    evidence_ids: ["E1"],
    access_facts: {
      subject: { ...SUBJECT },
      identity: stated("Exact account and scope are stated", IDENTITY),
      required_work: stated("Daily report export", WORK),
      current_access: stated("Administrator", CURRENT),
      custodian: {
        identifier: "owner@example.test",
        citation: { evidence_id: "E1", quote: "Custodian: owner@example.test." },
      },
      approval_authority: null,
      deadline: null,
      options: [
        {
          kind: "retain",
          description: "Keep Administrator",
          workflow_fit: "supported",
          basis: stated("Current role works", CURRENT),
          exposure_change: "No reduction",
          operational_cost: "No migration",
          conditions: ["Separate approval"],
          reverses_when: "A narrower option is verified",
        },
        {
          kind: "reduce",
          description: "Use project Reader",
          workflow_fit: "supported",
          basis: stated("All required tasks passed", PASSED),
          exposure_change: "Less write access",
          operational_cost: "One reversible role change",
          conditions: ["Separate approval"],
          reverses_when: "Required work needs writes",
        },
      ],
      selected_option: "reduce",
    },
  };
}

async function setupAccess(engine: Evidence, item: SourceInput, method = "crowbo_without_jev"): Promise<[SourceInput, DecisionRequest]> {
  const [bound, request] = await configured(engine, withSource(item, { text: TEXT }));
  mutate(engine, { settings: settingsSchema.parse({ ...engine.settings, query_processors: [...engine.settings.query_processors, "jev"] }) });
  return [bound, decisionRequest.parse({ ...request, access: SUBJECT, method })];
}

const response = (answer?: Record<string, any>) => chatResponse(answer ?? accessAnswer());

/** The `fake_context_jev` fixture: a subject-scoped Jev factory that records each assessment. */
function fakeContextJev() {
  const calls: [string, string][] = [];
  const factory: AssessorFactory = (questions: QuestionSet): Assessor => ({
    async assess(source: SourceRevision): Promise<Assessment> {
      calls.push([revisionId(source), questions.fingerprint]);
      const answers: Record<string, unknown> = {};
      for (const [key, question] of Object.entries(questions.questions)) {
        const choices = Object.keys(question.criteria as object);
        answers[key] = {
          type: "choice",
          choice: choices[0],
          confidence: 0.8,
          probabilities: Object.fromEntries(choices.map((c) => [c, c === choices[0] ? 1.0 : 0.0])),
        };
      }
      return assessment.parse({
        source_revision: revisionId(source),
        criteria_version: questions.version,
        criteria_hash: questions.fingerprint,
        returned_model: "jev-test",
        answers,
        questions: questions.questions,
        input_tokens: 1,
        output_tokens: 1,
        elapsed_seconds: 0.01,
        assessed_at: now(),
      });
    },
  });
  return { calls, factory };
}

const reviews = (store: MemoryStore) => [...store.rows.values()].filter((row) => row.kind === "review");

describe("access decisions", () => {
  it("py: tests/test_access.py::test_access_decision_binds_account_options_and_history", async () => {
    const { engine, store } = makeEngine();
    const [item, request] = await setupAccess(engine, makeItem());
    const model = modelFor(engine, () => response());
    const result = await new Decision(engine, model).run(request);
    const facts = result.decision.access_facts;
    expect(facts.subject).toEqual(SUBJECT);
    expect(facts.selected_option).toBe("reduce");
    expect(facts.deadline).toBeNull();
    expect(facts.approval_authority).toBeNull();
    expect(facts.authority_verified).toBe(false);
    const citation = facts.options[1].basis.citations[0];
    expect(citation.revision_id).toBe(revisionId(item.source));
    expect(TEXT.slice(citation.start, citation.end)).toBe(PASSED);
    const historical = await new Decision(engine, null).inspect(result.id);
    expect(historical.decision.access_facts).toEqual(facts);
    expect(historical.decision_ready).toBe(true);
    store.rows.get(headId(logicalId(item.source)))!.grant.revoked = true;
    await expect(new Decision(engine, null).inspect(result.id)).rejects.toThrow(/permission/);
  });

  // py: tests/test_access.py::test_invalid_access_state_is_rejected[failed_option]
  // py: tests/test_access.py::test_invalid_access_state_is_rejected[missing_option]
  // py: tests/test_access.py::test_invalid_access_state_is_rejected[fake_identity]
  // py: tests/test_access.py::test_invalid_access_state_is_rejected[absent_identity]
  // py: tests/test_access.py::test_invalid_access_state_is_rejected[absent_deadline]
  // py: tests/test_access.py::test_invalid_access_state_is_rejected[absent_owner]
  it.each(["failed_option", "missing_option", "fake_identity", "absent_identity", "absent_deadline", "absent_owner"])(
    "test_invalid_access_state_is_rejected[%s]",
    (failure) => {
      const facts = accessAnswer().access_facts;
      if (failure === "failed_option") facts.options[1].workflow_fit = "fails";
      else if (failure === "missing_option") facts.selected_option = "remove";
      else if (failure === "fake_identity") facts.subject.account_id = "a-different-account";
      else if (failure === "absent_identity") facts.identity = { state: "unknown" };
      else if (failure === "absent_deadline") {
        facts.deadline = {
          date: "No deadline is assigned",
          citation: { evidence_id: "E1", quote: "No deadline is assigned." },
        };
      } else facts.custodian.identifier = "unknown";
      expect(() => accessFacts.parse(facts)).toThrow();
    },
  );

  it("py: tests/test_access.py::test_investigation_requires_a_deciding_question", () => {
    const facts = accessAnswer().access_facts;
    Object.assign(facts.options[1], { kind: "investigate", workflow_fit: "unknown", basis: { state: "unknown" } });
    facts.selected_option = "investigate";
    expect(() => accessFacts.parse(facts)).toThrow(/deciding check/);
    facts.next_check = { question: "Does recovery require writes?", changes_choice_if: "If yes Reader fails" };
    const value = accessFacts.parse(facts);
    expect(value.next_check!.question).toBe("Does recovery require writes?");
  });

  // py: tests/test_access.py::test_access_provider_cannot_change_subject_or_invent_quotes[changed_subject]
  // py: tests/test_access.py::test_access_provider_cannot_change_subject_or_invent_quotes[fabricated_quote]
  it.each(["changed_subject", "fabricated_quote"])("test_access_provider_cannot_change_subject_or_invent_quotes[%s]", async (failure) => {
    const { engine, store } = makeEngine();
    const [, request] = await setupAccess(engine, makeItem());
    const answer = accessAnswer();
    if (failure === "changed_subject") answer.access_facts.subject.scope = "another-organization";
    else answer.access_facts.options[1].basis.citations[0].quote = "Invented successful recovery test";
    const model = modelFor(engine, () => response(answer));
    await expect(new Decision(engine, model).run(request)).rejects.toThrow(CrowboError);
    expect(reviews(store)).toHaveLength(0);
  });

  it("py: tests/test_access.py::test_three_methods_share_schema_sources_and_guided_prompt", async () => {
    const { engine } = makeEngine();
    const jev = fakeContextJev();
    const [item, request] = await setupAccess(engine, makeItem());
    const payloads: Record<string, any> = {};
    const results: Record<string, any> = {};
    for (const method of ["plain", "crowbo_without_jev", "crowbo"]) {
      const model = modelFor(engine, (call: Call) => {
        payloads[method] = JSON.parse(call.content);
        return response();
      });
      results[method] = await new Decision(engine, model, jev.factory).run(decisionRequest.parse({ ...request, method }));
    }
    const all = Object.values(results);
    expect(new Set(all.map((r) => r.request.answer_format))).toEqual(new Set(["access"]));
    expect(new Set(all.map((r) => r.answer.access_facts.selected_option))).toEqual(new Set(["reduce"]));
    expect(results.crowbo.prompt_hash).toBe(results.crowbo_without_jev.prompt_hash);
    expect(results.plain.prompt_hash).not.toBe(results.crowbo.prompt_hash);
    const bodies = Object.fromEntries(Object.entries(payloads).map(([method, p]) => [method, JSON.parse(p.messages[1].content)]));
    const contextual = bodies.crowbo.decision.access_assessments;
    delete bodies.crowbo.decision.access_assessments;
    expect(contextual.subject).toEqual(SUBJECT);
    expect(contextual.records[0].source_revision).toBe(revisionId(item.source));
    expect(bodies.plain).toEqual(bodies.crowbo_without_jev);
    expect(bodies.crowbo_without_jev).toEqual(bodies.crowbo);
    expect(new Set(all.map((r) => r.provider.common_payload_hash)).size).toBe(1);
    for (const [method, payload] of Object.entries(payloads)) {
      expect(results[method].provider.user_message_hash).toBe(digest(payload.messages[1].content));
    }
    expect(Object.values(bodies).every((b) => !("assessment" in b.selected_evidence[0]))).toBe(true);
    expect(jev.calls).toHaveLength(1);
  });

  it("py: tests/test_access.py::test_context_cache_reuses_subject_and_keeps_ingestion_head", async () => {
    const { engine, store } = makeEngine();
    const jev = fakeContextJev();
    const [item, request] = await setupAccess(engine, makeItem(), "crowbo");
    const before = clone(store.rows.get(headId(logicalId(item.source))));
    const model = modelFor(engine, () => response());
    const one = await new Decision(engine, model, jev.factory).run(request);
    const two = await new Decision(engine, model, jev.factory).run(request);
    expect(two.decision.access_assessments).toEqual(one.decision.access_assessments);
    expect(jev.calls).toHaveLength(1);
    expect(store.rows.get(headId(logicalId(item.source)))).toEqual(before);
    const changed = { ...SUBJECT, scope: "org-demo/project-B" };
    expect(accessQuestions(changed).fingerprint).not.toBe(accessQuestions(SUBJECT).fingerprint);
    const changedItem = withGrant(item, { processors: ["turbopuffer", "voyage", "@cf/zai-org/glm-5.3-flash"], checked_at: now() });
    await engine.ingest(batch(changedItem));
    await expect(new Decision(engine, model, jev.factory).run(request)).rejects.toThrow(/permission/);
  });

  it("py: tests/test_access.py::test_plain_access_does_not_require_ingestion_jev", async () => {
    const { engine, store } = makeEngine();
    const [item, request] = await setupAccess(engine, makeItem(), "plain");
    store.rows.get(headId(logicalId(item.source)))!.assessment_id = null;
    const model = modelFor(engine, () => response());
    const result = await new Decision(engine, model).run(request);
    expect(result.answer.access_facts.selected_option).toBe("reduce");
    expect(result.evidence[0].assessment).toBeNull();
  });

  it("py: tests/test_access.py::test_changed_context_criteria_preserves_history_but_requires_reassessment", async () => {
    const { engine } = makeEngine();
    const jev = fakeContextJev();
    const [, request] = await setupAccess(engine, makeItem(), "crowbo");
    const model = modelFor(engine, () => response());
    try {
      const saved = await new Decision(engine, model, jev.factory).run(request);
      expect((await new Decision(engine, null).inspect(saved.id)).decision_ready).toBe(true);
      const current = accessQuestions(SUBJECT);
      const changed = new QuestionSet({ version: "access-context-v2", questions: current.questions });
      override.accessQuestions = () => changed;
      const historical = await new Decision(engine, null).inspect(saved.id);
      expect(historical.answer).toEqual(saved.answer);
      expect(historical.decision_ready).toBe(false);
      expect(historical.readiness_issue).toContain("criteria changed");
    } finally {
      override.accessQuestions = null;
    }
  });

  it("py: tests/test_access.py::test_context_cache_rejects_wrong_revision", async () => {
    const { engine, store } = makeEngine();
    const jev = fakeContextJev();
    const [, request] = await setupAccess(engine, makeItem(), "crowbo");
    const model = modelFor(engine, () => response());
    const good = await new Decision(engine, model, jev.factory).run(request);
    const key = good.decision.access_assessments.records[0].assessment_id;
    const row = store.rows.get(key)!;
    row.assessment.source_revision = "f".repeat(64);
    row.assessment_hash = digest(row.assessment);
    await expect(new Decision(engine, model, jev.factory).run(request)).rejects.toThrow(/revision mismatch/);
    expect(jev.calls).toHaveLength(1);
    expect((await new Decision(engine, null).inspect(good.id)).answer.access_facts.selected_option).toBe("reduce");
  });

  it("py: tests/test_access.py::test_permission_change_during_jev_cannot_publish_cache_or_answer", async () => {
    const { engine, store } = makeEngine();
    const jev = fakeContextJev();
    const [item, request] = await setupAccess(engine, makeItem(), "crowbo");
    // Python patched `Jev.assess`; the injected factory wraps the fake assessor instead.
    const revoking: AssessorFactory = (questions) => {
      const inner = jev.factory(questions);
      return {
        async assess(source) {
          const result = await inner.assess(source);
          store.rows.get(headId(logicalId(source)))!.grant.revoked = true;
          return result;
        },
      };
    };
    const model = modelFor(engine, () => response());
    await expect(new Decision(engine, model, revoking).run(request)).rejects.toThrow(/permission/);
    const key = contextAssessmentId(revisionId(item.source), accessQuestions(SUBJECT));
    expect(store.rows.has(key)).toBe(false);
    expect(jev.calls).toHaveLength(1);
    expect(reviews(store)).toHaveLength(0);
  });

  it("py: tests/test_access.py::test_context_cache_rejects_changed_answer_and_separates_subjects", async () => {
    const { engine, store } = makeEngine();
    const jev = fakeContextJev();
    const [, request] = await setupAccess(engine, makeItem(), "crowbo");
    const model = modelFor(engine, () => response());
    const one = await new Decision(engine, model, jev.factory).run(request);
    const key = one.decision.access_assessments.records[0].assessment_id;
    store.rows.get(key)!.assessment.answers.subject_match.confidence = 0.4;
    await expect(new Decision(engine, model, jev.factory).run(request)).rejects.toThrow(/checksum/);
    const changed = { ...SUBJECT, scope: "org-demo/project-B" };
    const changedAnswer = accessAnswer();
    const facts = changedAnswer.access_facts;
    facts.subject = { ...changed };
    facts.identity = { state: "unknown" };
    Object.assign(facts.options[1], { kind: "investigate", workflow_fit: "unknown", basis: { state: "unknown" } });
    facts.selected_option = "investigate";
    facts.next_check = {
      question: "Does this account belong to project-B?",
      changes_choice_if: "If not, find evidence for the requested scope before a role choice.",
    };
    changedAnswer.recommendation = "Investigate the requested account scope before any change.";
    const secondModel = modelFor(engine, () => response(changedAnswer));
    const two = await new Decision(engine, secondModel, jev.factory).run(decisionRequest.parse({ ...request, access: changed }));
    expect(two.decision.access_assessments.records[0].assessment_id).not.toBe(key);
    expect(jev.calls).toHaveLength(2);
  });

  const diagnostics: [string, Record<string, unknown>][] = [
    ["unknown_fact", { path: ["access_facts", "required_work"], constraint: "unknown_fact_has_assertion" }],
    ["private_field", { path: ["access_facts", "unknown_field"], constraint: "schema" }],
    ["missing_selected_option", { path: ["access_facts"], constraint: "selected_option_missing" }],
  ];
  // py: tests/test_access.py::test_access_failure_diagnostics_only_include_schema_names[unknown_fact]
  // py: tests/test_access.py::test_access_failure_diagnostics_only_include_schema_names[private_field]
  // py: tests/test_access.py::test_access_failure_diagnostics_only_include_schema_names[missing_selected_option]
  it.each(diagnostics)("test_access_failure_diagnostics_only_include_schema_names[%s]", async (failure, expected) => {
    const { engine } = makeEngine();
    const [, request] = await setupAccess(engine, makeItem());
    const answer = accessAnswer();
    if (failure === "unknown_fact") answer.access_facts.required_work = { state: "unknown", value: "private-secret-value" };
    else if (failure === "private_field") answer.access_facts["private-secret-field"] = "private-secret-value";
    else answer.access_facts.selected_option = "investigate";
    const model = modelFor(engine, () => response(answer));
    await expect(new Decision(engine, model).run(request)).rejects.toThrow(/schema validation/);
    const receipt = model.ledger.calls[0].receipt as Record<string, any>;
    expect(receipt.validation.details).toEqual([expected]);
    expect(JSON.stringify(receipt)).not.toContain("private-secret");
  });
});
