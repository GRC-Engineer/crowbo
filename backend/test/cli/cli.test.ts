// Port of tests/test_cli.py and tests/test_review.py::test_cli_review_writes_private_result_and_prints_no_evidence.
// The Python CLI opened storage directly; the TS CLI calls the HTTP API, so each test drives
// `main()` against an in-process API (fake-api.ts) that shares the test's MemoryStore.
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main, pyDumps } from "../../src/cli/main";
import { logicalId } from "../../src/domain/contracts";
import { reviewRequest } from "../../src/domain/review";
import { Decision } from "../../src/services/decision";
import { feedbackRequest } from "../../src/services/feedback";
import { batch, makeEngine, makeItem, makeSettings, type MemoryStore, now, withGrant } from "../helpers";
import { configured, modelFor, reply } from "../services/decision-fixtures";
import { type FakeApi, fakeApi, TOKEN } from "./fake-api";

let tmp: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "crowbo-cli-")));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function privateFile(name: string, content: string, mode = 0o600) {
  const path = join(tmp, name);
  writeFileSync(path, content);
  chmodSync(path, mode);
  return path;
}

async function cli(api: Pick<FakeApi, "fetch">, argv: string[], env: Record<string, string> = { CROWBO_TOKEN: TOKEN }) {
  const out: string[] = [];
  const code = await main(["--api", "https://crowbo.example.test", "--runtime-dir", join(tmp, "runtime"), ...argv], {
    fetch: api.fetch,
    env,
    keychain: () => null,
    out: (line) => out.push(line),
    err: () => {},
  });
  return { code, out: out.join("\n") };
}

const report = (output: string) => JSON.parse(readFileSync(JSON.parse(output).private_report, "utf8"));

/** tests/test_feedback.py::feedback_request */
function feedbackFor(result: Record<string, any>) {
  return feedbackRequest.parse({
    result_id: result.id,
    reviewed_at: now(),
    choice: { kind: "alternative", alternative_index: 0 },
    rationale: "Synthetic reviewer chooses the independently confirmed urgent work.",
    corrections: [{ statement: "Capacity remains unknown.", basis: "Operator assertion" }],
    revisit_when: ["A confirmed delivery owner supplies an estimate."],
  });
}

describe("operator CLI", () => {
  it("py: tests/test_cli.py::test_denied_import_is_reported_as_incomplete", async () => {
    const settings = makeSettings();
    const { store } = makeEngine(settings);
    const api = fakeApi({ settings: () => settings, store, aiToken: "test-token" });
    const denied = withGrant(makeItem(), { revoked: true });
    const source = privateFile("batch.json", JSON.stringify(batch(denied)));
    const { code, out } = await cli(api, ["ingest", source]);
    expect(code).toBe(2);
    const output = JSON.parse(out);
    expect(output.operation).toBe("ingest");
    expect(output.record_count).toBe(1);
    expect(output.records_with_pending_work).toBe(1);
    expect(store.rows.size).toBe(0);
    expect(api.providerCalls).toEqual([]);
    const saved = report(out);
    expect(saved.population_complete).toBe(false);
    expect(saved.retrieval_mode).toBeNull();
    expect(saved.records[0].status).toBe("access_denied");
    expect(statSync(output.private_report).mode & 0o777).toBe(0o600);
    expect(output.private_report).toMatch(/\/ingest-[0-9a-f]{12}\.json$/);
  });

  it("py: tests/test_cli.py::test_invalid_private_input_does_not_echo_its_contents", async () => {
    const { store } = makeEngine();
    const api = fakeApi({ settings: makeSettings, store, aiToken: "test-token" });
    // Valid JSON that fails the API's schema, and a file that is not JSON at all.
    for (const [operation, content] of [
      ["review", '{"private_marker": "DO_NOT_ECHO_THIS"}'],
      ["decide", "private_marker: DO_NOT_ECHO_THIS"],
    ]) {
      const path = privateFile(`${operation}.json`, content);
      const { code, out } = await cli(api, [operation, path]);
      expect(code).toBe(2);
      expect(out).not.toContain("DO_NOT_ECHO_THIS");
      expect(JSON.parse(out)).toEqual({ error: "Input or stored record failed schema validation; no input values printed" });
    }
  });

  it("py: tests/test_cli.py::test_feedback_cli_retains_and_inspects_without_constructing_a_model", async () => {
    const { engine, store } = makeEngine();
    const [, request] = await configured(engine, makeItem());
    const parent = await new Decision(engine, modelFor(engine, () => reply())).run(request);
    const path = privateFile("feedback.json", JSON.stringify(feedbackFor(parent)));
    // No inference credential and no provider: building a reasoner or Jev would fail the call.
    const api = fakeApi({ settings: () => engine.settings, store: store as MemoryStore, aiToken: null });
    let { code, out } = await cli(api, ["record-feedback", path]);
    expect(code).toBe(0);
    const feedback = report(out).records[0];
    expect(feedback.request.result_id).toBe(parent.id);
    ({ code, out } = await cli(api, ["inspect-feedback", feedback.id]));
    expect(code).toBe(0);
    expect(report(out).records[0]).toEqual(feedback);
    expect(api.providerCalls).toEqual([]);
  });

  it("py: tests/test_review.py::test_cli_review_writes_private_result_and_prints_no_evidence", async () => {
    const MODEL = "openai/gpt-6-luna";
    const settings = makeSettings({ query_processors: ["turbopuffer", "voyage", MODEL] });
    const { engine, store } = makeEngine(settings);
    const base = makeItem();
    const item = withGrant(base, { processors: [...base.grant.processors, MODEL] });
    await engine.ingest(batch(item));
    const request = reviewRequest.parse({ question: "What should we do next?", source_ids: [logicalId(item.source)], model: MODEL, reasoning_effort: "high" });
    const query = privateFile("request.json", JSON.stringify(request));
    const answer = {
      recommendation: "Confirm the obligation and available capacity before committing.",
      rationale: "The source requests a review but supplies no obligation [E1].",
      alternatives: ["Proceed with independently confirmed work."],
      uncertainties: ["Available hours are unknown."],
      evidence_ids: ["E1"],
    };
    const api = fakeApi({
      settings: () => settings,
      store,
      aiToken: "test-token",
      provider: async () =>
        new Response(
          JSON.stringify({ model: "gpt-6-luna", usage: { prompt_tokens: 120, completion_tokens: 40 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }] }),
          { status: 200 },
        ),
    });
    const { code, out } = await cli(api, ["review", query]);
    expect(code).toBe(0);
    expect(out).not.toContain("recommendation");
    expect(out).not.toContain(item.source.text);
    const saved = report(out).records[0];
    expect(saved.answer.evidence_ids).toEqual(["E1"]);
    expect(saved.evidence_unchanged).toBe(true);
  });
});

describe("operator CLI boundaries", () => {
  it("exports a decision page as a new owner-only file and refuses to overwrite it", async () => {
    const { engine, store } = makeEngine();
    const [, request] = await configured(engine, makeItem());
    const result = await new Decision(engine, modelFor(engine, () => reply())).run(request);
    const api = fakeApi({ settings: () => engine.settings, store: store as MemoryStore });
    const target = join(tmp, "private.html");
    let { code, out } = await cli(api, ["export-decision", result.id, "--output", target]);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toEqual({ private_snapshot: target, versions: 1 });
    const markup = readFileSync(target, "utf8");
    expect(markup).toContain("default-src 'none'");
    expect(statSync(target).mode & 0o777).toBe(0o600);
    ({ code, out } = await cli(api, ["export-decision", result.id, "--output", target]));
    expect(code).toBe(2);
    expect(JSON.parse(out)).toEqual({ error: "Local input, provider response or private output is unavailable or invalid" });
    expect(readFileSync(target, "utf8")).toBe(markup);
    ({ code, out } = await cli(api, ["export-decision", ...Array(6).fill(result.id), "--output", join(tmp, "six.html")]));
    expect(JSON.parse(out)).toEqual({ error: "Select one to five saved versions" });
    // The existing file is refused before the API is called at all.
    expect(api.calls.map((c) => c.operation)).toEqual(["export_decision"]);
  });

  it("reports the search mode and refuses shared-permission inputs before calling the API", async () => {
    const { store } = makeEngine();
    const api = fakeApi({ settings: makeSettings, store });
    const query = privateFile("query.txt", "access review");
    const { code, out } = await cli(api, ["search", "--query-file", query, "--mode", "keyword"]);
    expect(code).toBe(0);
    expect(JSON.parse(out).record_count).toBe(0);
    expect(report(out)).toEqual({ operation: "search", population_complete: false, retrieval_mode: "keyword", records: [] });
    expect(api.calls).toEqual([{ operation: "search", body: { query: "access review", mode: "keyword" } }]);
    const shared = privateFile("shared.txt", "access review", 0o644);
    const refused = await cli(api, ["search", "--query-file", shared]);
    expect(refused.code).toBe(2);
    expect(JSON.parse(refused.out)).toEqual({ error: "Private input requires owner-only file permissions (chmod 600)" });
    expect(api.calls).toHaveLength(1);
  });

  it("never sends the token without a valid credential, over plain HTTP, or from inside a checkout", async () => {
    const { store } = makeEngine();
    const api = fakeApi({ settings: makeSettings, store });
    let result = await cli(api, ["list"], {});
    expect(JSON.parse(result.out)).toEqual({ error: "Required Crowbo API credential is unavailable" });
    result = await cli(api, ["list"], { CROWBO_TOKEN: "short" });
    expect(JSON.parse(result.out)).toEqual({ error: "Required Crowbo API credential is unavailable" });
    const out: string[] = [];
    const code = await main(["--api", "http://crowbo.example.test", "list"], { fetch: api.fetch, env: { CROWBO_TOKEN: TOKEN }, out: (l) => out.push(l), err: () => {} });
    expect(code).toBe(2);
    expect(JSON.parse(out[0])).toEqual({ error: "Crowbo API address must use HTTPS unless it is a loopback address" });
    result = await cli(api, ["list", "--runtime-dir", process.cwd()]);
    expect(JSON.parse(result.out)).toEqual({ error: "Private runtime files must be outside the development checkout" });
    expect(api.calls).toEqual([]);
  });

  it("surfaces the API's bounded errors and unauthorised responses", async () => {
    const { store } = makeEngine();
    const api = fakeApi({ settings: makeSettings, store });
    let result = await cli(api, ["inspect-decision", "not-an-id"]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.out)).toEqual({ error: "Input or stored record failed schema validation; no input values printed" });
    result = await cli(api, ["list"], { CROWBO_TOKEN: "x".repeat(40) });
    expect(JSON.parse(result.out)).toEqual({ error: "Unauthorized" });
    result = await cli(api, ["experiment-status"]);
    expect(JSON.parse(result.out)).toEqual({ error: "Experiments are unavailable in this runtime" });
  });

  it("rejects malformed arguments with a usage error and exit code 2", async () => {
    const { store } = makeEngine();
    const api = fakeApi({ settings: makeSettings, store });
    for (const argv of [[], ["unknown"], ["search"], ["search", "--query-file", "q", "--mode", "fuzzy"], ["create-experiment", "--max-requests", "x", "--max-models", "1"], ["inspect"]]) {
      const err: string[] = [];
      const out: string[] = [];
      expect(await main(argv, { fetch: api.fetch, env: { CROWBO_TOKEN: TOKEN }, out: (l) => out.push(l), err: (l) => err.push(l) })).toBe(2);
      expect(out).toEqual([]);
      expect(err[0]).toMatch(/^usage: crowbo/);
    }
    expect(api.calls).toEqual([]);
  });
});

describe("summary output", () => {
  it("prints JSON exactly as Python's json.dumps", () => {
    expect(pyDumps({ operation: "list", records: [1, null, true], path: "/tmp/é😀\u007f" })).toBe(
      '{"operation": "list", "records": [1, null, true], "path": "/tmp/\\u00e9\\ud83d\\ude00\u007f"}',
    );
  });
});
