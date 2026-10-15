import { type ChatModel, claudeHaiku, glmFlash, secret, workersAiRest } from "./ai";
import { CONNECTORS } from "./connectors";
import { Engine, type EngineOptions } from "./engine";
import { CLEF, clefExtractor, scriptedExtractor, type WorkersAi } from "./extract";
import { NORTHWIND, NORTHWIND_CLEF_QUESTIONS, NORTHWIND_MODEL_LABELS } from "./fixture";
import { NORTHWIND_KB_MODEL_LABELS } from "./kb-fixture";

/** The demo engine: real connectors over the fake APIs; Clef for prose when Workers AI is available. */
export function demoOptions(ai?: WorkersAi, ingestModel = CLEF, answerer: ChatModel | null = null): EngineOptions {
  return {
    connectors: CONNECTORS,
    proseExtractors: [ai ? clefExtractor(ai, NORTHWIND_CLEF_QUESTIONS, ingestModel) : scriptedExtractor({ ...NORTHWIND_MODEL_LABELS, ...NORTHWIND_KB_MODEL_LABELS })],
    answerer,
  };
}

export const startDemo = (ai?: WorkersAi, ingestModel?: string, answerer: ChatModel | null = null) => {
  const options = demoOptions(ai, ingestModel, answerer);
  return Engine.start(structuredClone(NORTHWIND), options).then((engine) => ({ engine, options }));
};

/**
 * Models for the local server, from the environment or the Keychain: Workers AI (Clef for ingestion,
 * GLM-5.3-flash for answering) needs crowbo/workers-ai and crowbo/cf-account; Haiku 5.5 needs
 * crowbo/anthropic. CROWBO_INGEST_MODEL and CROWBO_ANSWER_MODEL (glm | haiku) choose between them.
 * CROWBO_OFFLINE=1 uses no model and reads no Keychain entry, so a check replays the recorded demo.
 */
export function localModels(env: Record<string, string | undefined>) {
  if (env.CROWBO_OFFLINE === "1") return { ai: undefined, ingestModel: env.CROWBO_INGEST_MODEL || CLEF, answerer: null };
  const token = secret(env.CLOUDFLARE_AI_TOKEN, "crowbo/workers-ai");
  const account = secret(env.CLOUDFLARE_ACCOUNT_ID, "crowbo/cf-account");
  const anthropic = secret(env.ANTHROPIC_API_KEY, "crowbo/anthropic");
  const ai = token && account ? workersAiRest(account, token) : undefined;
  const glm = token && account ? glmFlash(account, token) : null;
  const haiku = anthropic ? claudeHaiku(anthropic) : null;
  const answerer = env.CROWBO_ANSWER_MODEL === "haiku" ? (haiku ?? glm) : (glm ?? haiku);
  return { ai, ingestModel: env.CROWBO_INGEST_MODEL || CLEF, answerer };
}
