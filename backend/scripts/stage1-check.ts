// Prove Stage 1 against a running Worker over MCP (local wrangler dev or staging), with one person's
// token, the way their Claude connects. Each check compares recorded output with a literal value.
// Usage: CROWBO_URL=https://…/mcp CROWBO_TOKEN_FILE=/private/path bun scripts/stage1-check.ts [--reset]
// The token file must be private (mode 600); the token is never printed.
import { readFileSync, statSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NORTHWIND_KB_EXPORT } from "../src/engine/kb-fixture";

const url = process.env.CROWBO_URL;
const tokenFile = process.env.CROWBO_TOKEN_FILE;
if (!url || !tokenFile) throw new Error("Set CROWBO_URL and CROWBO_TOKEN_FILE");
if ((statSync(tokenFile).mode & 0o077) !== 0) throw new Error("The token file must not be readable by others (chmod 600)");
const token = readFileSync(tokenFile, "utf8").trim();

const connect = async () => {
  const client = new Client({ name: "stage1-check", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
};
let client = await connect();
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return r.structuredContent;
};
const results: { check: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: unknown) => results.push({ check: name, ok, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
const Q = "Who should still have billing admin?";

if (process.argv.includes("--reset")) {
  await call("engine_reset_demo", { confirm: true }); // start this person's copy over, so every check runs
  await client.close();
  client = await connect();
}
const tools = (await client.listTools()).tools.map((t) => t.name);
check("fifteen engine tools offered", tools.filter((t) => t.startsWith("engine_")).length === 15, tools.filter((t) => t.startsWith("engine_")));

const status = await call("engine_status");
const fresh = status.layers["04_decision_memory"].entries <= 10 && status.now.startsWith("2026-10-13");
if (!fresh) console.log(`note: this tenant already has history (clock ${status.now}); checks that need a fresh tenant are skipped`);

const first = await call("engine_decide", { question: Q });
check("five numbered sources with weights", JSON.stringify(first.sources.map((s: any) => [s.label, s.weight, s.used])) === JSON.stringify([["Okta", 5, true], ["Billing apps", 4, true], ["Vendor docs", 3, true], ["Linear", 3, true], ["Risk register", 3, false]]), first.sources.map((s: any) => [s.label, s.weight, s.used]));
check("basis under the decision", first.basis?.scenario?.confidence === 0.8 && first.basis?.action?.rank === 2 && first.basis.weights.length === 8, first.basis?.action);
check("decision is a lookup", first.lookup_ms < 50, `${first.lookup_ms} ms`);

const whatIf = await call("engine_what_if", { weights: { slack: 1 } });
const after = await call("engine_decide", { question: Q });
check("what-if changes the copy, not the record", whatIf.kept === false && JSON.stringify(whatIf.diff.removed) === '["drop-access-screenshots"]' && after.decision_id === first.decision_id, whatIf.diff);

if (fresh) {
  await call("engine_record_call", { action: "move-unused-to-operator", call: "override", reason: "Alex: 4 of the 31 are break-glass accounts", assertions: [{ subject: "group:billing-admins", predicate: "break_glass_exempt", value: 4 }] });
  await client.close();
  client = await connect(); // a new connection, a new request: the answer must come from what was kept
  const kept = await call("engine_decide", { question: Q });
  check("the recorded call is kept across connections (27)", kept.answer.move.title === "Move the 27 unused billing admins to the Billing Operator role" && kept.sources.some((s: any) => s.label === "Decision memory"), kept.answer.move.title);
  const week = await call("engine_advance_time", { hours: 168 });
  check("a week later the outcome is recorded from the reads", JSON.stringify(week.outcomes.map((o: any) => [o.body.status, o.body.baseline, o.body.value])) === '[["done",27,0]]', week.outcomes.map((o: any) => o.body));
  const memory = await call("engine_memory", { kind: "outcome" });
  check("memory chain intact, outcome kept", memory.chain_intact === true && memory.entries.length === 1, memory.entries.length);
  const kb = await call("engine_import_knowledge_base", { synthetic: true, files: NORTHWIND_KB_EXPORT });
  const owners = kb.profile.systems.map((x: any) => `${x.id}=${x.owner}`).join(",");
  check("a synthetic export gives a first profile", owners === "app:billing=person:priya,app:okta=person:dana" && kb.profile.files.filter((f: any) => f.format === "not_read").length === 1, owners);
  const imports = await call("engine_memory", { kind: "import" });
  check("the import is kept in memory", imports.chain_intact === true && imports.entries.length === 1, imports.entries.length);
}

await client.close();
for (const r of results) console.log(`${r.ok ? "VERIFIED    " : "NOT VERIFIED"}  ${r.check}${r.ok ? "" : `: ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks verified`);
process.exit(failed ? 1 : 0);
