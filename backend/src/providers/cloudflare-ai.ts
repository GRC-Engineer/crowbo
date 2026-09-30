import { assessment as assessmentSchema, type Assessment, revisionId, type SourceRevision } from "../domain/contracts";
import { CrowboError } from "../domain/errors";
import { DEFAULT_QUESTIONS, type QuestionSet } from "../domain/questions";
import { now } from "../domain/time";
import type { Assessor, Ledger } from "../services/ports";
import { type FetchLike, fixedHostFetch, withTimeout } from "./http";

export type CloudflareAi = { account: string; gateway: string; token: string; fetch?: FetchLike };

export function cloudflareHeaders(ai: CloudflareAi): Record<string, string> {
  return {
    Authorization: `Bearer ${ai.token}`,
    "Content-Type": "application/json",
    "cf-aig-gateway-id": ai.gateway,
    "cf-aig-collect-log": "false",
    "cf-aig-collect-log-payload": "false",
    "cf-aig-skip-cache": "true",
    "cf-aig-max-attempts": "1",
  };
}

/** Jev over Cloudflare's model route: typed answers to fixed questions about one revision. */
export class Jev implements Assessor {
  private readonly http: FetchLike;

  constructor(
    private readonly ai: CloudflareAi,
    private readonly ledger: Ledger,
    private readonly questions: QuestionSet = DEFAULT_QUESTIONS,
  ) {
    this.http = ai.fetch ?? fixedHostFetch("api.cloudflare.com", 131072);
  }

  async assess(source: SourceRevision): Promise<Assessment> {
    const call = await this.ledger.reserve("jev", "assess");
    const started = performance.now();
    try {
      const response = await this.http(`https://api.cloudflare.com/client/v4/accounts/${this.ai.account}/ai/run`, {
        method: "POST",
        headers: cloudflareHeaders(this.ai),
        body: JSON.stringify({ model: "typesafe/jev", input: { state: source, questions: this.questions.questions } }),
        ...withTimeout(30_000),
      });
      await this.ledger.receipt(call, { http_status: response.status });
      if (response.status !== 200) throw new CrowboError(`Jev request failed with HTTP ${response.status}`);
      const payload = (await response.json()) as any;
      if (!payload || typeof payload !== "object" || payload.success !== true || (payload.errors && payload.errors.length)) {
        throw new CrowboError("Jev returned an unsuccessful response");
      }
      let data = payload.result;
      if (data && typeof data === "object" && "result" in data) {
        const state = data.state;
        if (typeof state !== "string" || !["completed", "complete", "succeeded", "success"].includes(state.toLowerCase())) {
          throw new CrowboError("Jev did not complete synchronously");
        }
        data = data.result;
      }
      const result = assessmentSchema.parse({
        source_revision: revisionId(source),
        criteria_version: this.questions.version,
        criteria_hash: this.questions.fingerprint,
        returned_model: data.model,
        answers: data.answers,
        questions: this.questions.questions,
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
        elapsed_seconds: (performance.now() - started) / 1000,
        assessed_at: now(),
      });
      this.questions.check(result);
      await this.ledger.receipt(call, {
        http_status: 200,
        model: result.returned_model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        elapsed_seconds: result.elapsed_seconds,
      });
      return result;
    } catch (error) {
      if (error instanceof CrowboError) throw error;
      throw new CrowboError("Jev transport or typed-response validation failed");
    }
  }
}
