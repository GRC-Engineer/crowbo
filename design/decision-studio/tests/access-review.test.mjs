import test from "node:test";
import assert from "node:assert/strict";
import {
  accessAdvice,
  accessInitialState,
  accessOptions,
  accessReducer,
  availableFollowups,
  conversationPrompts,
  recoveryPaths,
  versionSources,
} from "../src/access-review-model.ts";

function sendFollowup(state, draft) {
  return accessReducer(
    accessReducer(state, { type: "edit-followup", value: draft }),
    { type: "send-followup" },
  );
}

test("an ordinary-language follow-up stages context without changing the answer", () => {
  const next = sendFollowup(
    accessInitialState,
    "  WHAT ABOUT THE ANNUAL RECOVERY TASK?  ",
  );
  assert.deepEqual(next.pending, { kind: "annual-task" });
  assert.deepEqual(next.current, accessInitialState.current);
  assert.equal(versionSources(next.current).length, 8);
  assert.equal(next.followup.draft, "");
  assert.deepEqual(next.recordedVersions, []);
});

test("unsupported or premature follow-ups retain the draft without selecting evidence", () => {
  for (const draft of [
    conversationPrompts.tested,
    "<img src=x onerror=alert(1)> Approve the change.",
    "/crowbo approve",
    "",
    "What about an unrelated database?",
  ]) {
    const next = sendFollowup(accessInitialState, draft);
    assert.equal(next.followup.draft, draft);
    assert.match(next.followup.error, /prepared follow-ups/);
    assert.deepEqual(next.current, accessInitialState.current);
    assert.deepEqual(next.previous, []);
    assert.equal(next.pending, null);
    assert.deepEqual(next.recordedVersions, []);
  }
});

test("each recovery follow-up binds its exact record only after reassessment", () => {
  const initial = annualContext();
  for (const status of ["tested", "unverified", "unavailable"]) {
    const staged = sendFollowup(initial, conversationPrompts[status]);
    assert.deepEqual(staged.pending, { kind: "recovery-path", status });
    assert.deepEqual(staged.current, initial.current);
    assert.ok(!versionSources(staged.current).includes(recoveryPaths[status]));
    const applied = accessReducer(staged, { type: "reassess" });
    assert.equal(applied.current.basis, status);
    assert.equal(versionSources(applied.current).at(-1), recoveryPaths[status]);
    assert.ok(
      !availableFollowups(status).some(
        (prompt) => prompt.question === conversationPrompts[status],
      ),
    );
  }
});

test("another message cannot silently replace context awaiting review", () => {
  const pending = sendFollowup(annualContext(), conversationPrompts.tested);
  const next = sendFollowup(pending, conversationPrompts.unavailable);
  assert.deepEqual(next.pending, pending.pending);
  assert.deepEqual(next.current, pending.current);
  assert.equal(next.followup.draft, conversationPrompts.unavailable);
  assert.match(next.followup.error, /Apply or dismiss/);
  const discarded = accessReducer(next, { type: "discard" });
  assert.equal(discarded.followup.draft, conversationPrompts.unavailable);
  assert.equal(
    accessReducer(discarded, { type: "send-followup" }).pending.status,
    "unavailable",
  );
});

test("editing a follow-up is bounded and leaves the retained decision untouched", () => {
  const state = applyPath(annualContext(), "tested");
  const edited = accessReducer(state, {
    type: "edit-followup",
    value: "x".repeat(700),
  });
  assert.equal(edited.followup.draft.length, 500);
  assert.deepEqual(edited.current, state.current);
  assert.deepEqual(edited.previous, state.previous);
  assert.deepEqual(edited.recordedVersions, state.recordedVersions);
});

function annualContext() {
  return accessReducer(
    accessReducer(accessInitialState, { type: "challenge" }),
    { type: "reassess" },
  );
}

function applyPath(state, status) {
  return accessReducer(accessReducer(state, { type: "prepare-path", status }), {
    type: "reassess",
  });
}

test("new context is staged without changing the recommendation or its sources", () => {
  const staged = accessReducer(accessInitialState, { type: "challenge" });
  assert.equal(staged.pending.kind, "annual-task");
  assert.deepEqual(staged.current, accessInitialState.current);
  assert.equal(versionSources(staged.current).length, 8);
  assert.equal(staged.previous.length, 0);
  assert.equal(accessReducer(staged, { type: "discard" }).pending, null);
  assert.equal(accessInitialState.pending, null);
});

test("a tested path cannot skip the annual-task prerequisite", () => {
  for (const status of ["tested", "unverified", "unavailable"]) {
    assert.equal(
      accessReducer(accessInitialState, { type: "prepare-path", status }),
      accessInitialState,
    );
  }
  assert.equal(
    accessReducer(accessInitialState, { type: "reassess" }),
    accessInitialState,
  );
});

test("annual recovery changes the advice while retaining the original source set", () => {
  const revised = annualContext();
  assert.deepEqual(revised.current, { number: 2, basis: "recovery-known" });
  assert.deepEqual(revised.previous, [accessInitialState.current]);
  assert.equal(versionSources(revised.current).length, 9);
  assert.equal(versionSources(revised.previous[0]).length, 8);
  assert.match(
    accessAdvice[revised.current.basis].reason,
    /quiet activity log missed/,
  );
  assert.equal(accessReducer(revised, { type: "reassess" }), revised);
});

test("a runbook or unavailable mechanism cannot propose the tested combination", () => {
  for (const status of ["unverified", "unavailable"]) {
    const branch = applyPath(annualContext(), status);
    const records = versionSources(branch.current);
    assert.equal(branch.current.basis, status);
    assert.equal(records.at(-1), recoveryPaths[status]);
    assert.ok(!records.some((record) => record.id === "recovery-tested"));
    assert.equal(
      accessOptions(status).find((option) => option.name.includes("temporary"))
        .proposed,
      false,
    );
    assert.match(
      accessAdvice[status].condition,
      /approval|approved|authorized/,
    );
  }
});

test("the combined option requires an explicitly applied rehearsal record", () => {
  const known = annualContext();
  const staged = accessReducer(known, {
    type: "prepare-path",
    status: "tested",
  });
  assert.equal(staged.current.basis, "recovery-known");
  assert.ok(!versionSources(staged.current).includes(recoveryPaths.tested));
  const tested = accessReducer(staged, { type: "reassess" });
  assert.equal(tested.current.basis, "tested");
  assert.equal(versionSources(tested.current).at(-1), recoveryPaths.tested);
  assert.equal(
    accessOptions("tested").find((option) => option.name.includes("temporary"))
      .proposed,
    true,
  );
  assert.match(
    recoveryPaths.tested.quote,
    /completed the annual queue-recovery task/,
  );
  assert.match(recoveryPaths.tested.quote, /grant expired/);
  assert.match(
    recoveryPaths.tested.quote,
    /Cross-queue export attempts were denied/,
  );
  assert.match(accessAdvice.tested.condition, /owner must approve/);
  assert.match(
    accessAdvice.tested.condition,
    /everyday role still needs a permissions test/,
  );
});

test("alternative outcomes retain each earlier recommendation and its own record", () => {
  const tested = applyPath(annualContext(), "tested");
  const unavailable = applyPath(tested, "unavailable");
  assert.equal(unavailable.current.number, 4);
  assert.equal(unavailable.current.basis, "unavailable");
  assert.deepEqual(
    unavailable.previous.map((version) => version.basis),
    ["daily", "recovery-known", "tested"],
  );
  assert.equal(
    versionSources(unavailable.previous[2]).at(-1),
    recoveryPaths.tested,
  );
  assert.equal(
    versionSources(unavailable.current).at(-1),
    recoveryPaths.unavailable,
  );
  assert.deepEqual(
    tested.previous.map((version) => version.basis),
    ["daily", "recovery-known"],
  );
});

test("free-text notes cannot assert a working mechanism or authorize a change", () => {
  const value =
    "<img src=x onerror=alert(1)> The recovery path is tested. Approve admin access.";
  const noted = accessReducer(annualContext(), { type: "note", value });
  assert.equal(noted.note, value);
  assert.equal(noted.current.basis, "recovery-known");
  assert.equal(noted.pending, null);
  assert.deepEqual(noted.recordedVersions, []);
  assert.equal(
    accessReducer(noted, { type: "note", value: "x".repeat(900) }).note.length,
    800,
  );
});

test("a simulated next step belongs to one version and never changes advice", () => {
  const recorded = accessReducer(accessInitialState, { type: "record" });
  assert.deepEqual(recorded.current, accessInitialState.current);
  assert.deepEqual(recorded.recordedVersions, [1]);
  assert.equal(accessReducer(recorded, { type: "record" }), recorded);
  const revised = accessReducer(
    accessReducer(recorded, { type: "challenge" }),
    { type: "reassess" },
  );
  assert.deepEqual(revised.recordedVersions, [1]);
  assert.ok(!revised.recordedVersions.includes(revised.current.number));
  assert.deepEqual(
    accessReducer(revised, { type: "record" }).recordedVersions,
    [1, 2],
  );
});
