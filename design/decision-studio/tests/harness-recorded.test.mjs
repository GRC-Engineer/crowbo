import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The harness page renders recorded engine output as it is. These checks hold
// the recording to the contract the page relies on, so a re-recording that
// breaks it fails here instead of on screen.
const recorded = JSON.parse(
  readFileSync(
    new URL("../src/harness/engine-recorded.json", import.meta.url),
    "utf8",
  ),
);
const decide = recorded.engine_decide;
const drafts = recorded.engine_draft_followups;
const known = new Set(decide.sources.map((source) => source.n));

test("the recording is synthetic and drafts are never sent", () => {
  assert.equal(decide.synthetic, true);
  assert.equal(drafts.sent, false);
});

test("every citation points at a source the engine read", () => {
  const cited = [
    ...decide.answer.finding.flatMap((part) => part.cites),
    ...decide.answer.move.cites,
    ...decide.answer.due.cites,
    ...drafts.drafts.flatMap((draft) => draft.cites),
    ...decide.sources.flatMap((source) => source.conflicts_with ?? []),
  ];
  assert.deepEqual(
    cited.filter((n) => !known.has(n)),
    [],
  );
});

test("stale evidence carries its reason and is left open", () => {
  const stale = decide.sources.filter((source) => source.freshness === "stale");
  assert.ok(stale.length > 0);
  for (const source of stale) assert.ok(source.stale_reason);
  assert.ok(decide.answer.unresolved.length > 0);
});

test("the page never calls the demo a case study", () => {
  for (const file of ["../src/harness/harness.tsx", "../src/harness/exchange.ts"])
    assert.doesNotMatch(
      readFileSync(new URL(file, import.meta.url), "utf8"),
      /case study/i,
    );
});
