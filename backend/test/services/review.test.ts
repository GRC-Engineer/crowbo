// Port of tests/test_review.py. Python's httpx MockTransport becomes an injected `fetch`, and the
// SQLite `calls` table becomes MemoryLedger.calls (reservations with their latest receipt).
import { describe, expect, it } from "vitest";
import { logicalId, type SourceInput } from "../../src/domain/contracts";
import { CrowboError } from "../../src/domain/errors";
import { type ReviewRequest, reviewRequest } from "../../src/domain/review";
import { type Settings, settings as settingsSchema } from "../../src/domain/settings";
import type { FetchLike } from "../../src/providers/http";
import type { Evidence } from "../../src/services/evidence";
import { Reasoner, Review } from "../../src/services/review";
import { addMicros, batch, makeEngine, makeItem, MemoryLedger, MINUTE, now, withGrant, withSource } from "../helpers";

const MODEL = "openai/gpt-6-luna";

type Call = { url: string; body: any; headers: Headers };
type Handler = (call: Call) => Response | Promise<Response>;

function setSettings(engine: Evidence, update: Partial<Record<keyof Settings, unknown>>) {
  (engine as { settings: Settings }).settings = settingsSchema.parse({ ...engine.settings, ...update });
}

function response(): Record<string, any> {
  return {
    model: "gpt-6-luna",
    usage: { prompt_tokens: 120, completion_tokens: 40 },
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            recommendation: "Confirm the obligation and available capacity before committing.",
            rationale: "The source requests a review but supplies no obligation [E1].",
            alternatives: ["Proceed with independently confirmed work."],
            uncertainties: ["Available hours are unknown."],
            evidence_ids: ["E1"],
          }),
        },
      },
    ],
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function configured(engine: Evidence, item: SourceInput): Promise<[SourceInput, ReviewRequest]> {
  setSettings(engine, { query_processors: ["turbopuffer", "voyage", MODEL] });
  item = withGrant(item, { processors: [...item.grant.processors, MODEL] });
  await engine.ingest(batch(item));
  return [
    item,
    reviewRequest.parse({
      question: "What should we do next?",
      source_ids: [logicalId(item.source)],
      model: MODEL,
      reasoning_effort: "high",
    }),
  ];
}

/** The reasoner captures the engine's settings at construction, like Python's Runtime. */
function reasoner(engine: Evidence, handler: Handler) {
  const ledger = new MemoryLedger();
  const fetch: FetchLike = async (url, init) =>
    handler({ url, body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
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

const reviews = (store: { rows: Map<string, Record<string, any>> }) => [...store.rows.values()].some((row) => row.kind === "review");
const lastReceipt = (ledger: MemoryLedger) => ledger.calls.at(-1)!.receipt as Record<string, any>;

describe("review", () => {
  // py: tests/test_review.py::test_unsupported_model_configuration_is_rejected_before_runtime[openai/gpt-6-luna-max]
  // py: tests/test_review.py::test_unsupported_model_configuration_is_rejected_before_runtime[@cf/zai-org/glm-5.3-flash-xhigh]
  // py: tests/test_review.py::test_unsupported_model_configuration_is_rejected_before_runtime[deepseek/v4.1-flash-high]
  it.each([
    [MODEL, "max"],
    ["@cf/zai-org/glm-5.3-flash", "xhigh"],
    ["deepseek/v4.1-flash", "high"],
  ])("unsupported model configuration is rejected before runtime (%s, %s)", (model, effort) => {
    expect(() =>
      reviewRequest.parse({ question: "A fictional question", source_ids: ["d".repeat(64)], model, reasoning_effort: effort }),
    ).toThrow();
  });

  // py: tests/test_review.py::test_review_uses_exact_evidence_preserves_jev_and_history_needs_no_model
  it("review uses exact evidence, preserves Jev, and history needs no model", async () => {
    const { engine, item: initial } = setup();
    const [item, request] = await configured(engine, initial);
    const calls: Call[] = [];
    const { model, ledger } = reasoner(engine, (call) => (calls.push(call), json(response())));
    const result = await new Review(engine, model).run(request);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url.endsWith("/ai/v1/chat/completions")).toBe(true);
    expect(call.body.model).toBe(MODEL);
    expect(call.body.reasoning_effort).toBe("high");
    expect(call.body.store).toBe(false);
    expect("tools" in call.body).toBe(false);
    expect(call.headers.get("cf-aig-collect-log-payload")).toBe("false");
    const facts = JSON.parse(call.body.messages[1].content).selected_evidence;
    expect(facts[0].source.text).toBe(item.source.text);
    expect(facts[0].assessment.answers.commitment_evidence.choice).toBe("insufficient");
    expect(facts[0].assessment.questions.obligation_stated.type).toBe("noul");

    expect(result.answer.recommendation).toBe("Confirm the obligation and available capacity before committing.");
    expect(result.evidence_unchanged).toBe(true);
    expect(result.feasibility_checked).toBe(false);
    expect(result.simulated).toBe(true);
    expect(await new Review(engine, null).inspect(result.id)).toEqual(result);
    expect(ledger.calls).toHaveLength(1);
  });

  // py: tests/test_review.py::test_reasoning_timeout_is_reported_and_recorded_without_saving_review
  it("reasoning timeout is reported and recorded without saving review", async () => {
    const { engine, store, item } = setup();
    const [, request] = await configured(engine, item);
    const { model, ledger } = reasoner(engine, () => {
      throw new DOMException("Provider detail must not be logged", "TimeoutError");
    });
    await expect(new Review(engine, model).run(request)).rejects.toThrow(/timed out/);
    expect(lastReceipt(ledger)).toEqual({ requested_model: MODEL, error: "timeout" });
    expect(reviews(store)).toBe(false);
  });

  // py: tests/test_review.py::test_review_denies_before_any_model_call[route]
  // py: tests/test_review.py::test_review_denies_before_any_model_call[storage]
  // py: tests/test_review.py::test_review_denies_before_any_model_call[source]
  // py: tests/test_review.py::test_review_denies_before_any_model_call[expired]
  it.each(["route", "storage", "source", "expired"])("review denies before any model call (%s)", async (denial) => {
    const { engine, store, item: initial } = setup();
    const [item, request] = await configured(engine, initial);
    if (denial === "route") setSettings(engine, { query_processors: [] });
    else if (denial === "storage") setSettings(engine, { query_processors: [MODEL] });
    else {
      const changes: Record<string, unknown> = { processors: ["turbopuffer", "jev", "voyage"], checked_at: now() };
      if (denial === "expired") {
        changes.checked_at = addMicros(now(), -2n * MINUTE);
        changes.expires_at = addMicros(now(), -MINUTE);
      }
      await engine.ingest(batch(withGrant(item, changes)));
    }
    let reached = false;
    const { model, ledger } = reasoner(engine, () => {
      reached = true;
      return json(response());
    });
    await expect(new Review(engine, model).run(request)).rejects.toThrow(/permi/);
    expect(reached).toBe(false);
    expect(ledger.calls).toHaveLength(0);
    expect(reviews(store)).toBe(false);
  });

  // py: tests/test_review.py::test_revocation_during_reasoning_prevents_return_and_storage
  it("revocation during reasoning prevents return and storage", async () => {
    const { engine, store, item: initial } = setup();
    const [item, request] = await configured(engine, initial);
    const { model } = reasoner(engine, async () => {
      await engine.ingest(batch(withGrant(item, { revoked: true, checked_at: now() })));
      return json(response());
    });
    await expect(new Review(engine, model).run(request)).rejects.toThrow(/permission/);
    expect(reviews(store)).toBe(false);
  });

  // py: tests/test_review.py::test_bad_recommendation_is_not_saved[invented_reference]
  // py: tests/test_review.py::test_bad_recommendation_is_not_saved[inline_reference]
  // py: tests/test_review.py::test_bad_recommendation_is_not_saved[truncated]
  // py: tests/test_review.py::test_bad_recommendation_is_not_saved[wrong_model]
  // py: tests/test_review.py::test_bad_recommendation_is_not_saved[invalid_json]
  it.each(["invented_reference", "inline_reference", "truncated", "wrong_model", "invalid_json"])(
    "bad recommendation is not saved (%s)",
    async (failure) => {
      const { engine, store, item } = setup();
      const [, request] = await configured(engine, item);
      const body = response();
      const message = body.choices[0].message;
      if (failure === "truncated") body.choices[0].finish_reason = "length";
      else if (failure === "wrong_model") body.model = "unrequested-model";
      else if (failure === "invalid_json") message.content = "not json";
      else {
        const answer = JSON.parse(message.content);
        if (failure === "invented_reference") answer.evidence_ids = ["E999"];
        else answer.rationale = "Unsupported conclusion [E999].";
        message.content = JSON.stringify(answer);
      }
      const { model } = reasoner(engine, () => json(body));
      await expect(new Review(engine, model).run(request)).rejects.toThrow(CrowboError);
      expect(reviews(store)).toBe(false);
    },
  );

  // py: tests/test_review.py::test_incomplete_response_preserves_token_receipt_without_saving_recommendation
  it("incomplete response preserves token receipt without saving recommendation", async () => {
    const { engine, store, item } = setup();
    const [, request] = await configured(engine, item);
    const body = response();
    body.choices[0].finish_reason = "length";
    body.usage = {
      prompt_tokens: 8120,
      completion_tokens: 4096,
      total_tokens: 12216,
      completion_tokens_details: { reasoning_tokens: 4096 },
    };
    const { model, ledger } = reasoner(engine, () => json(body));
    await expect(new Review(engine, model).run(request)).rejects.toThrow(/did not finish successfully \(length\)/);
    expect(lastReceipt(ledger)).toEqual({
      http_status: 200,
      requested_model: "openai/gpt-6-luna",
      returned_model: "gpt-6-luna",
      finish_reasons: ["length"],
      usage: {
        prompt_tokens: 8120,
        completion_tokens: 4096,
        total_tokens: 12216,
        completion_tokens_details: { reasoning_tokens: 4096 },
      },
    });
    expect(reviews(store)).toBe(false);
  });

  // Pydantic error types map to zod issue codes: extra_forbidden -> unrecognized_keys,
  // string_type -> invalid_type, json_invalid -> invalid_type (unparseable JSON validates as undefined).
  // py: tests/test_review.py::test_schema_failure_reports_categories_without_private_values[extra_field]
  // py: tests/test_review.py::test_schema_failure_reports_categories_without_private_values[wrong_type]
  // py: tests/test_review.py::test_schema_failure_reports_categories_without_private_values[invalid_json]
  it.each([
    ["extra_field", "unrecognized_keys"],
    ["wrong_type", "invalid_type"],
    ["invalid_json", "invalid_type"],
  ])("schema failure reports categories without private values (%s)", async (failure, category) => {
    const { engine, store, item } = setup();
    const [, request] = await configured(engine, item);
    const body = response();
    const message = body.choices[0].message;
    const answer = JSON.parse(message.content);
    if (failure === "extra_field") answer["private-secret-key"] = "private-secret-value";
    else if (failure === "wrong_type") answer.recommendation = { "private-secret-key": "private-secret-value" };
    message.content = failure === "invalid_json" ? "private-secret-value" : JSON.stringify(answer);
    const { model, ledger } = reasoner(engine, () => json(body));
    const error = await new Review(engine, model).run(request).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(CrowboError);
    expect(String((error as Error).message)).toMatch(new RegExp(category));
    const receipt = lastReceipt(ledger);
    expect(receipt.validation).toEqual({ count: 1, types: [category] });
    expect(receipt.usage).toEqual({ prompt_tokens: 120, completion_tokens: 40 });
    expect(JSON.stringify(receipt) + String(error)).not.toContain("private-secret");
    expect(reviews(store)).toBe(false);
  });

  // py: tests/test_review.py::test_provider_metadata_is_sanitized_in_error_and_receipt[private provider diagnostic]
  // py: tests/test_review.py::test_provider_metadata_is_sanitized_in_error_and_receipt[reason1]
  it.each([["private provider diagnostic"], [{ private: "provider diagnostic" }]])(
    "provider metadata is sanitized in error and receipt (%j)",
    async (reason) => {
      const { engine, store, item } = setup();
      const [, request] = await configured(engine, item);
      const body = response();
      body.model = "private provider identifier";
      body.choices[0].finish_reason = reason;
      body.usage = {
        prompt_tokens: 50,
        completion_tokens: -1,
        total_tokens: "private detail",
        input_tokens: true,
        output_tokens: 1_000_000_001,
        provider_log: "private payload",
        completion_tokens_details: { reasoning_tokens: 12, debug: "private detail" },
      };
      const { model, ledger } = reasoner(engine, () => json(body));
      await expect(new Review(engine, model).run(request)).rejects.toThrow(/did not finish successfully \(unexpected\)/);
      const receipt = lastReceipt(ledger);
      expect(receipt.returned_model).toBe("unexpected");
      expect(receipt.finish_reasons).toEqual(["unexpected"]);
      expect(receipt.usage).toEqual({ prompt_tokens: 50, completion_tokens_details: { reasoning_tokens: 12 } });
      expect(reviews(store)).toBe(false);
    },
  );

  // py: tests/test_review.py::test_history_retains_old_basis_but_rechecks_current_access
  it("history retains old basis but rechecks current access", async () => {
    const { engine, item: initial } = setup();
    const [item, request] = await configured(engine, initial);
    const { model } = reasoner(engine, () => json(response()));
    const first = await new Review(engine, model).run(request);
    const changed = withSource(item, {
      text: "A new source assertion changes the available options.",
      updated_at: now(),
      observed_at: now(),
    });
    await engine.ingest(batch(changed));
    const history = await new Review(engine, null).inspect(first.id);
    expect(history.evidence_unchanged).toBe(false);
    expect(history.evidence[0].source.text).toBe(item.source.text);
    await engine.ingest(batch(withGrant(changed, { checked_at: now(), revoked: true })));
    await expect(new Review(engine, null).inspect(first.id)).rejects.toThrow(/permission/);
  });

  // py: tests/test_review.py::test_conflicting_current_evidence_does_not_hide_permitted_history
  it("conflicting current evidence does not hide permitted history", async () => {
    const { engine, item: initial } = setup();
    const [item, request] = await configured(engine, initial);
    const { model } = reasoner(engine, () => json(response()));
    const first = await new Review(engine, model).run(request);
    await engine.ingest(batch(withSource(item, { text: "Conflicting assertion" })));
    await expect(engine.inspect(logicalId(item.source))).rejects.toThrow(/Conflicting/);
    const history = await new Review(engine, null).inspect(first.id);
    expect(history.evidence_unchanged).toBe(false);
    expect(history.evidence[0].source.text).toBe(item.source.text);
  });

  // py: tests/test_review.py::test_source_change_during_reasoning_invalidates_new_result
  it("source change during reasoning invalidates new result", async () => {
    const { engine, store, item: initial } = setup();
    const [item, request] = await configured(engine, initial);
    const { model } = reasoner(engine, async () => {
      await engine.ingest(batch(withSource(item, { text: "A material new fact", updated_at: now(), observed_at: now() })));
      return json(response());
    });
    await expect(new Review(engine, model).run(request)).rejects.toThrow(/changed/);
    expect(reviews(store)).toBe(false);
    expect((await engine.inspect(logicalId(item.source))).source.text).toBe("A material new fact");
  });

  // py: tests/test_review.py::test_multi_source_review_batches_reads_and_rechecks_nonfirst_source[False]
  // py: tests/test_review.py::test_multi_source_review_batches_reads_and_rechecks_nonfirst_source[True]
  it.each([false, true])("multi-source review batches reads and rechecks non-first source (revoke=%s)", async (revoke) => {
    const { engine, store, item: initial } = setup();
    const [item, first] = await configured(engine, initial);
    const second = withSource(item, { native_id: "second" });
    await engine.ingest(batch(second));
    const request = reviewRequest.parse({ ...first, source_ids: [logicalId(item.source), logicalId(second.source)] });
    const reads: string[][] = [];
    const original = store.getMany.bind(store);
    store.getMany = async (keys: readonly string[]) => {
      reads.push([...keys]);
      return original(keys);
    };
    const { model } = reasoner(engine, async () => {
      if (revoke) await engine.ingest(batch(withGrant(second, { revoked: true, checked_at: now() })));
      return json(response());
    });
    if (revoke) {
      await expect(new Review(engine, model).run(request)).rejects.toThrow(/permission/);
      expect(reviews(store)).toBe(false);
    } else {
      const result = await new Review(engine, model).run(request);
      expect(result.evidence.map((e: any) => e.source.native_id)).toEqual([item.source.native_id, "second"]);
      expect(result.evidence_unchanged).toBeTruthy();
      expect(reads.length).toBeLessThanOrEqual(10);
    }
  });

  // py: tests/test_review.py::test_glm_uses_selected_route_and_preserves_returned_model
  it("GLM uses selected route and preserves returned model", async () => {
    const { engine, item: initial } = setup();
    let [item, original] = await configured(engine, initial);
    const glm = "@cf/zai-org/glm-5.3-flash";
    setSettings(engine, { query_processors: ["turbopuffer", glm] });
    item = withGrant(item, { processors: [...item.grant.processors, glm], checked_at: now() });
    await engine.ingest(batch(item));
    const request = reviewRequest.parse({ ...original, model: glm, reasoning_effort: "high" });
    const calls: Call[] = [];
    const { model } = reasoner(engine, (call) => {
      calls.push(call);
      const reply = response();
      reply.model = "glm-5.3-flash";
      return json(reply);
    });
    const result = await new Review(engine, model).run(request);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.model).toBe(glm);
    expect(calls[0].body.reasoning_effort).toBe("high");
    expect(result.provider.returned_model).toBe("glm-5.3-flash");
    expect(result.request.model).toBe(glm);
  });
});
