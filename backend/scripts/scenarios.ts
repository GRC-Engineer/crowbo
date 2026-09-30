// Replay private development cases through the Crowbo MCP endpoint; imports no Crowbo internals.
// TypeScript port of proof/mcp_scenarios.py. Only the transport changed: streamable HTTP with a
// bearer token instead of a stdio subprocess with a settings file. Checks, the private
// case/expectation separation and the report format are unchanged.
//
// Usage: bun scripts/scenarios.ts --url https://…/mcp --token-file ~/private/token \
//          --cases ~/private/cases.json --output ~/private/new-result.json
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type Json = any;

// ---------------------------------------------------------------------------------------------
// Python semantics the report depends on: truthiness, `==` on JSON values and `json.dumps`.

/** Python truthiness for JSON values. */
export function truthy(value: Json): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** Python `==` for JSON values: dicts compare regardless of key order, lists in order. */
export function pyEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item: Json, i: number) => pyEqual(item, b[i]));
  const keys = Object.keys(a).filter((k) => a[k] !== undefined);
  const other = Object.keys(b).filter((k) => b[k] !== undefined);
  return keys.length === other.length && keys.every((k) => Object.hasOwn(b, k) && pyEqual(a[k], b[k]));
}

const pyString = (value: string) =>
  `"${[...value]
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (char === '"') return '\\"';
      if (char === "\\") return "\\\\";
      if (char === "\n") return "\\n";
      if (char === "\r") return "\\r";
      if (char === "\t") return "\\t";
      if (char === "\b") return "\\b";
      if (char === "\f") return "\\f";
      if (code >= 0x20 && code < 0x7f) return char;
      // ensure_ascii: UTF-16 code units, lowercase hex.
      return [...Array(char.length).keys()].map((i) => `\\u${char.charCodeAt(i).toString(16).padStart(4, "0")}`).join("");
    })
    .join("")}"`;

/** `json.dumps(value, sort_keys=sortKeys)` with Python's default separators and ensure_ascii. */
export function pyDumps(value: Json, sortKeys = false): string {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
    return String(value);
  }
  if (typeof value === "string") return pyString(value);
  if (Array.isArray(value)) return `[${value.map((item) => pyDumps(item, sortKeys)).join(", ")}]`;
  let keys = Object.keys(value).filter((k) => value[k] !== undefined);
  if (sortKeys) keys = keys.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return `{${keys.map((k) => `${pyString(k)}: ${pyDumps(value[k], sortKeys)}`).join(", ")}}`;
}

/** `Decimal(a) == Decimal(b)` for decimal strings or numbers. */
export function decimalEqual(a: Json, b: Json): boolean {
  const normal = (value: Json) => {
    const match = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/.exec(String(value));
    if (!match || (match[2] === "" && (match[3] ?? "") === "")) throw new Error(`Invalid decimal: ${String(value)}`);
    const digits = `${match[2]}${match[3] ?? ""}`;
    const exponent = Number(match[4] ?? 0) - (match[3] ?? "").length;
    const stripped = digits.replace(/^0+/, "");
    if (!stripped) return "0";
    const trailing = stripped.length - stripped.replace(/0+$/, "").length;
    return `${match[1] === "-" ? "-" : ""}${stripped.slice(0, stripped.length - trailing)}e${exponent + trailing}`;
  };
  return normal(a) === normal(b);
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

// ---------------------------------------------------------------------------------------------

export function privatePath(value: string): string {
  const path = resolve(value.startsWith("~") ? join(homedir(), value.slice(1)) : value);
  for (let parent = path; ; parent = dirname(parent)) {
    if (existsSync(join(parent, ".git"))) throw new Error("Evaluation inputs and outputs must be outside Git checkouts");
    if (dirname(parent) === parent) break;
  }
  if (existsSync(path) && statSync(path).mode & 0o077) throw new Error("Private files require owner-only permissions");
  return path;
}

const OMITTED = new Set(["method", "case_id", "case_version"]);
const shared = (request: Record<string, Json>) => Object.fromEntries(Object.entries(request).filter(([k]) => !OMITTED.has(k)));

/** Reject unequal paired inputs before dispatch. Expectations never enter model input. */
export function comparisonContract(cases: Json[]): Map<string, Json[]> {
  const groups = new Map<string, Json[]>();
  for (const item of cases) {
    const group = item.comparison_group;
    if (truthy(group)) groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  for (const pair of groups.values()) {
    const access = pair.every((item) => truthy(item.request.access));
    const methods = new Set(access ? ["crowbo", "plain", "crowbo_without_jev"] : ["crowbo", "plain"]);
    const declared = new Set(pair.map((item) => item.request.method ?? null));
    if (pair.length !== methods.size || declared.size !== methods.size || [...declared].some((m) => !methods.has(m))) {
      throw new Error("Comparison requires every declared method exactly once");
    }
    if (access && pair.some((item) => truthy(item.feedback))) throw new Error("Access comparisons must not include corrective feedback");
    const inputs = pair.map((item) => ({ request: shared(item.request), feedback: item.feedback ?? null }));
    if (inputs.some((value) => !pyEqual(value, inputs[0])) || pair.some((item) => truthy(item.request.prior_feedback_id))) {
      throw new Error("Paired comparison inputs or corrections differ");
    }
  }
  return groups;
}

export function comparisonReceipts(report: Json): Json[] {
  const groups = comparisonContract(report.cases.map((c: Json) => c.case));
  const receipts: Json[] = [];
  for (const group of groups.keys()) {
    const pair: Json[] = report.cases.filter((c: Json) => c.case.comparison_group === group);
    const results: Json[] = pair.map((c) => c.result);
    if (!results.every(truthy)) {
      receipts.push({ group, complete: false });
      continue;
    }
    const firstAccess = truthy(pair[0].case.request.access);
    const common = results.map((result) => {
      const config = result.reasoning_configuration ?? {};
      return {
        bindings: result.decision.bindings,
        model: config.model ?? null,
        effort: config.reasoning_effort ?? null,
        max_completion_tokens: config.max_completion_tokens ?? null,
        returned_model: result.provider.returned_model,
        ...(firstAccess
          ? {
              source_input_hash: result.source_input_hash ?? null,
              answer_schema_hash: result.answer_schema_hash ?? null,
              common_payload_hash: result.provider.common_payload_hash ?? null,
            }
          : {}),
      };
    });
    let comparable =
      common.every((value) => pyEqual(value, common[0])) &&
      (["model", "effort", "max_completion_tokens"] as const).every((k) => common[0][k] !== null && common[0][k] !== undefined);
    const access = firstAccess;
    let assistance = pair.every((item, i) => {
      const config = results[i].reasoning_configuration ?? {};
      const method = item.case.request.method;
      return (
        pyEqual(config.include_jev, method === "crowbo") &&
        pyEqual(config.answer_format, access ? "access" : method === "crowbo" ? "deciding_facts" : "prose") &&
        truthy(results[i].prompt_hash)
      );
    });
    if (access) {
      const methods: Record<string, Json> = {};
      pair.forEach((item, i) => (methods[item.case.request.method] = results[i]));
      assistance &&= Object.entries(methods).every(([method, result]) => pyEqual(result.reasoning_configuration.access_guidance, method !== "plain"));
      assistance &&= pyEqual(methods.crowbo.prompt_hash, methods.crowbo_without_jev.prompt_hash);
      comparable &&= (["source_input_hash", "answer_schema_hash", "common_payload_hash"] as const).every((k) => truthy(common[0][k]));
    }
    receipts.push({
      group,
      complete: true,
      equivalent_inputs_verified: Boolean(comparable && assistance),
      common_input_hash: comparable ? sha256(pyDumps([shared(pair[0].case.request), pair[0].case.feedback ?? null, common[0]], true)) : null,
      result_ids: results.map((r) => r.id),
      declared_difference: access
        ? "Same access schema and source payload: strong plain prompt; guided without Jev; same guided prompt with contextual Jev. Guided pair isolates supplied Jev context."
        : "Jev plus structured fact assistance versus prose without Jev; not an isolated Jev test",
    });
  }
  return receipts;
}

// ---------------------------------------------------------------------------------------------

export type ToolResult = { isError?: boolean; structuredContent?: Json; [key: string]: Json };

/** The slice of an MCP client the runner uses; the SDK Client is adapted to it in `connectHttp`. */
export interface ScenarioClient {
  protocolVersion: string | undefined;
  listTools(): Promise<{ tools: { name: string }[] }>;
  callTool(name: string, args: Record<string, Json>, options?: { timeoutMs?: number }): Promise<ToolResult>;
  close(): Promise<void>;
}

export type Args = { url: string; tokenFile: string; cases: string; output: string };
export type Connect = (args: Args) => Promise<ScenarioClient>;

const TIMEOUT_MS = 240_000;

/** Streamable HTTP to the Crowbo endpoint with the operator's bearer token (read from a private file). */
export const httpConnector =
  (fetchImpl?: (url: string | URL, init?: RequestInit) => Promise<Response>): Connect =>
  async (args) => {
  const token = readFileSync(privatePath(args.tokenFile), "utf8").trim();
  const transport = new StreamableHTTPClientTransport(new URL(args.url), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  const client = new Client({ name: "crowbo-scenarios", version: "0.2.0" });
  await client.connect(transport, { timeout: TIMEOUT_MS });
  return {
    protocolVersion: transport.protocolVersion,
    listTools: () => client.listTools(),
    callTool: async (name, args, options) =>
      (await client.callTool({ name, arguments: args }, undefined, { timeout: options?.timeoutMs ?? TIMEOUT_MS })) as ToolResult,
    close: () => client.close(),
  };
};

export const connectHttp: Connect = httpConnector();

const iso = () => new Date().toISOString();

/** Python's `print(json.dumps(...), flush=True)`. */
export type Print = (line: string) => void;

export async function run(args: Args, connect: Connect = connectHttp, print: Print = (line) => console.log(line)): Promise<number> {
  const cases = JSON.parse(readFileSync(privatePath(args.cases), "utf8"));
  comparisonContract(cases.cases);
  if (!(cases.cases.length >= 1 && cases.cases.length <= 10)) throw new Error("Select one to ten bounded development cases");
  const discoveryQueries: string[] = cases.discovery_queries ?? [];
  if (discoveryQueries.length > 2) throw new Error("Select at most two discovery queries");
  const output = privatePath(args.output);
  if (existsSync(output)) throw new Error("Choose a new result filename; prior runs are immutable");
  const report: Json = {
    started_at: iso(),
    dataset: cases.dataset,
    expectation_qualification: "assistant-authored development candidates; not independently reviewed",
    judgment_qualified: false,
    calls: [],
    cases: [],
    discovery: [],
    result_inspection: { succeeded: false },
  };

  const persist = () => {
    writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
    chmodSync(output, 0o600);
  };

  const call = async (client: ScenarioClient, name: string, argumentsValue: Record<string, Json>) => {
    const started = performance.now();
    const result = await client.callTool(name, argumentsValue, { timeoutMs: TIMEOUT_MS });
    report.calls.push({ tool: name, seconds: Math.round(performance.now() - started) / 1000, result });
    persist();
    if (result.isError) return null;
    return result.structuredContent ?? null;
  };

  const client = await connect(args);
  let completed: Json[] = [];
  try {
    report.protocol_version = client.protocolVersion;
    report.tools = (await client.listTools()).tools.map((tool) => tool.name);
    for (const query of discoveryQueries) {
      const discovered = await call(client, "search_evidence", { query, mode: "semantic", limit: 3 });
      report.discovery.push({ query, succeeded: discovered !== null });
    }
    const ids = [...new Set<string>(cases.cases.flatMap((item: Json) => item.request.source_ids))];
    const inspected = await call(client, "inspect_evidence", { source_ids: ids });
    const returnedIds: string[] = inspected ? inspected.records.map((record: Json) => record.source_id) : [];
    const returned = new Set(returnedIds);
    report.evidence_selection_complete =
      inspected !== null && ids.length > 0 && returnedIds.length === ids.length && returned.size === ids.length && ids.every((id) => returned.has(id));
    if (!report.evidence_selection_complete) {
      report.failure = "Evidence inspection failed or returned missing, duplicate or unexpected source IDs";
      report.completed_at = iso();
      persist();
      return 2;
    }
    const revisions: Record<string, string> = Object.fromEntries(inspected.records.map((r: Json) => [r.source_id, r.revision_id]));
    for (const item of cases.cases) {
      const request = item.request;
      if (!truthy(request.expected_revisions)) {
        request.expected_revisions = Object.fromEntries(request.source_ids.map((key: string) => [key, revisions[key]]));
      }
      const result = await call(client, "run_decision", { request });
      const checks: Record<string, boolean> = {};
      if (result !== null) {
        const calculation = result.decision.calculation;
        checks.calculation_status = calculation.status === item.expected_calculation_status;
        if ("expected_annual_loss" in item) checks.arithmetic = decimalEqual(calculation.expected_annual_loss, item.expected_annual_loss);
        checks.exact_revisions = pyEqual(
          Object.fromEntries(result.decision.bindings.map((b: Json) => [b.source_id, b.revision_id])),
          request.expected_revisions,
        );
        checks.simulation = result.simulated === true;
      }
      const caseReport: Json = { case: item, result, deterministic_checks: checks };
      report.cases.push(caseReport);
      persist();
      print(pyDumps({ case: request.case_id, completed: result !== null, checks }));
      if (result !== null && "feedback" in item) {
        const feedbackRequest = { ...item.feedback, result_id: result.id, reviewed_at: iso(), supporting_revisions: request.expected_revisions };
        const feedback = await call(client, "record_feedback", { request: feedbackRequest });
        caseReport.feedback = feedback;
        checks.feedback_saved = feedback !== null;
        if (feedback !== null) {
          const corrected = { ...request, case_version: `${request.case_version}-corrected`, prior_feedback_id: feedback.id };
          const reassessed = await call(client, "run_decision", { request: corrected });
          caseReport.reassessment = reassessed;
          checks.reassessment_saved = reassessed !== null;
          if (reassessed !== null) {
            checks.feedback_referenced = reassessed.decision.request.prior_feedback_id === feedback.id;
            checks.reassessment_revisions = pyEqual(reassessed.decision.bindings, result.decision.bindings);
          }
          const original = await call(client, "inspect_result", { result_id: result.id });
          checks.original_preserved = original !== null && pyEqual(original.answer, result.answer);
        }
        persist();
        print(pyDumps({ case: request.case_id, correction_checks: checks }));
      }
    }
    completed = report.cases.filter((c: Json) => c.result !== null);
    if (completed.length) {
      const identifier = completed[0].result.id;
      const saved = await call(client, "inspect_result", { result_id: identifier });
      const inspection = {
        requested_id: identifier,
        id_matches: saved !== null && saved.id === identifier,
        decision_ready: saved !== null && saved.decision_ready === true,
        evidence_unchanged: saved !== null && saved.evidence_unchanged === true,
      };
      report.result_inspection = { ...inspection, succeeded: inspection.id_matches && inspection.decision_ready && inspection.evidence_unchanged };
    }
    // Expected schema denial: no source access or provider call should be attempted.
    const denied = await client.callTool("search_evidence", { query: "bounded test", limit: 50 }, { timeoutMs: TIMEOUT_MS });
    report.expected_schema_denial = denied.isError === true;
    report.comparisons = comparisonReceipts(report);
    report.completed_at = iso();
    persist();
  } finally {
    await client.close();
  }
  return completed.length === cases.cases.length &&
    completed.every((c: Json) => Object.values(c.deterministic_checks).every(Boolean)) &&
    report.discovery.every((d: Json) => d.succeeded) &&
    report.result_inspection.succeeded &&
    report.expected_schema_denial &&
    report.comparisons.every((c: Json) => c.equivalent_inputs_verified === true)
    ? 0
    : 2;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { url: { type: "string" }, "token-file": { type: "string" }, cases: { type: "string" }, output: { type: "string" } },
    strict: true,
  });
  for (const name of ["url", "token-file", "cases", "output"] as const) {
    if (!values[name]) {
      console.error(`--${name} is required`);
      process.exit(2);
    }
  }
  process.umask(0o077);
  process.exit(await run({ url: values.url!, tokenFile: values["token-file"]!, cases: values.cases!, output: values.output! }));
}
