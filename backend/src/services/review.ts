import { z } from "zod";
import { type AccessSubject, accessSubject, bindAccessFacts } from "../domain/access";
import { digest } from "../domain/canonical";
import { type EvidenceView, logicalId, revisionId, sourceRevision } from "../domain/contracts";
import { CrowboError } from "../domain/errors";
import { bindDecidingFacts, type EvidenceEntry } from "../domain/facts";
import { assessmentId, DEFAULT_QUESTIONS } from "../domain/questions";
import {
  ANSWER_TYPES,
  accessValidationDetails,
  promptFor,
  type ReviewRequest,
  responseReceipt,
  reviewRequest,
} from "../domain/review";
import { now } from "../domain/time";
import { type CloudflareAi, cloudflareHeaders } from "../providers/cloudflare-ai";
import { type FetchLike, fixedHostFetch, isTimeout, withTimeout } from "../providers/http";
import type { Evidence } from "./evidence";
import type { Ledger } from "./ports";
import { scopeVersions } from "./sync";

type Answer = z.infer<(typeof ANSWER_TYPES)[keyof typeof ANSWER_TYPES]>;
type Decision = Record<string, any>;

/** One checked reasoning call. The model is untrusted: every citation and quote is re-bound. */
export class Reasoner {
  private readonly http: FetchLike;

  constructor(
    readonly ai: CloudflareAi,
    readonly ledger: Ledger,
    readonly queryProcessors: readonly string[],
  ) {
    this.http = ai.fetch ?? fixedHostFetch("api.cloudflare.com", 262144);
  }

  async propose(request: ReviewRequest, evidence: EvidenceEntry[], options: { decision?: Decision } = {}) {
    const decision = options.decision;
    if (!this.queryProcessors.includes(request.model)) throw new CrowboError("Reasoning route is not permitted for this request");
    const access = request.answer_format === "access";
    if (access && !decision?.request?.access) throw new CrowboError("Access reasoning requires a bound decision subject");
    let modelDecision = decision;
    if (access) {
      const { input_fingerprint: _f, assessment_at: _a, bindings: _b, ...rest } = decision!;
      const { method: _m, case_id: _c, case_version: _v, expected_revisions: _e, source_ids: _s, ...req } = decision!.request;
      modelDecision = { ...rest, request: req };
      if (!request.include_jev) delete modelDecision.access_assessments;
    }
    const strip = (entry: EvidenceEntry) => {
      const { assessment: _a, assessment_current: _c, ...rest } = entry;
      return rest;
    };
    const payload = {
      question: request.question,
      operator_context: request.context,
      selected_evidence: request.include_jev && !access ? evidence : evidence.map(strip),
      ...(modelDecision !== undefined ? { decision: modelDecision } : {}),
    };
    const content = JSON.stringify(payload);
    if (new TextEncoder().encode(content).length > 250_000) throw new CrowboError("Review input exceeds the configured size limit");
    const common = JSON.parse(content);
    if (access) delete common.decision.access_assessments;
    const inputReceipt = access ? { user_message_hash: digest(content), common_payload_hash: digest(common) } : {};
    const call = await this.ledger.reserve(request.model, "review");
    try {
      const response = await this.http(`https://api.cloudflare.com/client/v4/accounts/${this.ai.account}/ai/v1/chat/completions`, {
        method: "POST",
        headers: cloudflareHeaders(this.ai),
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: promptFor(request) },
            { role: "user", content },
          ],
          reasoning_effort: request.reasoning_effort,
          max_completion_tokens: request.max_completion_tokens,
          response_format: { type: "json_object" },
          store: false,
          stream: false,
        }),
        ...withTimeout(120_000),
      });
      await this.ledger.receipt(call, { http_status: response.status });
      if (response.status !== 200) throw new CrowboError(`Reasoning request failed with HTTP ${response.status}`);
      let data = (await response.json()) as any;
      if (data && typeof data === "object" && "success" in data) {
        if (data.success !== true || (data.errors && data.errors.length)) {
          throw new CrowboError("Reasoning provider returned an unsuccessful response");
        }
        data = data.result;
      }
      const receipt: Record<string, any> = { ...responseReceipt(request, data), ...inputReceipt };
      await this.ledger.receipt(call, receipt);
      const choices = data.choices;
      if (choices.length !== 1 || choices[0].finish_reason !== "stop") {
        const reason = choices.length === 1 ? receipt.finish_reasons[0] : "unexpected";
        throw new CrowboError(`Reasoning response did not finish successfully (${reason})`);
      }
      const message = choices[0].message;
      if ((message.tool_calls && message.tool_calls.length) || message.refusal) {
        throw new CrowboError("Reasoning response contains no usable recommendation");
      }
      if (data.model !== request.model && data.model !== request.model.split("/").at(-1)) {
        throw new CrowboError("Reasoning provider returned an unexpected model");
      }
      const schema = ANSWER_TYPES[request.answer_format];
      let raw: unknown;
      try {
        raw = JSON.parse(message.content);
      } catch {
        raw = undefined;
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const categories = [...new Set(parsed.error.issues.map((i) => i.code))].sort();
        await this.ledger.receipt(call, {
          ...receipt,
          validation: {
            count: parsed.error.issues.length,
            types: categories,
            ...(access ? { details: accessValidationDetails(parsed.error) } : {}),
          },
        });
        throw new CrowboError("Reasoning answer failed schema validation: " + categories.join(", "));
      }
      const answer = parsed.data as Answer;
      const labels = new Set(evidence.map((e) => e.id));
      if (!answer.evidence_ids.every((id) => labels.has(id))) throw new CrowboError("Recommendation cites evidence that was not supplied");
      const serialized = JSON.stringify(answer);
      const mentioned = new Set([...serialized.matchAll(/\[(E\d+)\]/g)].map((m) => m[1]));
      if (!mentioned.size || ![...mentioned].every((m) => answer.evidence_ids.includes(m)) || /\[P\d+\]/.test(serialized)) {
        throw new CrowboError("Recommendation contains missing or inconsistent citations");
      }
      if ("deciding_facts" in answer) bindDecidingFacts(answer.deciding_facts, evidence, answer.evidence_ids);
      if ("access_facts" in answer) bindAccessFacts(answer.access_facts, accessSubject.parse(decision!.request.access), evidence, answer.evidence_ids);
      return { answer, receipt };
    } catch (error) {
      if (isTimeout(error)) {
        await this.ledger.receipt(call, { requested_model: request.model, error: "timeout" });
        throw new CrowboError("Reasoning request timed out");
      }
      if (error instanceof CrowboError) throw error;
      throw new CrowboError("Reasoning transport or response validation failed");
    }
  }
}

export interface Proposer {
  propose(request: ReviewRequest, evidence: EvidenceEntry[], options?: { decision?: Decision }): Promise<{ answer: any; receipt: any }>;
}

export class Review {
  constructor(
    readonly evidence: Evidence,
    readonly reasoner: Proposer | null,
  ) {}

  run(request: ReviewRequest) {
    return this.runSnapshot(reviewRequest.parse(request));
  }

  async runSnapshot(
    request: ReviewRequest,
    views?: EvidenceView[],
    options: { decision?: Decision; checkSnapshot?: () => Promise<void> } = {},
  ): Promise<Record<string, any>> {
    const { decision } = options;
    const processors = this.evidence.settings.query_processors;
    if (!processors.includes("turbopuffer") || !processors.includes(request.model)) {
      throw new CrowboError("Review storage or reasoning route is not permitted for this request");
    }
    views ??= await this.evidence.inspectMany(request.source_ids);
    const selected = views;
    const check = options.checkSnapshot ?? (() => this.evidence.checkProcessingMany(selected, request.model));
    if (!decision) await check();
    const scopes = await scopeVersions(this.evidence, selected.flatMap((v) => (v.sync_id ? [v.sync_id] : [])), { requireReady: true });
    const inputs: EvidenceEntry[] = selected.map((view, i) => {
      const entry: EvidenceEntry = { id: `E${i + 1}`, ...structuredClone(view) };
      const a = view.assessment;
      if (a && !Object.keys(a.questions).length && a.criteria_hash === DEFAULT_QUESTIONS.fingerprint) {
        (entry.assessment as any).questions = DEFAULT_QUESTIONS.questions;
      }
      return entry;
    });
    const sameScopes = async () => digest(await scopeVersions(this.evidence, Object.keys(scopes), { requireReady: true })) === digest(scopes);
    if (!this.reasoner) throw new CrowboError("Reasoning is not configured for this operation");
    let proposal;
    if (!decision) proposal = await this.reasoner.propose(request, inputs);
    else {
      await check();
      if (!(await sameScopes())) throw new CrowboError("Evidence coverage changed before reasoning");
      proposal = await this.reasoner.propose(request, inputs, { decision });
    }
    await check();
    if (!(await sameScopes())) throw new CrowboError("Evidence coverage changed during reasoning");
    const { answer, receipt } = proposal;
    const body: Record<string, any> = {
      kind: "review",
      tenant: this.evidence.settings.tenant,
      reader: this.evidence.settings.reader,
      request,
      evidence: inputs,
      answer,
      provider: receipt,
      prompt_hash: digest(promptFor(request)),
      answer_schema_hash: digest(z.toJSONSchema(ANSWER_TYPES[request.answer_format], { io: "input", unrepresentable: "any" })),
      source_input_hash: digest(inputs.map(({ assessment: _a, assessment_current: _c, ...rest }) => rest)),
      created_at: now(),
      population_complete: false,
      feasibility_checked: false,
      simulated: true,
    };
    if (Object.keys(scopes).length) body.sync_scopes = scopes;
    if (decision) {
      body.decision = {
        ...decision,
        ...("deciding_facts" in answer ? { deciding_facts: bindDecidingFacts(answer.deciding_facts, inputs, answer.evidence_ids) } : {}),
      };
      if ("access_facts" in answer) {
        body.decision.access_facts = bindAccessFacts(answer.access_facts, accessSubject.parse(decision.request.access), inputs, answer.evidence_ids);
      }
    }
    const id = digest(["review", body]);
    await this.evidence.store.put(id, "review", body, { insertOnly: true });
    if (!decision) {
      await check();
      if (!(await sameScopes())) throw new CrowboError("Evidence coverage changed before review return");
    }
    const result = await this.inspect(id);
    if (decision) {
      await check();
      if (!(await sameScopes())) throw new CrowboError("Evidence coverage changed before decision return");
    }
    return result;
  }

  async inspect(id: string): Promise<Record<string, any>> {
    const body = await this.evidence.store.get(id);
    if (!body || body.kind !== "review") throw new CrowboError("Review is unavailable");
    if (body.tenant !== this.evidence.settings.tenant || body.reader !== this.evidence.settings.reader || digest(["review", body]) !== id) {
      throw new CrowboError("Review is unavailable");
    }
    const request = reviewRequest.parse(body.request);
    if (body.evidence.length !== request.source_ids.length) throw new CrowboError("Review evidence is incomplete");
    const sources = request.source_ids.map((key, i) => {
      const source = sourceRevision.parse(body.evidence[i].source);
      if (logicalId(source) !== key) throw new CrowboError("Review source reference mismatch");
      return source;
    });
    const heads = await this.evidence.authorizeHistoryMany(sources);
    let current = true;
    sources.forEach((source, i) => {
      const h = heads[i];
      if (h.withdrawn) throw new CrowboError("A contributing source has been withdrawn");
      current &&= !h.conflicted && h.revision_id === revisionId(source);
      const old = body.evidence[i].assessment;
      const expected = old ? assessmentId(revisionId(source), old.criteria_version, old.criteria_hash) : null;
      if (request.answer_format !== "access") current &&= h.assessment_id === expected;
    });
    if (body.sync_scopes) current &&= digest(await scopeVersions(this.evidence, Object.keys(body.sync_scopes))) === digest(body.sync_scopes);
    return { id, evidence_unchanged: current, ...body };
  }
}

export type { AccessSubject };
