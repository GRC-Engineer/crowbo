// Port of tests/test_decision_page.py. Python's export_decision_page rendered and wrote in one
// call; in TS the API renders (export_decision) and the CLI writes the returned HTML with
// writePrivateNew, so the export half exercises that writer with the rendered markup.
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/app/operations";
import { exportableVersions, renderDecisionPage } from "../../src/app/decision-page";
import { writePrivateNew } from "../../src/cli/private";
import type { SourceInput } from "../../src/domain/contracts";
import { decisionRequest } from "../../src/domain/decision-request";
import { settings as settingsSchema } from "../../src/domain/settings";
import { Decision } from "../../src/services/decision";
import type { Evidence } from "../../src/services/evidence";
import { makeEngine, makeItem, MemoryLedger, withSource } from "../helpers";
import { chatResponse, configured, modelFor, mutate, reply } from "../services/decision-fixtures";

let tmp: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "crowbo-page-")));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

// tests/test_access.py fixtures (SUBJECT, TEXT, access_answer, setup_access, response).
const SUBJECT = { system: "ReportingDB", account_id: "svc-reports@example.test", scope: "org-demo/project-A" };
const IDENTITY = "Account svc-reports@example.test belongs to ReportingDB org-demo/project-A.";
const WORK = "This account must export the daily report.";
const CURRENT = "Its current Administrator role completes the daily export.";
const PASSED = "The project-scoped Reader role passed all required export tasks.";
const TEXT = `${IDENTITY} ${WORK} ${CURRENT} ${PASSED} Custodian: owner@example.test. No deadline is assigned.`;
const stated = (value: string, quote: string) => ({ state: "stated", value, citations: [{ evidence_id: "E1", quote }] });

function accessAnswer() {
  return {
    recommendation: "Recommend Reader after separate owner approval and a reversible cutover.",
    rationale: "The narrower role passed the required export [E1].",
    alternatives: ["Retain Administrator while approval is pending."],
    uncertainties: ["No approver or deadline is established."],
    evidence_ids: ["E1"],
    access_facts: {
      subject: { ...SUBJECT },
      identity: stated("Exact account and scope are stated", IDENTITY),
      required_work: stated("Daily report export", WORK),
      current_access: stated("Administrator", CURRENT),
      custodian: { identifier: "owner@example.test", citation: { evidence_id: "E1", quote: "Custodian: owner@example.test." } },
      approval_authority: null,
      deadline: null,
      options: [
        {
          kind: "retain",
          description: "Keep Administrator",
          workflow_fit: "supported",
          basis: stated("Current role works", CURRENT),
          exposure_change: "No reduction",
          operational_cost: "No migration",
          conditions: ["Separate approval"],
          reverses_when: "A narrower option is verified",
        },
        {
          kind: "reduce",
          description: "Use project Reader",
          workflow_fit: "supported",
          basis: stated("All required tasks passed", PASSED),
          exposure_change: "Less write access",
          operational_cost: "One reversible role change",
          conditions: ["Separate approval"],
          reverses_when: "Required work needs writes",
        },
      ],
      selected_option: "reduce",
    },
  };
}

async function setupAccess(engine: Evidence, item: SourceInput) {
  const [bound, request] = await configured(engine, withSource(item, { text: TEXT }));
  mutate(engine, { settings: settingsSchema.parse({ ...engine.settings, query_processors: [...engine.settings.query_processors, "jev"] }) });
  return [bound, decisionRequest.parse({ ...request, access: SUBJECT, method: "crowbo_without_jev" })] as const;
}

describe("private decision page", () => {
  it("py: tests/test_decision_page.py::test_private_page_uses_saved_evidence_escapes_text_and_does_not_overwrite", async () => {
    const { engine } = makeEngine();
    const [, request] = await configured(engine, makeItem());
    const result: Record<string, any> = await new Decision(engine, modelFor(engine, () => reply())).run(request);
    result.answer.recommendation = '<script>fetch("https://example.org/leak")</script>';
    result.evidence[0].source.title = "<img src=x onerror=alert(1)>";
    result.evidence[0].source.source_url = 'https://example.org/?x=" onclick="alert(1)';
    const markup = renderDecisionPage([result], []);
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<img ");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("&quot; onclick=&quot;");
    expect(markup).toContain("default-src 'none'");
    expect(markup).toContain("cannot enforce later permission changes");
    for (const section of ["nest", "flock", "feathers", "flight-log"]) expect(markup).toContain(`id="${section}"`);
    expect(markup).toContain("Owner requests an access review");
    const target = join(tmp, "private.html");
    const exported = renderDecisionPage(exportableVersions([result]), []);
    writePrivateNew(target, exported);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(() => writePrivateNew(target, "replacement")).toThrow(expect.objectContaining({ code: "EEXIST" }));
    expect(readFileSync(target, "utf8")).toBe(exported);
    expect(() => writePrivateNew(join(process.cwd(), "private.html"), markup)).toThrow("Private runtime files must be outside the development checkout");
  });

  it("export requires versions of one decision case and renders them oldest first", async () => {
    const { engine, store } = makeEngine();
    const [, request] = await configured(engine, makeItem());
    const model = modelFor(engine, () => reply());
    const first = await new Decision(engine, model).run(request);
    const second = await new Decision(engine, model).run(decisionRequest.parse({ ...request, case_version: "2" }));
    const other = await new Decision(engine, model).run(decisionRequest.parse({ ...request, case_id: "another-case" }));
    expect(exportableVersions([second, first]).map((r) => r.id)).toEqual([first.id, second.id]);
    expect(() => exportableVersions([first, other])).toThrow("Export requires saved versions of one decision case");
    const ctx = {
      caller: { settings: engine.settings, roles: ["operator"] },
      store,
      ledger: new MemoryLedger(),
      ai: { account: engine.settings.cloudflare_account, gateway: engine.settings.gateway, token: null },
      slackToken: null,
      allowSyntheticGates: false,
    };
    expect(await run(ctx, "export_decision", { ids: [first.id, other.id] })).toEqual({ ok: false, error: "Export requires saved versions of one decision case" });
    const exported = await run(ctx, "export_decision", { ids: [second.id, first.id] });
    expect(exported.ok).toBe(true);
    expect((exported as { result: any }).result.versions).toBe(2);
  });

  it("py: tests/test_decision_page.py::test_private_access_page_renders_options_and_escapes_interpretations", async () => {
    const { engine } = makeEngine();
    const [, request] = await setupAccess(engine, makeItem());
    const result: Record<string, any> = await new Decision(engine, modelFor(engine, () => chatResponse(accessAnswer()))).run(request);
    result.decision.access_facts.options[1].description = "<script>Reader</script>";
    const markup = renderDecisionPage([result], []);
    expect(markup).toContain("svc-reports@example.test");
    expect(markup).toContain("&lt;script&gt;Reader&lt;/script&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("approval authority: Unresolved");
    expect(markup).toContain("Deadline: Unresolved");
    expect(markup).not.toContain("No structured facts");
    expect(markup).toContain("default-src 'none'");
  });
});
