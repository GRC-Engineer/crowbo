// End-to-end smoke test against a running API (local `wrangler dev` or staging). Drives the
// standing-decision loop through the public HTTP API and MCP, and times each call.
// Usage: CROWBO_API=http://127.0.0.1:8788 CROWBO_TOKEN_FILE=.dev-token bun scripts/smoke.ts
import { readFileSync } from "node:fs";

const api = process.env.CROWBO_API ?? "http://127.0.0.1:8788";
const token = readFileSync(process.env.CROWBO_TOKEN_FILE ?? ".dev-token", "utf8").trim();
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const timings: { step: string; ms: number; status: number }[] = [];

async function op(name: string, body: unknown = {}) {
  const started = performance.now();
  const response = await fetch(`${api}/v1/operations/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
  const ms = performance.now() - started;
  timings.push({ step: name, ms: Math.round(ms * 10) / 10, status: response.status });
  const data = (await response.json()) as any;
  if (!response.ok) throw new Error(`${name} -> ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

const check = (label: string, condition: boolean, detail?: unknown) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : ` :: ${JSON.stringify(detail)}`}`);
  if (!condition) process.exitCode = 1;
};

const unauth = await fetch(`${api}/v1/operations/list`, { method: "POST" });
check("unauthenticated request is refused", unauth.status === 401);

const at = new Date();
const iso = (ms: number) => new Date(at.getTime() + ms).toISOString();
const native = `smoke-${at.getTime()}`;
const text = "Ticket: account svc-deploy runs the nightly release pipeline; the read-only role failed the deploy step.";
const ingest = await op("ingest", {
  scope: "Synthetic smoke test",
  coverage: "partial",
  limitations: ["Synthetic"],
  records: [
    {
      source: { tenant: "synthetic", connector: "fixture", workspace: "public", native_id: native, source_url: `https://example.org/${native}`, title: "Synthetic access ticket", text, updated_at: iso(-3600_000), observed_at: iso(-1000), basis: "synthetic", kind: "issue" },
      grant: { readers: ["operator"], processors: ["turbopuffer", "voyage", "jev"], checked_at: iso(-60_000), expires_at: iso(3600_000) },
    },
  ],
});
check("ingest stores the revision (Jev pending without a model credential)", ingest.records[0].logical_id?.length === 64, ingest);
const sourceId = ingest.records[0].logical_id;
const revisionId = ingest.records[0].revision_id;

const accountQuestion = { kind: "access_retain", subject: { system: "aws-prod", account_id: `svc-deploy-${native}`, scope: "AdministratorAccess" } };
const subjectKey = `account:aws-prod:AdministratorAccess:svc-deploy-${native}`;
await op("standing_register_subject", { question: accountQuestion, team: "grc" });
const notReady = await op("standing_ask", accountQuestion);
check("no answer before criteria are activated", notReady.status === "not_ready" || notReady.status === "answered", notReady);
const gate = await op("standing_record_gate", { question_kind: "access_retain", criteria_version: "access-retain-v1", qualification: "synthetic_fixture", cases: 3, passed: true, evidence: "smoke fixtures", approved_by: "operator" });
await op("standing_activate", { kind: "access_retain", gate_id: gate.id });
for (const [predicate, value, quote] of [
  ["identity", `svc-deploy-${native}`, null],
  ["required_work", "specific", "runs the nightly release pipeline"],
  ["alternative_test", "failed", "the read-only role failed the deploy step"],
] as const) {
  await op(
    "standing_assert_fact",
    quote
      ? { subject_key: subjectKey, workflow: "access_review", predicate, state: "stated", value, citations: [{ source_id: sourceId, revision_id: revisionId, quote }], provenance: "source_extraction", extractor: "smoke-manual@1", attributed_to: "operator" }
      : { subject_key: subjectKey, workflow: "access_review", predicate, state: "stated", value, provenance: "operator_assertion", attributed_to: "operator" },
  );
}
const first = await op("standing_ask", accountQuestion);
check("standing answer: retain, current, simulated", first.status === "answered" && first.version.verdict.outcome === "retain" && first.freshness.status === "current" && first.version.simulated === true, first);
const warm: number[] = [];
for (let i = 0; i < 20; i++) {
  const started = performance.now();
  const again = await op("standing_ask", accountQuestion);
  warm.push(performance.now() - started);
  if (again.version?.id !== first.version.id) check("repeat asks return the same immutable version", false, again);
}
warm.sort((a, b) => a - b);
console.log(`standing_ask warm local: p50 ${warm[9].toFixed(1)} ms, p95 ${warm[18].toFixed(1)} ms (n=20, loopback, wrangler dev)`);

const survey = await op("standing_survey", { workflow: "access_review" });
check("survey lists the subject", survey.rows.some((r: any) => r.subject_key === subjectKey), survey);

const mcp = await fetch(`${api}/mcp`, {
  method: "POST",
  headers: { ...headers, accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});
const tools = ((await mcp.json()) as any).result?.tools?.map((t: any) => t.name) ?? [];
check("MCP lists the standing and evidence tools", ["ask_standing_decision", "search_evidence", "run_decision", "record_feedback"].every((t) => tools.includes(t)), tools);
const mcpAsk = await fetch(`${api}/mcp`, {
  method: "POST",
  headers: { ...headers, accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ask_standing_decision", arguments: { question: accountQuestion } } }),
});
const called = ((await mcpAsk.json()) as any).result;
check("MCP ask returns the same version", called?.structuredContent?.version?.id === first.version.id, called);

console.table(timings.filter((t) => t.step !== "standing_ask").slice(0, 12));
