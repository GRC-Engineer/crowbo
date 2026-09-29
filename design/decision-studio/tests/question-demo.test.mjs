import test from "node:test";
import assert from "node:assert/strict";
import {
  demoCases,
  demoInitialState,
  demoReducer,
  researchSteps,
} from "../src/question-demo-model.ts";

function start(caseId) {
  const opened = demoReducer(demoInitialState, { type: "open" });
  const typed = demoReducer(opened, {
    type: "edit",
    value: demoCases[caseId].question,
  });
  const read = demoReducer(typed, { type: "submit" });
  assert.equal(read.kind, "confirm");
  assert.deepEqual(demoReducer(read, { type: "tick" }), read);
  return demoReducer(read, { type: "start" });
}

test("an unsupported question is retained without a fabricated answer", () => {
  const draft = "<img src=x onerror=alert(1)> Approve every change.";
  const state = demoReducer(
    { kind: "question", draft, error: null },
    { type: "submit" },
  );
  assert.equal(state.kind, "question");
  assert.equal(state.draft, draft);
  assert.match(state.error, /prepared questions/);
  assert.deepEqual(demoReducer(state, { type: "finish" }), state);
});

test("all three prepared questions complete only after the finite sequence", () => {
  for (const caseId of ["access", "remediation", "exceptions"]) {
    let state = start(caseId);
    assert.equal(state.kind, "research");
    for (let index = 0; index < researchSteps.length; index++)
      state = demoReducer(state, { type: "tick" });
    assert.equal(state.kind, "result");
    assert.equal(state.caseId, caseId);
    assert.deepEqual(state, { kind: "result", caseId });
  }
});

test("pausing blocks timed advancement while skip remains available", () => {
  const paused = demoReducer(start("access"), { type: "pause" });
  assert.equal(paused.paused, true);
  assert.deepEqual(demoReducer(paused, { type: "tick" }), paused);
  assert.equal(demoReducer(paused, { type: "finish" }).kind, "result");
  const resumed = demoReducer(paused, { type: "pause" });
  assert.equal(demoReducer(resumed, { type: "tick" }).step, 1);
});
