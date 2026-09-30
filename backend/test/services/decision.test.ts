// Port of tests/test_decision.py. Synthetic behavior tests; these do not qualify a professional recommendation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { logicalId, revisionId } from "../../src/domain/contracts";
import { CrowboError } from "../../src/domain/errors";
import { calculateLoss, decisionRequest, riskInputs } from "../../src/domain/decision-request";
import { QuestionSet } from "../../src/domain/questions";
import { Decision } from "../../src/services/decision";
import { headId } from "../../src/services/evidence";
import { addMicros, batch, HOUR, DAY, makeEngine, makeItem, now, withGrant, withSource } from "../helpers";
import { type Call, configured, modelFor, mutate, reply, riskData } from "./decision-fixtures";

const reviews = (rows: Map<string, Record<string, any>>) => [...rows.values()].filter((row) => row.kind === "review");

afterEach(() => {
  vi.useRealTimers();
});

describe("risk calculation", () => {
  it("py: tests/test_decision.py::test_loss_uses_decimal_units_and_reports_bounds_as_sensitivity", () => {
    const result = calculateLoss(riskInputs.parse(riskData()));
    expect(result.status).toBe("calculated");
    expect(result.expected_annual_loss).toBe("2400.100");
    expect(result.unit).toBe("GBP/year");
    expect(result.sensitivity_envelope).toEqual({
      low: "1200.050",
      high: "3600.150",
      meaning: "Input bounds only; not a probability or confidence interval.",
    });
  });

  it("py: tests/test_decision.py::test_missing_risk_input_remains_missing_and_zero_is_not_missing", () => {
    const inputs = riskData();
    delete inputs.annual_frequency;
    const result = calculateLoss(riskInputs.parse(inputs));
    expect(result.status).toBe("missing_input");
    expect(result.missing).toEqual(["annual_frequency"]);
    inputs.annual_frequency = { value: "0", provenance: inputs.mean_loss_per_event.provenance };
    expect(calculateLoss(riskInputs.parse(inputs)).expected_annual_loss).toBe("0.00");
    expect(calculateLoss(null).missing).toEqual(["annual_frequency", "mean_loss_per_event"]);
  });

  const changes: [string, Record<string, unknown>][] = [
    ["change0", { annual_frequency: { value: "NaN" } }],
    ["change1", { annual_frequency: { value: "-1" } }],
    ["change2", { annual_frequency: { low: "0.4", high: "0.5" } }],
    ["change3", { annual_frequency: { low: null } }],
    ["change4", { currency: "pounds" }],
  ];
  // py: tests/test_decision.py::test_risk_inputs_reject_ambiguous_units_nonfinite_or_incoherent_bounds[change0]
  // py: tests/test_decision.py::test_risk_inputs_reject_ambiguous_units_nonfinite_or_incoherent_bounds[change1]
  // py: tests/test_decision.py::test_risk_inputs_reject_ambiguous_units_nonfinite_or_incoherent_bounds[change2]
  // py: tests/test_decision.py::test_risk_inputs_reject_ambiguous_units_nonfinite_or_incoherent_bounds[change3]
  // py: tests/test_decision.py::test_risk_inputs_reject_ambiguous_units_nonfinite_or_incoherent_bounds[change4]
  it.each(changes)("test_risk_inputs_reject_ambiguous_units_nonfinite_or_incoherent_bounds[%s]", (_id, change) => {
    const raw = riskData();
    for (const [key, value] of Object.entries(change)) {
      if (value && typeof value === "object") Object.assign(raw[key], value);
      else raw[key] = value;
    }
    expect(() => riskInputs.parse(raw)).toThrow();
  });
});

describe("decision", () => {
  it("py: tests/test_decision.py::test_decision_binds_checks_and_calculation_to_model_evidence_without_combining_jev", async () => {
    const { engine } = makeEngine();
    const [item, base] = await configured(engine, makeItem());
    const request = decisionRequest.parse({
      ...base,
      risk: riskData("counterfactual", [logicalId(item.source)]),
      counterfactual: {
        label: "Invented annual exposure",
        attributed_to: "Test author",
        changes: "Assume the explicitly supplied event frequency and mean loss.",
      },
    });
    const calls: Call[] = [];
    const model = modelFor(engine, (call) => {
      calls.push(call);
      return reply();
    });
    const result = await new Decision(engine, model).run(request);
    expect(calls).toHaveLength(1);
    const envelope = JSON.parse(calls[0].content);
    const body = JSON.parse(envelope.messages[1].content);
    expect(envelope.model).toBe("@cf/zai-org/glm-5.3-flash");
    expect(body.decision.request.subject).toBe("Synthetic security programme");
    expect(body.selected_evidence[0].source.text).toBe(item.source.text);
    expect(body.decision.bindings[0].revision_id).toBe(revisionId(item.source));
    expect(body.decision.calculation.expected_annual_loss).toBe("2400.100");

    expect(result.answer.recommendation).toBe("Ask the accountable owner to confirm the obligation and capacity.");
    expect(result.decision.counterfactual).toBe(true);
    expect(result.decision.checks.accountable_owner).toBe("unresolved");
    expect(result.evidence[0].assessment.answers.obligation_stated.noul).toBe(0.01);
    expect((await new Decision(engine, null).inspect(result.id)).decision_ready).toBe(true);
  });

  const unready: [string, string][] = [
    ["wrong_criteria", "current Jev criteria"],
    ["missing_answer", "active questions"],
    ["stale", "stale or future"],
    ["future", "stale or future"],
    ["withdrawn", "withdrawn"],
    ["revision", "requested baseline"],
  ];
  // py: tests/test_decision.py::test_unready_evidence_blocks_inference_and_saved_recommendation[wrong_criteria-current Jev criteria]
  // py: tests/test_decision.py::test_unready_evidence_blocks_inference_and_saved_recommendation[missing_answer-active questions]
  // py: tests/test_decision.py::test_unready_evidence_blocks_inference_and_saved_recommendation[stale-stale or future]
  // py: tests/test_decision.py::test_unready_evidence_blocks_inference_and_saved_recommendation[future-stale or future]
  // py: tests/test_decision.py::test_unready_evidence_blocks_inference_and_saved_recommendation[withdrawn-withdrawn]
  // py: tests/test_decision.py::test_unready_evidence_blocks_inference_and_saved_recommendation[revision-requested baseline]
  it.each(unready)("test_unready_evidence_blocks_inference_and_saved_recommendation[%s-%s]", async (failure, message) => {
    const { engine, store } = makeEngine();
    let [item, request] = await configured(engine, makeItem());
    const head = store.rows.get(headId(logicalId(item.source)))!;
    if (failure === "wrong_criteria") {
      mutate(engine, { questions: new QuestionSet({ version: "new-criteria", questions: engine.questions.questions }) });
    } else if (failure === "missing_answer") {
      delete store.rows.get(head.assessment_id)!.answers.deadline_stated;
    } else if (failure === "stale" || failure === "future") {
      head.last_checked_at = addMicros(now(), failure === "stale" ? -25n * HOUR : HOUR);
    } else if (failure === "withdrawn") {
      head.withdrawn = true;
    } else {
      request = decisionRequest.parse({ ...request, expected_revisions: { [logicalId(item.source)]: "a".repeat(64) } });
    }
    let reached = false;
    const model = modelFor(engine, () => {
      reached = true;
      throw new Error("Unready evidence reached the model");
    });
    const run = new Decision(engine, model).run(request);
    await expect(run).rejects.toThrow(CrowboError);
    await expect(run).rejects.toThrow(new RegExp(message));
    expect(reached).toBe(false);
    expect(reviews(store.rows)).toHaveLength(0);
    expect(model.ledger.calls).toHaveLength(0);
  });

  // py: tests/test_decision.py::test_changes_during_reasoning_reject_result_before_storage[revision]
  // py: tests/test_decision.py::test_changes_during_reasoning_reject_result_before_storage[criteria]
  // py: tests/test_decision.py::test_changes_during_reasoning_reject_result_before_storage[withdrawal]
  it.each(["revision", "criteria", "withdrawal"])("test_changes_during_reasoning_reject_result_before_storage[%s]", async (change) => {
    const { engine, store } = makeEngine();
    const [item, request] = await configured(engine, makeItem());
    const model = modelFor(engine, async () => {
      if (change === "revision") {
        const at = now();
        await engine.ingest(batch(withSource(item, { text: "A changed synthetic fact", updated_at: at, observed_at: at })));
      } else if (change === "criteria") {
        mutate(engine, { questions: new QuestionSet({ version: "new-criteria", questions: engine.questions.questions }) });
      } else {
        store.rows.get(headId(logicalId(item.source)))!.withdrawn = true;
      }
      return reply();
    });
    const run = new Decision(engine, model).run(request);
    await expect(run).rejects.toThrow(CrowboError);
    await expect(run).rejects.toThrow(/revision|criteria|withdrawn/);
    expect(reviews(store.rows)).toHaveLength(0);
  });

  it("py: tests/test_decision.py::test_history_reports_stale_readiness_and_denies_withdrawn_contributor", async () => {
    const { engine, store } = makeEngine();
    // Python patched only `crowbo.decision.now`; TS has no per-module seam, so the clock moves for
    // every module. The grant is given a 48h expiry so only the decision's freshness check sees the
    // 25h step, as in Python where the 1h grant was checked against the unpatched clock.
    const long = withGrant(makeItem(), { expires_at: addMicros(now(), 2n * DAY) });
    const [item, request] = await configured(engine, long);
    const model = modelFor(engine, () => reply());
    const result = await new Decision(engine, model).run(request);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 3600 * 1000);
    const inspected = await new Decision(engine, null).inspect(result.id);
    expect(inspected.decision_ready).toBe(false);
    expect(inspected.readiness_issue).toBe("Decision source content is stale or future-dated; refresh it first");
    store.rows.get(headId(logicalId(item.source)))!.withdrawn = true;
    await expect(new Decision(engine, null).inspect(result.id)).rejects.toThrow(/withdrawn/);
  });

  it("py: tests/test_decision.py::test_unselected_provenance_and_unlabelled_hypothetical_are_rejected", async () => {
    const { engine } = makeEngine();
    const [, request] = await configured(engine, makeItem());
    const raw: Record<string, any> = { ...request };
    raw.risk = riskData("source_assertion", ["f".repeat(64)]);
    expect(() => decisionRequest.parse(raw)).toThrow(/selected evidence/);
    raw.risk = riskData("counterfactual");
    expect(() => decisionRequest.parse(raw)).toThrow(/explicit overlay/);
    raw.risk = riskData("source_assertion");
    expect(() => decisionRequest.parse(raw)).toThrow(/require selected evidence/);
  });

  it("py: tests/test_decision.py::test_counterfactual_reassessment_preserves_original_request_and_source", async () => {
    const { engine } = makeEngine();
    const [item, request] = await configured(engine, makeItem());
    const model = modelFor(engine, () => reply());
    const decision = new Decision(engine, model);
    const original = await decision.run(request);
    const changed = await decision.run(
      decisionRequest.parse({
        ...request,
        case_version: "capacity-after-deadline",
        counterfactual: {
          label: "Capacity arrives late",
          attributed_to: "Synthetic operator",
          changes: "Assume qualified capacity is available only after the planning window.",
        },
      }),
    );
    expect(original.id).not.toBe(changed.id);
    expect((await decision.inspect(original.id)).decision.request.case_version).toBe("1");
    expect(changed.decision.request.counterfactual.label).toBe("Capacity arrives late");
    expect(changed.evidence[0].source.text).toBe(item.source.text);
  });

  it("py: tests/test_decision.py::test_revoking_nonfirst_risk_contributor_denies_saved_decision", async () => {
    const { engine } = makeEngine();
    const [item, request] = await configured(engine, makeItem());
    const second = withSource(item, { native_id: "second" });
    await engine.ingest(batch(second));
    const raw = {
      ...request,
      source_ids: [logicalId(item.source), logicalId(second.source)],
      expected_revisions: {
        [logicalId(item.source)]: revisionId(item.source),
        [logicalId(second.source)]: revisionId(second.source),
      },
      risk: riskData("source_assertion", [logicalId(second.source)]),
    };
    const model = modelFor(engine, () => reply());
    const result = await new Decision(engine, model).run(decisionRequest.parse(raw));
    expect(result.decision.calculation.expected_annual_loss).toBe("2400.100");
    await engine.ingest(batch(withGrant(second, { checked_at: now(), revoked: true })));
    await expect(new Decision(engine, null).inspect(result.id)).rejects.toThrow(/permission/);
  });
});

