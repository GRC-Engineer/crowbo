// Score a private evaluation set: reviewer agreement, extraction accuracy and misbinding per fact,
// how cases split across tiers, and the kill rule. The report hash is what an evaluation gate
// cites as evidence. Case files stay private (outside any checkout, mode 600).
// Usage: bun scripts/eval.ts /absolute/private/path/cases.json [--report /absolute/private/path/report.json]
import { score } from "../src/eval/score";
import { readPrivate, writePrivateNew } from "../src/cli/private";

const [path, flag, reportPath] = process.argv.slice(2);
if (!path || (flag && flag !== "--report") || (flag && !reportPath)) {
  console.error("usage: bun scripts/eval.ts <cases.json> [--report <report.json>]");
  process.exit(2);
}
const result = score(JSON.parse(new TextDecoder().decode(readPrivate(path, 5_000_000))));
if (reportPath) writePrivateNew(reportPath, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    verdict: result.verdict,
    reasons: result.reasons,
    cases: result.cases,
    fully_agreed_cases: result.fully_agreed_cases,
    deciding: result.deciding,
    settled_by_rules_on_gold: result.tiers.settled_by_rules_on_gold,
    gold_vs_extracted_agreement: result.rules.gold_vs_extracted_agreement,
    report_hash: result.report_hash,
  }),
);
process.exit(result.verdict === "pass" ? 0 : 2);
