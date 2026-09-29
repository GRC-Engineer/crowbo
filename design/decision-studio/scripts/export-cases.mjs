import { readFile, writeFile } from "node:fs/promises";
import { demoCases } from "../src/question-demo-model.ts";
import { workflowCases } from "../src/workflow-cases.ts";
import {
  accessAdvice,
  basisLabels,
  versionSources,
  availableFollowups,
  revisionReasons,
} from "../src/access-review-model.ts";
import { familyCoverage, sourceFamilies } from "../src/source-families.ts";

const access = {
  id: "access",
  specVersion: "1.0.0",
  label: demoCases.access.label,
  question: demoCases.access.question,
  scope: demoCases.access.scope,
  initialStage: "daily",
  stages: Object.keys(accessAdvice).map((basis) => ({
    id: basis,
    label: basisLabels[basis],
    advice: accessAdvice[basis],
    change:
      basis === "daily" ? "Initial selected basis." : revisionReasons[basis],
    sources: versionSources({ number: 1, basis }),
    options: availableFollowups(basis).map((prompt) =>
      prompt.action.type === "challenge"
        ? "recovery-known"
        : prompt.action.status,
    ),
  })),
};
const cases = [workflowCases.remediation, access, workflowCases.exceptions];
const checkOnly = process.argv.includes("--check");
for (const entry of cases) {
  const sourceRecords = new Map();
  const ref = (source) => {
    const key = `${source.id}@${source.revision}`;
    const previous = sourceRecords.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(source))
      throw new Error(`Conflicting source revision: ${key}`);
    sourceRecords.set(key, source);
    return key;
  };
  const stages = entry.stages.map(({ sources, ...stage }) => ({
    ...stage,
    sourceRefs: sources.map(ref),
  }));
  const packet = {
    schemaVersion: "crowbo.synthetic-workflow.v1",
    provenance: {
      author: "Codex synthetic development fixture",
      humanReview: "Not yet qualified",
      status:
        "Candidate authored advice; not a backend run or evaluation answer key",
      data: "Fictional Acme records. No customer material.",
      influence: "Authored categories only; no measured weights or confidence.",
    },
    id: entry.id,
    specVersion: entry.specVersion,
    question: entry.question,
    scope: entry.scope,
    initialStage: entry.id === "access" ? "daily" : "open",
    alternatives:
      entry.id === "access"
        ? demoCases.access.alternatives
        : entry.alternatives,
    challenge:
      entry.id === "access" ? demoCases.access.challenge : entry.challenge,
    stages,
    irrelevantOverlay:
      entry.id === "access"
        ? null
        : {
            sourceRef: ref(entry.irrelevant),
            behavior:
              "Append this source to the selected stage; preserve its advice and all conditions. Explicit reassessment only. Do not append twice.",
          },
    sourceRecords: Object.fromEntries(sourceRecords),
    sourceFamilies: sourceFamilies.map(({ id, question, limit }) => ({
      id,
      question,
      limit,
      coverage: familyCoverage[entry.id][id],
    })),
    replayBoundary:
      "Use this packet for development replay only. Backend run receipts and differences must be retained separately; the frontend does not call backend tools.",
  };
  const path = new URL(`../fixtures/${entry.id}.v1.json`, import.meta.url);
  const expected = JSON.stringify(packet, null, 2) + "\n";
  if (checkOnly) {
    if ((await readFile(path, "utf8")) !== expected)
      throw new Error(`${entry.id} packet drifted. Run npm run cases:export.`);
  } else await writeFile(path, expected);
}
console.log(
  checkOnly
    ? "Three shared case packets match their authored sources."
    : "Exported three versioned synthetic case packets.",
);
