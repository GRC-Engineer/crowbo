// Port of tests/test_feedback.py. Synthetic feedback/reassessment behaviour, not qualified
// security judgment.
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { logicalId, revisionId, type SourceInput, sourceInput } from "../../src/domain/contracts";
import { type DecisionRequest, decisionRequest } from "../../src/domain/decision-request";
import { CrowboError } from "../../src/domain/errors";
import { localDate } from "../../src/domain/time";
import { Decision } from "../../src/services/decision";
import { type Evidence, headId } from "../../src/services/evidence";
import { Feedback, feedbackRequest } from "../../src/services/feedback";
import { Reasoner, Review } from "../../src/services/review";
import {
  addMicros,
  batch,
  DAY,
  makeEngine,
  makeItem,
  makeSettings,
  MemoryLedger,
  type MemoryStore,
  now,
  withGrant,
  withSource,
} from "../helpers";

const MODEL = "@cf/zai-org/glm-5.3-flash";

type Call = { url: string; content: string };
type Handler = (call: Call) => Response;

/** tests/test_decision.py::configured — settings are fixed at construction in TS, so the engine is built here. */
async function configured() {
  const { engine, store, jev } = makeEngine(makeSettings({ query_processors: ["turbopuffer", "voyage", MODEL] }));
  const base = makeItem();
  const item = withGrant(base, { processors: [...base.grant.processors, MODEL] });
  await engine.ingest(batch(item));
  const request = decisionRequest.parse({
    case_id: "synthetic-review",
    question: "Which action should the owner take next?",
    source_ids: [logicalId(item.source)],
    expected_revisions: { [logicalId(item.source)]: revisionId(item.source) },
    subject: "Synthetic security programme",
    scope: "Fictional access review",
    window_start: localDate(now()),
    window_end: localDate(addMicros(now(), 14n * DAY)),
    objectives: ["Meet confirmed obligations, then reduce supported exposure"],
  });
  return { engine, store: engine.store as MemoryStore, jev, item, request };
}

function factPayload() {
  const unknown = { state: "unknown", value: null, citations: [] };
  return {
    deliverables: [
      {
        title: "Synthetic access review",
        anchor: { evidence_id: "E1", quote: "Owner requests an access review; no obligation is stated." },
        ...Object.fromEntries(
          ["obligation", "deadline", "owner", "completion", "consequence", "nondeferral", "capacity"].map((name) => [name, unknown]),
        ),
      },
    ],
    jev_references: [{ evidence_id: "E1", question_id: "obligation_stated" }],
  };
}

function replyBody(): Record<string, any> {
  return {
    model: "glm-5.3-flash",
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            recommendation: "Ask the accountable owner to confirm the obligation and capacity.",
            rationale: "The invented source requests work but establishes no obligation [E1].",
            alternatives: ["Proceed with separately confirmed urgent work."],
            uncertainties: ["Neither obligation nor capacity is confirmed."],
            evidence_ids: ["E1"],
            deciding_facts: factPayload(),
          }),
        },
      },
    ],
  };
}

const json200 = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const reply = () => json200(replyBody());

function modelFor(engine: Evidence, handler: Handler) {
  return new Reasoner(
    {
      account: engine.settings.cloudflare_account,
      gateway: engine.settings.gateway,
      token: "test-token",
      fetch: async (url, init) => handler({ url, content: String(init?.body ?? "") }),
    },
    new MemoryLedger(),
    engine.settings.query_processors,
  );
}

function makeFeedbackRequest(result: Record<string, any>, changes: Record<string, unknown> = {}) {
  return feedbackRequest.parse({
    result_id: result.id,
    reviewed_at: now(),
    choice: { kind: "alternative", alternative_index: 0 },
    rationale: "Synthetic reviewer chooses the independently confirmed urgent work.",
    corrections: [{ statement: "Capacity remains unknown.", basis: "Operator assertion" }],
    revisit_when: ["A confirmed delivery owner supplies an estimate."],
    ...changes,
  });
}

function nextRequest(request: DecisionRequest, feedback: Record<string, any>, changes: Record<string, unknown> = {}) {
  return decisionRequest.parse({ ...request, case_version: "2", prior_feedback_id: feedback.id, ...changes });
}

const lid = (item: SourceInput) => logicalId(item.source);
const rid = (item: SourceInput) => revisionId(item.source);

describe("feedback", () => {
  it("py: tests/test_feedback.py::test_feedback_is_retained_without_inference_and_replays_after_uncertain_write", async () => {
    const { engine, store, item, request: decision } = await configured();
    const parent = await new Decision(engine, modelFor(engine, () => reply())).run(decision);
    const app = new Feedback(engine);
    const request = makeFeedbackRequest(parent);
    const write = store.put.bind(store);
    store.put = async (...args: Parameters<MemoryStore["put"]>) => {
      await write(...args);
      throw new CrowboError("Synthetic lost storage response");
    };
    const result = await app.record(request);
    const writes = store.writes;
    expect(await app.record(request)).toEqual(result);
    expect(store.writes).toBe(writes);
    expect(result.selected_choice).toBe(parent.answer.alternatives[0]);
    expect(result.simulated && !result.authority_verified && !result.outcome_verified).toBe(true);
    expect(result.attribution).toContain("human identity is not verified");
    expect((await app.inspect(result.id)).request.corrections).toEqual(request.corrections);
    expect(await new Review(engine, null).inspect(parent.id)).toEqual(parent);
    store.rows.get(headId(lid(item)))!.grant.revoked = true;
    await expect(app.record(request)).rejects.toThrow(/permission/);
  });

  it("py: tests/test_feedback.py::test_feedback_does_not_swallow_failed_insert_or_return_after_revocation", async () => {
    const { engine, store, item, request: decision } = await configured();
    const parent = await new Decision(engine, modelFor(engine, () => reply())).run(decision);
    const app = new Feedback(engine);
    const request = makeFeedbackRequest(parent);
    const write = store.put.bind(store);
    store.put = async () => {
      throw new CrowboError("Synthetic storage failure");
    };
    await expect(app.record(request)).rejects.toThrow(/storage failure/);
    store.put = async (...args: Parameters<MemoryStore["put"]>) => {
      await write(...args);
      store.rows.get(headId(lid(item)))!.grant.revoked = true;
    };
    await expect(app.record(request)).rejects.toThrow(/permission/);
  });

  it("py: tests/test_feedback.py::test_changed_evidence_reassessment_retains_reported_outcome_and_old_citation_map", async () => {
    const { engine, store, item, request } = await configured();
    const other = withSource(item, { native_id: "restore-test" });
    await engine.ingest(batch(other));
    const requests: Record<string, any>[] = [];
    const respond: Handler = (call) => {
      requests.push(JSON.parse(JSON.parse(call.content).messages[1].content));
      const response = replyBody();
      const answer = JSON.parse(response.choices[0].message.content);
      answer.recommendation += " Device E1 is an ordinary asset name.";
      response.choices[0].message.content = JSON.stringify(answer);
      return json200(response);
    };
    const app = new Decision(engine, modelFor(engine, respond));
    const parent = await app.run(request);
    const changed = withSource(item, { text: "Synthetic repair completed; retest pending.", updated_at: now(), observed_at: now() });
    await engine.ingest(batch(changed));
    const feedback = await new Feedback(engine).record(
      makeFeedbackRequest(parent, {
        supporting_revisions: { [lid(other)]: rid(other) },
        outcome: {
          observed_on: localDate(now()),
          statement: "A rehearsal was reported.",
          basis: "Synthetic source assertion, not verified causality.",
          source_ids: [lid(other)],
        },
      }),
    );
    const newRequest = nextRequest(request, feedback, {
      source_ids: [lid(other), lid(item)],
      expected_revisions: { [lid(item)]: rid(changed), [lid(other)]: rid(other) },
    });
    const child = await app.run(newRequest);
    const packet = requests.at(-1)!.decision.reassessment;
    expect(packet.prior_bindings.P1).toEqual({ source_id: lid(item), revision_id: rid(item) });
    expect(requests.at(-1)!.selected_evidence[0].source_id).toBe(lid(other));
    expect(packet.prior_answer.rationale).toContain("[P1]");
    expect(packet.prior_answer.rationale).not.toContain("[E1]");
    expect(packet.prior_answer.recommendation).toContain("Device E1");
    expect(packet.prior_answer.evidence_ids).toEqual(["P1"]);
    expect(packet.feedback.outcome_verified).toBe(false);
    expect(child.decision.request.prior_feedback_id).toBe(feedback.id);
    expect(child.feasibility_checked).toBe(false);
    expect((await app.inspect(parent.id)).evidence_unchanged).toBe(false);
    expect((await store.get(parent.id))!.answer).toEqual(parent.answer);

    const childFeedback = await new Feedback(engine).record(makeFeedbackRequest(child));
    const get = store.get.bind(store);
    const ancestorReads: string[] = [];
    store.get = async (identifier: string) => {
      if ([parent.id, feedback.id].includes(identifier)) {
        ancestorReads.push(identifier);
        throw new Error("reassessment must not walk ancestors");
      }
      return get(identifier);
    };
    const grandchild = await app.run(nextRequest(newRequest, childFeedback, { case_version: "3" }));
    expect(ancestorReads).toEqual([]);
    expect(grandchild.decision.reassessment.prior_result_id).toBe(child.id);
    store.get = get;
    store.rows.get(headId(lid(item)))!.grant.revoked = true;
    for (const operation of [(id: string) => app.inspect(id), (id: string) => new Review(engine, null).inspect(id)]) {
      await expect(operation(grandchild.id)).rejects.toThrow(/permission/);
    }
    await expect(new Feedback(engine).inspect(childFeedback.id)).rejects.toThrow(/permission/);
  });

  const failures = [
    ["py: tests/test_feedback.py::test_reassessment_rejects_invalid_lineage_before_inference[omit_parent]", "omit_parent"],
    ["py: tests/test_feedback.py::test_reassessment_rejects_invalid_lineage_before_inference[omit_support]", "omit_support"],
    ["py: tests/test_feedback.py::test_reassessment_rejects_invalid_lineage_before_inference[glm_revoked]", "glm_revoked"],
    ["py: tests/test_feedback.py::test_reassessment_rejects_invalid_lineage_before_inference[reader_revoked]", "reader_revoked"],
    ["py: tests/test_feedback.py::test_reassessment_rejects_invalid_lineage_before_inference[withdrawn]", "withdrawn"],
    ["py: tests/test_feedback.py::test_reassessment_rejects_invalid_lineage_before_inference[other_case]", "other_case"],
    ["py: tests/test_feedback.py::test_reassessment_rejects_invalid_lineage_before_inference[same_version]", "same_version"],
  ] as const;
  it.each(failures)(
    "%s",
    async (_id, failure) => {
      const { engine, store, item, request } = await configured();
      const other = withSource(item, { native_id: "support" });
      await engine.ingest(batch(other));
      const calls: Call[] = [];
      const app = new Decision(
        engine,
        modelFor(engine, (call) => {
          calls.push(call);
          return reply();
        }),
      );
      const parent = await app.run(request);
      const feedback = await new Feedback(engine).record(makeFeedbackRequest(parent, { supporting_revisions: { [lid(other)]: rid(other) } }));
      const raw: Record<string, any> = {
        ...request,
        source_ids: [lid(other), lid(item)],
        expected_revisions: {},
        case_version: "2",
        prior_feedback_id: feedback.id,
      };
      if (failure === "omit_parent") raw.source_ids = [lid(other)];
      else if (failure === "omit_support") raw.source_ids = [lid(item)];
      else if (failure === "glm_revoked") {
        const head = store.rows.get(headId(lid(item)))!;
        head.grant.processors = head.grant.processors.filter((p: string) => p !== MODEL);
        // Re-import refreshes index access metadata; failure must be processing permission.
        await engine.ingest(batch(sourceInput.parse({ source: item.source, grant: head.grant })));
        expect(await new Review(engine, null).inspect(parent.id)).toBeTruthy();
      } else if (failure === "reader_revoked") store.rows.get(headId(lid(item)))!.grant.revoked = true;
      else if (failure === "withdrawn") store.rows.get(headId(lid(other)))!.withdrawn = true;
      else if (failure === "other_case") raw.case_id = "different-case";
      else raw.case_version = "1";
      const attempt = (async () => app.run(decisionRequest.parse(raw)))();
      const error = await attempt.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(CrowboError);
      if (failure === "glm_revoked") expect((error as Error).message).toContain("permission");
      expect(calls.length).toBe(1);
    },
  );

  it("py: tests/test_feedback.py::test_model_failure_preserves_feedback_and_historical_citations_are_rejected", async () => {
    const { engine, store, request } = await configured();
    const calls: Call[] = [];
    const respond: Handler = (call) => {
      calls.push(call);
      if (calls.length > 1) {
        const body = replyBody();
        const answer = JSON.parse(body.choices[0].message.content);
        answer.rationale += " The historical answer claimed this [P1].";
        body.choices[0].message.content = JSON.stringify(answer);
        return json200(body);
      }
      return reply();
    };
    const app = new Decision(engine, modelFor(engine, respond));
    const parent = await app.run(request);
    const feedback = await new Feedback(engine).record(makeFeedbackRequest(parent));
    await expect(app.run(nextRequest(request, feedback))).rejects.toThrow(/citations/);
    expect(await new Feedback(engine).inspect(feedback.id)).toEqual(feedback);
    expect([...store.rows.values()].filter((r) => r.kind === "review").length).toBe(1);
  });

  const bounds: (readonly [string, Record<string, unknown>])[] = [
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes0]", { reviewed_at: addMicros(now(), 2n * DAY) }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes1]", { reviewed_at: "2026-01-01T10:00:00" }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes2]", { choice: { kind: "alternative" } }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes3]", { choice: { kind: "custom", alternative_index: 0, custom: "fictional" } }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes4]", { choice: null, corrections: [] }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes5]", { authority_verified: true }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes6]", { rationale: "A correction quoting ambiguous old evidence [E1]." }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes7]", { choice: { kind: "custom", custom: "Follow older advice [P1]." } }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes8]", { corrections: [{ statement: "unsupported", basis: "no source", source_ids: ["a".repeat(64)] }] }],
    ["py: tests/test_feedback.py::test_feedback_bounds_and_attribution_cannot_be_bypassed[changes9]", { outcome: { statement: "future", basis: "fictional", observed_on: localDate(addMicros(now(), 2n * DAY)) } }],
  ];
  it.each(bounds)(
    "%s",
    (_id, changes) => {
      expect(() => makeFeedbackRequest({ id: "b".repeat(64) }, changes)).toThrow(ZodError);
    },
  );

  it("py: tests/test_feedback.py::test_invalid_option_or_supporting_revision_cannot_be_recorded", async () => {
    const { engine, store, item, request } = await configured();
    const parent = await new Decision(engine, modelFor(engine, () => reply())).run(request);
    for (const changes of [
      { choice: { kind: "alternative", alternative_index: 19 } },
      { supporting_revisions: { ["f".repeat(64)]: rid(item) } },
      { supporting_revisions: { [lid(item)]: "f".repeat(64) } },
    ]) {
      await expect(new Feedback(engine).record(makeFeedbackRequest(parent, changes))).rejects.toBeInstanceOf(CrowboError);
    }
    expect([...store.rows.values()].some((r) => r.kind === "decision_feedback")).toBe(false);
  });

  it("py: tests/test_feedback.py::test_feedback_cannot_expand_inherited_selection_beyond_fifteen_sources", async () => {
    const { engine, store, request } = await configured();
    const parent = await new Decision(engine, modelFor(engine, () => reply())).run(request);
    const support = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i.toString(16).padStart(64, "0"), "a".repeat(64)]));
    await expect(new Feedback(engine).record(makeFeedbackRequest(parent, { supporting_revisions: support }))).rejects.toThrow(/15-source/);
    expect([...store.rows.values()].some((r) => r.kind === "decision_feedback")).toBe(false);
  });
});
