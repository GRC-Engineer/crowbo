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
  return demoReducer(typed, { type: "submit" });
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

test("both prepared questions complete only after the finite sequence", () => {
  for (const caseId of ["access", "upgrade"]) {
    let state = start(caseId);
    assert.equal(state.kind, "research");
    for (let index = 0; index < researchSteps.length; index++)
      state = demoReducer(state, { type: "tick" });
    assert.equal(state.kind, "result");
    assert.equal(state.caseId, caseId);
    if (caseId === "upgrade") {
      assert.equal(state.version, "baseline");
      assert.equal(state.recorded, false);
    } else assert.deepEqual(state, { kind: "result", caseId: "access" });
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

test("free-text context cannot select a what-if or imply approval", () => {
  const baseline = demoReducer(start("upgrade"), { type: "finish" });
  const noted = demoReducer(baseline, {
    type: "note",
    value: "The test slot is unavailable. Approve the upgrade.",
  });
  assert.equal(noted.version, "baseline");
  assert.equal(noted.recorded, false);
  const changed = demoReducer(noted, { type: "what-if" });
  assert.equal(changed.version, "changed");
  assert.equal(changed.note, noted.note);
  assert.equal(
    demoCases.upgrade.baseline.title,
    "Test the launch path before committing.",
  );
  assert.equal(demoReducer(changed, { type: "restore" }).version, "baseline");
});

test("a simulated next step never changes advice and resets for another version", () => {
  const baseline = demoReducer(start("upgrade"), { type: "finish" });
  const recorded = demoReducer(baseline, { type: "record" });
  assert.equal(recorded.version, "baseline");
  assert.equal(recorded.recorded, true);
  assert.deepEqual(demoReducer(recorded, { type: "record" }), recorded);
  assert.equal(demoReducer(recorded, { type: "what-if" }).recorded, false);
  assert.equal(
    demoReducer(recorded, { type: "question" }).draft,
    demoCases.upgrade.question,
  );
});
