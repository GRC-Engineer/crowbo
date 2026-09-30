// Port of tests/test_questions.py. Python's Runtime call ledger is MemoryLedger; httpx.MockTransport
// is an injected fetch on the Cloudflare AI route.
import { describe, expect, it } from "vitest";
import { logicalId } from "../../src/domain/contracts";
import { CrowboError } from "../../src/domain/errors";
import { QuestionSet } from "../../src/domain/questions";
import type { FetchLike } from "../../src/providers/http";
import { Jev } from "../../src/providers/cloudflare-ai";
import { Evidence } from "../../src/services/evidence";
import { batch, makeEngine, makeItem, MemoryLedger } from "../helpers";

const jevFor = (settings: { cloudflare_account: string; gateway: string }, fetch: FetchLike, questions: QuestionSet) => {
  const ledger = new MemoryLedger();
  return { ledger, jev: new Jev({ account: settings.cloudflare_account, gateway: settings.gateway, token: "test-token", fetch }, ledger, questions) };
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("questions", () => {
  // py: tests/test_questions.py::test_invalid_question_descriptions_fail_at_configuration[score-criteria0]
  // py: tests/test_questions.py::test_invalid_question_descriptions_fail_at_configuration[noul-criteria1]
  // py: tests/test_questions.py::test_invalid_question_descriptions_fail_at_configuration[choice-criteria2]
  it.each([
    ["score", [0, 1]],
    ["noul", { true: true, false: false }],
    ["choice", { yes: 1, unknown: null }],
  ] as const)("invalid question descriptions fail at configuration [%s]", (kind, criteria) => {
    expect(
      () => new QuestionSet({ version: "invalid", questions: { q: { type: kind, instructions: "A bounded judgment", criteria } } }),
    ).toThrow(/descriptions/);
  });

  it("py: tests/test_questions.py::test_custom_jev_questions_reassess_without_reembedding_and_keep_old_answers", async () => {
    const { engine, store, settings } = makeEngine();
    const item = makeItem();
    await engine.ingest(batch(item));
    const original = (await engine.inspect(logicalId(item.source))).assessment!;
    const questions = new QuestionSet({
      version: "exposure-v1",
      questions: {
        deployment: {
          type: "choice",
          instructions: "What deployment state is actually evidenced?",
          criteria: { verified: "Live verification", unknown: "No live verification" },
        },
        impact: {
          type: "score",
          instructions: "How much supported impact is described?",
          criteria: ["Unestablished", "Limited", "Material"],
        },
      },
    });
    const sent: any[] = [];
    const respond: FetchLike = async (_url, init) => {
      sent.push(JSON.parse(String(init!.body)));
      return json({
        success: true,
        result: {
          model: "jev-test",
          usage: { input_tokens: 10, output_tokens: 5 },
          answers: {
            deployment: { type: "choice", choice: "unknown", confidence: 0.99, probabilities: { verified: 0.0, unknown: 1.0 } },
            impact: {
              type: "score",
              score: 0,
              confidence: 0.99,
              legend: { "0": "Unestablished", "1": "Limited", "2": "Material" },
              probabilities: { "0": 1.0, "1": 0.0, "2": 0.0 },
            },
          },
        },
      });
    };
    const { jev, ledger } = jevFor(settings, respond, questions);
    const revised = new Evidence(settings, store, jev, questions);
    const before = await revised.inspect(logicalId(item.source));
    expect(before.assessment).toEqual(original);
    expect(before.assessment_current).toBe(false);
    expect((await revised.resume())[0].assessment_ready).toBe(true);
    // The Python handler asserted on each request body; asserted here after the call.
    expect(sent.length).toBe(1);
    expect(sent[0].input.state.text).toBe(item.source.text);
    expect(sent[0].input.questions.deployment.criteria).toEqual({ verified: "Live verification", unknown: "No live verification" });
    const view = await revised.inspect(logicalId(item.source));
    expect(view.assessment_current).toBe(true);
    expect((view.assessment!.answers.deployment as any).choice).toBe("unknown");
    expect((view.assessment!.answers.impact as any).score).toBe(0);
    expect(view.assessment!.questions).toEqual(questions.questions);
    await revised.resume();
    expect(ledger.calls.length).toBe(1);
    expect(store.indexed.length).toBe(1);
    expect([...store.rows.values()].some((row) => row.criteria_hash === original.criteria_hash)).toBe(true);
  });

  it("py: tests/test_questions.py::test_answer_cannot_introduce_unconfigured_choice", async () => {
    const { settings } = makeEngine();
    const item = makeItem();
    const questions = new QuestionSet({
      version: "v1",
      questions: {
        state: { type: "choice", instructions: "Is deployment verified?", criteria: { verified: "Yes", unknown: "Not established" } },
      },
    });
    const body = {
      success: true,
      result: {
        model: "jev-test",
        usage: { input_tokens: 1, output_tokens: 1 },
        answers: { state: { type: "choice", choice: "invented", confidence: 1, probabilities: { invented: 1 } } },
      },
    };
    const { jev } = jevFor(settings, async () => json(body), questions);
    const failure = jev.assess(item.source);
    await expect(failure).rejects.toThrow(CrowboError);
    await expect(failure).rejects.toThrow(/validation/);
  });
});
