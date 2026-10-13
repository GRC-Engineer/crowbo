import type { Extractor, Fact, SourceRecord, Value } from "./model";

/**
 * Layer 02a, classify: turn readable source text into typed facts about subjects. Every fact
 * must quote its source exactly; `bind` rejects anything else, whatever produced it. The
 * prototype has two extractors:
 *  - StructuredExtractor reads "subject predicate value" lines, standing in for connectors whose
 *    APIs return typed fields (Okta groups, GitHub settings, Workday teams).
 *  - ScriptedModelExtractor returns pre-written labels for prose (Slack), standing in for the LLM
 *    extractor. The real one is Jev or GLM, qualified on reviewed cases by eval/score.ts.
 */

const LINE = /^([a-z]+:[A-Za-z0-9._-]+) ([a-z][a-z0-9_]*) (.+)$/;

function parseValue(raw: string): Value {
  if (raw === "true" || raw === "false") return raw === "true";
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

export const structuredExtractor: Extractor = {
  id: "structured@1",
  extract(record) {
    return record.text.split("\n").flatMap((line) => {
      const m = LINE.exec(line.trim());
      return m ? [{ subject: m[1], predicate: m[2], value: parseValue(m[3]), quote: line.trim() }] : [];
    });
  },
};

/** Stand-in for a model: labels written in advance, keyed by record ID and revision. */
export function scriptedModelExtractor(labels: Record<string, Omit<Fact, "source" | "extractor">[]>): Extractor {
  return { id: "model-stand-in@1", extract: (record) => labels[`${record.id}@${record.revision}`] ?? [] };
}

/** Attach provenance and refuse any fact whose quote is not in the record's exact text. */
export function bind(record: SourceRecord, extractor: Extractor): { facts: Fact[]; rejected: number } {
  const facts: Fact[] = [];
  let rejected = 0;
  for (const f of extractor.extract(record)) {
    if (!f.quote || !record.text.includes(f.quote)) {
      rejected++;
      continue;
    }
    facts.push({ ...f, source: { record: record.id, revision: record.revision, connector: record.connector }, extractor: extractor.id });
  }
  return { facts, rejected };
}

export function extractAll(records: SourceRecord[], extractors: Extractor[]): { facts: Fact[]; rejected: number } {
  let rejected = 0;
  const facts = records.flatMap((r) =>
    extractors.flatMap((x) => {
      const out = bind(r, x);
      rejected += out.rejected;
      return out.facts;
    }),
  );
  return { facts, rejected };
}
