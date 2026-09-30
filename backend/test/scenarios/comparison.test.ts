// Port of tests/test_comparison.py. Paired development inputs must remain comparable before inference.
import { describe, expect, it } from "vitest";
import { comparisonContract, comparisonReceipts, pyDumps } from "../../scripts/scenarios";

const clone = <T>(value: T): T => structuredClone(value);

function pair(): any[] {
  return ["crowbo", "plain"].map((method) => ({
    comparison_group: "synthetic",
    request: {
      case_id: `fictional-${method}`,
      method,
      question: "What comes next?",
      source_ids: ["a".repeat(64)],
      context: "Synthetic example",
    },
    feedback: { rationale: "Candidate correction" },
  }));
}

function accessTriple(): any[] {
  const cases = pair();
  cases.push(clone(cases[0]));
  cases[cases.length - 1].request.method = "crowbo_without_jev";
  for (const item of cases) {
    delete item.feedback;
    item.request.access = { system: "demo", account_id: "demo-account", scope: "demo-org" };
  }
  return cases;
}

describe("comparison contract", () => {
  // py: tests/test_comparison.py::test_unequal_comparisons_fail_before_dispatch[question]
  // py: tests/test_comparison.py::test_unequal_comparisons_fail_before_dispatch[source_ids]
  // py: tests/test_comparison.py::test_unequal_comparisons_fail_before_dispatch[feedback]
  for (const difference of ["question", "source_ids", "feedback"]) {
    it(`tests/test_comparison.py::test_unequal_comparisons_fail_before_dispatch[${difference}]`, () => {
      const cases = pair();
      if (difference === "feedback") cases[1].feedback.rationale = "A different correction";
      else cases[1].request[difference] = "Different";
      expect(() => comparisonContract(cases)).toThrow("Paired comparison inputs or corrections differ");
    });
  }

  it("py: tests/test_comparison.py::test_receipt_does_not_claim_equivalence_when_limits_or_source_bindings_differ", () => {
    const cases = pair();
    const result = {
      id: "fictional-id",
      decision: { bindings: [{ revision_id: "a".repeat(64), criteria_hash: "b".repeat(64) }] },
      reasoning_configuration: { model: "test", reasoning_effort: "high", max_completion_tokens: 8192 } as Record<string, unknown>,
      provider: { returned_model: "test" },
      prompt_hash: "synthetic-prompt-hash",
    };
    const report = { cases: cases.map((item) => ({ case: item, result: clone(result) })) };
    for (const item of report.cases) {
      const structured = item.case.request.method === "crowbo";
      Object.assign(item.result.reasoning_configuration, { include_jev: structured, answer_format: structured ? "deciding_facts" : "prose" });
    }
    const [receipt] = comparisonReceipts(report);
    expect(receipt.equivalent_inputs_verified).toBe(true);
    expect(receipt).toMatchObject({ group: "synthetic", complete: true, result_ids: ["fictional-id", "fictional-id"] });
    expect(receipt.declared_difference).toBe("Jev plus structured fact assistance versus prose without Jev; not an isolated Jev test");
    // Python: sha256(json.dumps([shared_request, feedback, common[0]], sort_keys=True)); the hash
    // literal was computed by the Python original on the same inputs.
    expect(pyDumps([{ b: 1, a: ["é", null] }], true)).toBe('[{"a": ["\\u00e9", null], "b": 1}]');
    expect(receipt.common_input_hash).toBe("e9eedc2d7d8ab43a4108c044d2b25cec8d18b2e627ec85db65b63922179f63ab");
    report.cases[1].result.reasoning_configuration.max_completion_tokens = 4096;
    expect(comparisonReceipts(report)[0].equivalent_inputs_verified).toBe(false);
    expect(comparisonReceipts(report)[0].common_input_hash).toBeNull();
  });

  // py: tests/test_comparison.py::test_access_comparison_rejects_unfair_inputs[third_input]
  // py: tests/test_comparison.py::test_access_comparison_rejects_unfair_inputs[feedback]
  // py: tests/test_comparison.py::test_access_comparison_rejects_unfair_inputs[missing_arm]
  for (const failure of ["third_input", "feedback", "missing_arm"]) {
    it(`tests/test_comparison.py::test_access_comparison_rejects_unfair_inputs[${failure}]`, () => {
      const cases = accessTriple();
      if (failure === "third_input") cases[cases.length - 1].request.context = "A private hint unavailable to the other arms";
      else if (failure === "feedback") cases[cases.length - 1].feedback = { rationale: "A corrective hint" };
      else cases.pop();
      const message = {
        third_input: "Paired comparison inputs or corrections differ",
        feedback: "Access comparisons must not include corrective feedback",
        missing_arm: "Comparison requires every declared method exactly once",
      }[failure]!;
      expect(() => comparisonContract(cases)).toThrow(message);
    });
  }

  it("py: tests/test_comparison.py::test_access_receipt_requires_same_schema_sources_and_guided_prompt", () => {
    const cases = accessTriple();
    const report: any = { cases: [] };
    for (const item of cases) {
      const method = item.request.method;
      report.cases.push({
        case: item,
        result: {
          id: method,
          decision: { bindings: [{ revision_id: "a".repeat(64) }] },
          reasoning_configuration: {
            model: "test",
            reasoning_effort: "high",
            max_completion_tokens: 8192,
            answer_format: "access",
            include_jev: method === "crowbo",
            access_guidance: method !== "plain",
          },
          provider: { returned_model: "test", common_payload_hash: "same-payload" },
          prompt_hash: method === "plain" ? "plain" : "guided",
          answer_schema_hash: "same-schema",
          source_input_hash: "same-sources",
        },
      });
    }
    expect(comparisonReceipts(report)[0].equivalent_inputs_verified).toBe(true);
    const last = report.cases[report.cases.length - 1].result;
    last.provider.common_payload_hash = "different";
    expect(comparisonReceipts(report)[0].equivalent_inputs_verified).toBe(false);
    last.provider.common_payload_hash = "same-payload";
    last.answer_schema_hash = "different";
    expect(comparisonReceipts(report)[0].equivalent_inputs_verified).toBe(false);
    last.answer_schema_hash = "same-schema";
    last.prompt_hash = "different";
    expect(comparisonReceipts(report)[0].equivalent_inputs_verified).toBe(false);
  });
});
