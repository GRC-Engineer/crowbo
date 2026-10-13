// Prove the demo against the real local MCP server, the way a harness uses it. Each check reads
// recorded tool output and compares it with a literal expectation. Exit 1 on any failure.
// Usage: bun scripts/demo-check.ts [--record out.json]   (writes the recorded outputs for the frontend)
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "demo-check", version: "0" });
await client.connect(new StdioClientTransport({ command: "bun", args: [new URL("./mcp-local.ts", import.meta.url).pathname] }));
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return r.structuredContent;
};

const results: { check: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: unknown) => results.push({ check: name, ok, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
const recorded: Record<string, unknown> = {};

// 1. A question gets the move, with five numbered sources and their freshness and coverage.
const first = await call("engine_decide", { question: "Who should still have billing admin?" });
recorded.engine_decide = first;
const labels = first.sources.map((s: any) => `${s.label}:${s.freshness}:${s.coverage}`);
check("five sources, register stale, billing partial", JSON.stringify(labels) === JSON.stringify(["Okta:fresh:full", "Billing apps:fresh:partial", "Vendor docs:fresh:full", "Linear:fresh:full", "Risk register:stale:full"]), labels);
check("each source carries its weight and whether it was used", JSON.stringify(first.sources.map((s: any) => [s.label, s.weight, s.used])) === JSON.stringify([["Okta", 5, true], ["Billing apps", 4, true], ["Vendor docs", 3, true], ["Linear", 3, true], ["Risk register", 3, false]]), first.sources.map((s: any) => [s.label, s.weight, s.used]));
check("register conflicts with Okta", JSON.stringify(first.sources[4].conflicts_with) === "[1]", first.sources[4].conflicts_with);
const deciding = first.answer.finding.filter((f: any) => f.deciding).map((f: any) => f.text);
check("40 holders and 31 unused, computed across sources", deciding[0].startsWith("40 people hold") && deciding[1].startsWith("31 of 40 holders"), deciding);
check("the move", first.answer.move.title === "Move the 31 unused billing admins to the Billing Operator role" && first.answer.move.mode === "fix", first.answer.move.title);
check("who decides, who delivers, by when (cited)", first.answer.decides === "Priya" && first.answer.delivers === "Alex" && first.answer.due.text === "before audit prep" && first.answer.due.date === "2026-11-24" && JSON.stringify(first.answer.due.cites) === "[4]", first.answer);
check("conditions include testing and the missing log days", first.answer.conditions.length === 2 && first.answer.conditions[1].includes("3 days missing"), first.answer.conditions);
check("the decision itself is a lookup, not a model call", first.lookup_ms < 50, `lookup ${first.lookup_ms} ms, total ${first.elapsed_ms} ms with models`);

// 2. Three drafts, nothing sent.
const drafts = await call("engine_draft_followups", { topic: "billing-admin" });
console.log(`models: routing=${first.models.routing}; summary=${first.summary.generated_by}; drafts=${drafts.generated_by}; ingestion=${first.models.ingestion.join(", ")}`);
recorded.engine_draft_followups = drafts;
check("three drafts, sent false", drafts.drafts.length === 3 && drafts.sent === false && drafts.drafts.map((d: any) => d.to).join(",") === "Priya,Alex,#billing-admins", drafts.drafts.map((d: any) => d.to));

// 3. The scheduled reads link the data points and shape the decision on their own.
const schedule = await call("engine_run_schedule", { minutes: 60 });
recorded.engine_run_schedule = schedule;
const formed = schedule.log.flatMap((e: any) => e.edges_added.map((x: any) => `${x.from} ${x.rel} ${x.to}`));
check("links form across tools", ["group:billing-admins grants_admin_on app:billing", "app:billing business_owner person:priya", "launch:audit-prep depends_on control:billing-admin-access", "control:billing-admin-access assigned_to person:alex"].every((l) => formed.includes(l)), formed.filter((l: string) => !l.startsWith("person:u")));
const proposedAt = schedule.log.find((e: any) => e.decision_diff?.added.includes("move-unused-to-operator"));
check("the move appears when the vendor docs are read", proposedAt?.connector === "vendor-docs", proposedAt?.connector ?? "never");

// 4. A recorded call changes the next answer, and the answer cites it.
const call1 = await call("engine_record_call", {
  action: "move-unused-to-operator", call: "override", reason: "Alex: 4 of the 31 are break-glass accounts and must keep admin",
  assertions: [{ subject: "group:billing-admins", predicate: "break_glass_exempt", value: 4 }],
});
recorded.engine_record_call = call1;
const second = await call("engine_decide", { question: "Who should still have billing admin?" });
recorded.engine_decide_after_call = second;
check("next answer is better because of the call", second.answer.move.title === "Move the 27 unused billing admins to the Billing Operator role" && second.sources.some((s: any) => s.label === "Decision memory"), second.answer.move.title);

// 5. Stale evidence is shown and never used.
check("stale register is unresolved, not used", first.answer.unresolved.length === 1 && first.answer.unresolved[0].includes("stale") && !first.answer.move.cites.includes(5), first.answer.unresolved);

// 6. The weekly brief renders the moves, the call and the hours back.
const brief = await call("engine_weekly_brief");
recorded.engine_weekly_brief = brief;
check("weekly brief", brief.markdown.includes("Move the 27 unused billing admins") && brief.markdown.includes("Hours back this quarter:** 21 security") && brief.markdown.includes("Overridden: Move the 27 unused") && !/fictional|synthetic|group:|sheets:/.test(brief.markdown) && brief.markdown.includes("Risk register says 12 for billing-admins holders; last updated 4 Mar, 223 days old. Not used."), brief.markdown.split("\n").slice(0, 6).join(" | "));

await client.close();
const out = process.argv.indexOf("--record");
if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(recorded, null, 2));
for (const r of results) console.log(`${r.ok ? "VERIFIED    " : "NOT VERIFIED"}  ${r.check}${r.ok ? "" : `: ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks verified`);
process.exit(failed ? 1 : 0);
