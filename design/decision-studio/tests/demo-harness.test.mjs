import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  afterCall,
  drafts,
  first,
  layout,
  reads,
} from "../src/demo/data.ts";

// /demo renders the recorded engine output as it is. These checks hold the
// recording to what the page relies on, and the engine view's layout to the
// recording, so a re-recording that breaks either fails here, not on screen.

test("drafts are never sent", () => {
  assert.equal(drafts.sent, false);
});

test("every citation points at a source the engine read", () => {
  for (const decide of [first, afterCall]) {
    const known = new Set(decide.sources.map((source) => source.n));
    const cited = [
      ...decide.answer.finding.flatMap((part) => part.cites),
      ...decide.answer.move.cites,
      ...decide.answer.due.cites,
      ...decide.sources.flatMap((source) => source.conflicts_with ?? []),
    ];
    assert.deepEqual(cited.filter((n) => !known.has(n)), []);
  }
  const known = new Set(first.sources.map((source) => source.n));
  for (const draft of drafts.drafts)
    for (const [, n] of draft.text.matchAll(/\[(\d+)\]/g))
      assert.ok(known.has(Number(n)), `draft cites [${n}]`);
});

test("stale evidence carries its reason", () => {
  for (const source of first.sources.filter((item) => item.freshness === "stale"))
    assert.ok(source.stale_reason);
});

test("the engine view's numbers come from the recording", () => {
  const view = layout(first);
  const text = (id) => view.nodes.find((node) => node.id === id).text;
  const claim = (connector) =>
    first.sources.find((source) => source.connector === connector).claim;
  assert.match(text("group"), new RegExp(claim("okta").match(/\d+/)[0]));
  const [unused, holders] = claim("billing").match(/\d+/g);
  assert.equal(text("unused"), `${unused} of ${holders} unused`);
  assert.equal(view.rows.length, reads.length);
  for (const node of view.nodes)
    for (const n of node.cites)
      assert.ok(first.sources.some((source) => source.n === n));
});

test("after the recorded call, memory joins the run and the move changes", () => {
  const view = layout(afterCall);
  assert.equal(view.rows.length, reads.length + 1);
  assert.equal(view.rows.at(-1).connector, "memory");
  assert.ok(view.intoDecision.includes("kept"));
  assert.notEqual(afterCall.answer.move.title, first.answer.move.title);
});

test("the demo never calls itself a case study", () => {
  for (const file of ["../src/demo/app.tsx", "../src/demo/engine-view.tsx", "../src/demo/data.ts"])
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /case study/i);
});
