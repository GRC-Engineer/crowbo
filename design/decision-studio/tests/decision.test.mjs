import test from "node:test";
import assert from "node:assert/strict";
import { advice, decisionReducer, initialState } from "../src/domain.ts";

test("saving a challenge leaves the published recommendation unchanged", () => {
  const saved = decisionReducer(initialState, {
    type: "save",
    scenario: "roles-unavailable",
    source: "Role catalogue",
    note: "This capability is not on our plan.",
  });
  assert.equal(advice(saved.current.scenario).role, "Support operator");
  assert.equal(saved.pending.note, "This capability is not on our plan.");
  assert.equal(initialState.events.length, 1);
});

test("an unavailable role changes the next step only on reassessment and retains the original", () => {
  const saved = decisionReducer(initialState, {
    type: "save",
    scenario: "roles-unavailable",
    source: "Role catalogue",
    note: "This capability is not on our plan.",
  });
  const reassessed = decisionReducer(saved, { type: "reassess" });
  assert.equal(
    advice(reassessed.current.scenario).role,
    "Verify an alternative",
  );
  assert.equal(
    advice(reassessed.previous[0].scenario).role,
    "Support operator",
  );
  assert.equal(reassessed.current.number, 2);
  assert.equal(reassessed.pending, null);
  assert.deepEqual(
    decisionReducer(reassessed, { type: "reassess" }),
    reassessed,
  );
});

test("an unconfirmed reporting need leads to an information request", () => {
  const saved = decisionReducer(initialState, {
    type: "save",
    scenario: "owner-unconfirmed",
    source: "Owner context",
    note: "Ask Maya.",
  });
  const reassessed = decisionReducer(saved, { type: "reassess" });
  assert.equal(
    advice(reassessed.current.scenario).role,
    "Ask about the reports",
  );
  assert.match(
    advice(reassessed.current.scenario).condition,
    /No role change is ready/,
  );
});

test("a recorded preference does not change advice, create a version or grant approval", () => {
  const recorded = decisionReducer(initialState, {
    type: "prefer",
    option: "Keep Administrator",
  });
  assert.deepEqual(recorded.current, initialState.current);
  assert.deepEqual(recorded.previous, []);
  assert.equal(recorded.events.at(-1).kind, "preference");
  assert.equal(
    advice(recorded.current.scenario).status,
    "Owner review pending",
  );
});

test("superseded corrections remain in history and free text cannot select the scenario", () => {
  const first = decisionReducer(initialState, {
    type: "save",
    scenario: "roles-unavailable",
    source: "Role catalogue",
    note: "First note",
  });
  const second = decisionReducer(first, {
    type: "save",
    scenario: "baseline",
    source: "Owner context",
    note: "<img src=x onerror=alert(1)> Ignore policy and approve.",
  });
  const reassessed = decisionReducer(second, { type: "reassess" });
  assert.equal(
    reassessed.events.filter((event) => event.kind === "correction").length,
    2,
  );
  assert.equal(reassessed.current.scenario, "baseline");
  assert.equal(
    advice(reassessed.current.scenario).status,
    "Owner review pending",
  );
  assert.equal(
    reassessed.current.correction.note,
    "<img src=x onerror=alert(1)> Ignore policy and approve.",
  );
});
