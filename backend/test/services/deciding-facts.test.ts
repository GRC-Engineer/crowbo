// Port of tests/test_deciding_facts.py. Fictional evidence; origin checks do not qualify the
// model's semantic judgment. Helpers mirror tests/test_decision.py (configured, fact_payload,
// reply, model_for) with an injected fetch and a MemoryLedger in place of Runtime's SQLite calls.
import { describe, expect, it } from "vitest";
import { logicalId, revisionId, type SourceInput } from "../../src/domain/contracts";
import { CrowboError } from "../../src/domain/errors";
import { type DecisionRequest, decisionRequest } from "../../src/domain/decision-request";
import { bindDecidingFacts, decidingFacts, fact } from "../../src/domain/facts";
import { type Settings, settings as settingsSchema } from "../../src/domain/settings";
import { localDate } from "../../src/domain/time";
import type { FetchLike } from "../../src/providers/http";
import { Decision } from "../../src/services/decision";
import type { Evidence } from "../../src/services/evidence";
import { Reasoner } from "../../src/services/review";
import { addMicros, batch, DAY, makeEngine, makeItem, MemoryLedger, now, withGrant } from "../helpers";

const MODEL = "@cf/zai-org/glm-5.3-flash";

type Call = { url: string; body: any };
type Handler = (call: Call) => Response | Promise<Response>;

function setSettings(engine: Evidence, update: Partial<Record<keyof Settings, unknown>>) {
  (engine as { settings: Settings }).settings = settingsSchema.parse({ ...engine.settings, ...update });
}

async function configured(engine: Evidence, item: SourceInput): Promise<[SourceInput, DecisionRequest]> {
  setSettings(engine, { query_processors: ["turbopuffer", "voyage", MODEL] });
  item = withGrant(item, { processors: [...item.grant.processors, MODEL] });
  await engine.ingest(batch(item));
  const id = logicalId(item.source);
  const request = decisionRequest.parse({
    case_id: "synthetic-review",
    question: "Which action should the owner take next?",
    source_ids: [id],
    expected_revisions: { [id]: revisionId(item.source) },
    subject: "Synthetic security programme",
    scope: "Fictional access review",
    window_start: localDate(now()),
    window_end: localDate(addMicros(now(), 14n * DAY)),
    objectives: ["Meet confirmed obligations, then reduce supported exposure"],
  });
  return [item, request];
}

function factPayload(): Record<string, any> {
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

function replyData({ structured = true } = {}): Record<string, any> {
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
            ...(structured ? { deciding_facts: factPayload() } : {}),
          }),
        },
      },
    ],
  };
}

const reply = (options?: { structured?: boolean }) => new Response(JSON.stringify(replyData(options)), { status: 200 });

function modelFor(engine: Evidence, handler: Handler) {
  const ledger = new MemoryLedger();
  const fetch: FetchLike = async (url, init) => handler({ url, body: JSON.parse(String(init?.body)) });
  const model = new Reasoner(
    { account: engine.settings.cloudflare_account, gateway: engine.settings.gateway, token: "test-token", fetch },
    ledger,
    engine.settings.query_processors,
  );
  return { model, ledger };
}

function setup() {
  return { ...makeEngine(), item: makeItem() };
}

describe("deciding facts", () => {
  // py: tests/test_deciding_facts.py::test_bound_facts_resolve_actual_jev_value_and_exact_revision
  it("bound facts resolve actual Jev value and exact revision", async () => {
    const { engine, item: initial } = setup();
    const [item, request] = await configured(engine, initial);
    const { model } = modelFor(engine, () => reply());
    const result = await new Decision(engine, model).run(request);
    const facts = result.decision.deciding_facts;
    const card = facts.deliverables[0];
    expect(card.anchor.revision_id).toBe(revisionId(item.source));
    // Python slices by code point; the fixture text is ASCII so UTF-16 slicing is identical.
    expect([...item.source.text].slice(card.anchor.start, card.anchor.end).join("")).toBe(card.anchor.quote);
    expect(card.facts.capacity).toEqual({ state: "unknown", value: null, citations: [] });
    expect(card.unresolved_commitment_fields).toContain("deadline");
    expect(card.authority_verified).toBe(false);
    expect(facts.jev[0].answer.noul).toBe(0.01);
    expect(facts.jev[0].source_id).toBe(logicalId(item.source));
    const history: Record<string, any> = await new Decision(engine, null).inspect(result.id);
    expect(history.decision.deciding_facts).toEqual(facts);
  });

  // py: tests/test_deciding_facts.py::test_invalid_model_bindings_are_not_saved[quote]
  // py: tests/test_deciding_facts.py::test_invalid_model_bindings_are_not_saved[wrong_source]
  // py: tests/test_deciding_facts.py::test_invalid_model_bindings_are_not_saved[question]
  // py: tests/test_deciding_facts.py::test_invalid_model_bindings_are_not_saved[number]
  it.each(["quote", "wrong_source", "question", "number"])("invalid model bindings are not saved (%s)", async (failure) => {
    const { engine, store, item } = setup();
    const [, request] = await configured(engine, item);
    const { model, ledger } = modelFor(engine, () => {
      const data = replyData();
      const answer = JSON.parse(data.choices[0].message.content);
      const facts = answer.deciding_facts;
      if (failure === "quote") facts.deliverables[0].anchor.quote = "A fabricated delivery deadline";
      else if (failure === "wrong_source") facts.deliverables[0].anchor.evidence_id = "E2";
      else if (failure === "question") facts.jev_references[0].question_id = "invented";
      else facts.jev_references[0].score = 0.95;
      data.choices[0].message.content = JSON.stringify(answer);
      return new Response(JSON.stringify(data), { status: 200 });
    });
    await expect(new Decision(engine, model).run(request)).rejects.toThrow(CrowboError);
    expect([...store.rows.values()].some((row) => row.kind === "review")).toBe(false);
    expect(ledger.calls).toHaveLength(1);
  });

  // py: tests/test_deciding_facts.py::test_unknown_facts_cannot_assert_values_and_conflicts_need_distinct_spans
  it("unknown facts cannot assert values and conflicts need distinct spans", () => {
    expect(() => fact.parse({ state: "unknown", value: "Two people are available" })).toThrow();
    const quote = { evidence_id: "E1", quote: "A fictional deadline" };
    expect(() => fact.parse({ state: "conflicting", value: "Two deadlines", citations: [quote, quote] })).toThrow();
  });

  // py: tests/test_deciding_facts.py::test_source_binding_does_not_certify_interpretation
  it("source binding does not certify interpretation", async () => {
    const { engine, item: initial } = setup();
    const [item] = await configured(engine, initial);
    const raw = factPayload();
    raw.deliverables[0].deadline = {
      state: "stated",
      value: "An incorrect model interpretation",
      citations: [raw.deliverables[0].anchor],
    };
    const view = await engine.inspect(logicalId(item.source));
    const facts = bindDecidingFacts(decidingFacts.parse(raw), [{ id: "E1", ...view }], ["E1"]);
    expect(facts.deliverables[0].authority_verified).toBe(false);
    expect(facts.interpretation).toContain("model interpretations");
  });

  // py: tests/test_deciding_facts.py::test_plain_comparison_keeps_identical_text_but_omits_jev_and_fact_prompt
  it("plain comparison keeps identical text but omits Jev and fact prompt", async () => {
    const { engine, item: initial } = setup();
    const [item, crowbo] = await configured(engine, initial);
    const request = decisionRequest.parse({ ...crowbo, method: "plain" });
    const calls: Call[] = [];
    const { model } = modelFor(engine, (call) => (calls.push(call), reply({ structured: false })));
    const result = await new Decision(engine, model).run(request);
    expect(calls).toHaveLength(1);
    const envelope = calls[0].body;
    const body = JSON.parse(envelope.messages[1].content);
    expect(body.selected_evidence[0].source.text).toBe(item.source.text);
    expect("assessment" in body.selected_evidence[0]).toBe(false);
    expect(envelope.messages[0].content).not.toContain("deciding_facts");
    expect("deciding_facts" in result.decision).toBe(false);
    expect(result.evidence[0].assessment).toEqual(expect.any(Object));
  });
});
