// Shared helpers from tests/test_decision.py (configured, reply, model_for, risk_data), also
// imported by the access tests exactly as the Python access tests imported them.
import { logicalId, revisionId, type SourceInput } from "../../src/domain/contracts";
import { type DecisionRequest, decisionRequest } from "../../src/domain/decision-request";
import { settings as settingsSchema } from "../../src/domain/settings";
import { localDate } from "../../src/domain/time";
import type { Evidence } from "../../src/services/evidence";
import { Reasoner } from "../../src/services/review";
import { addMicros, batch, DAY, MemoryLedger, now, withGrant } from "../helpers";

export const MODEL = "@cf/zai-org/glm-5.3-flash";

/** Python assigned `engine.settings = ...` / `engine.questions = ...`; the fields are readonly in TS. */
export function mutate(engine: Evidence, update: Partial<Pick<Evidence, "settings" | "questions">>) {
  Object.assign(engine, update);
}

export async function configured(engine: Evidence, item: SourceInput): Promise<[SourceInput, DecisionRequest]> {
  mutate(engine, { settings: settingsSchema.parse({ ...engine.settings, query_processors: ["turbopuffer", "voyage", MODEL] }) });
  item = withGrant(item, { processors: [...item.grant.processors, MODEL] });
  await engine.ingest(batch(item));
  const at = now();
  const request = decisionRequest.parse({
    case_id: "synthetic-review",
    question: "Which action should the owner take next?",
    source_ids: [logicalId(item.source)],
    expected_revisions: { [logicalId(item.source)]: revisionId(item.source) },
    subject: "Synthetic security programme",
    scope: "Fictional access review",
    window_start: localDate(at),
    window_end: localDate(addMicros(at, 14n * DAY)),
    objectives: ["Meet confirmed obligations, then reduce supported exposure"],
  });
  return [item, request];
}

export function factPayload() {
  const unknown = { state: "unknown", value: null, citations: [] };
  return {
    deliverables: [
      {
        title: "Synthetic access review",
        anchor: { evidence_id: "E1", quote: "Owner requests an access review; no obligation is stated." },
        ...Object.fromEntries(
          ["obligation", "deadline", "owner", "completion", "consequence", "nondeferral", "capacity"].map((name) => [name, unknown]),
        ),
      },
    ],
    jev_references: [{ evidence_id: "E1", question_id: "obligation_stated" }],
  };
}

export function chatResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({ model: "glm-5.3-flash", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export function reply({ structured = true } = {}): Response {
  return chatResponse({
    recommendation: "Ask the accountable owner to confirm the obligation and capacity.",
    rationale: "The invented source requests work but establishes no obligation [E1].",
    alternatives: ["Proceed with separately confirmed urgent work."],
    uncertainties: ["Neither obligation nor capacity is confirmed."],
    evidence_ids: ["E1"],
    ...(structured ? { deciding_facts: factPayload() } : {}),
  });
}

/** The HTTP request the reasoner sent: Python's `call.content`. */
export type Call = { url: string; content: string };

/** Python's `Reasoner(Runtime(settings), httpx.Client(MockTransport(handler)), token)`; the ledger replaces the calls table. */
export function modelFor(engine: Evidence, handler: (call: Call) => Response | Promise<Response>) {
  const ledger = new MemoryLedger();
  const reasoner = new Reasoner(
    {
      account: engine.settings.cloudflare_account,
      gateway: engine.settings.gateway,
      token: "test-token",
      fetch: async (url, init) => handler({ url, content: String(init?.body) }),
    },
    ledger,
    engine.settings.query_processors,
  );
  return Object.assign(reasoner, { ledger });
}

export function riskData(kind = "operator_assertion", sourceIds: string[] = []): Record<string, any> {
  const provenance = {
    kind,
    attributed_to: "Synthetic operator",
    basis: "Invented development inputs, not company estimates",
    source_ids: sourceIds,
  };
  return {
    scenario: "A fictional loss event",
    currency: "GBP",
    annual_frequency: { value: "0.2", low: "0.1", high: "0.3", provenance },
    mean_loss_per_event: { value: "12000.50", provenance },
  };
}
