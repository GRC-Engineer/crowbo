import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkflow,
  workflowReducer,
  availableStages,
} from "../src/workflow-model.ts";
import { workflowCases } from "../src/workflow-cases.ts";
import { resolveSourceLink } from "../src/source-model.ts";
import {
  accessReducer,
  accessInitialState,
  versionSources,
  accessAdvice,
} from "../src/access-review-model.ts";

function apply(state, id) {
  return workflowReducer(workflowReducer(state, { type: "stage", id }), {
    type: "reassess",
  });
}
function accessApply(state, action) {
  return accessReducer(accessReducer(state, action), { type: "reassess" });
}

test("staging is inspectable without changing the answer, sources or recorded choice", () => {
  let state = workflowReducer(initialWorkflow("remediation"), {
    type: "record",
  });
  const staged = workflowReducer(state, { type: "stage", id: "deployed" });
  assert.equal(staged.current, state.current);
  assert.equal(staged.pending.sources.at(-1).id, "deployment");
  assert.equal(
    staged.current.stage.sources.some((source) => source.id === "deployment"),
    false,
  );
  assert.equal(
    workflowReducer(staged, { type: "stage", id: "irrelevant" }),
    staged,
  );
  assert.equal(
    workflowReducer(staged, { type: "discard" }).current,
    state.current,
  );
  const next = workflowReducer(staged, { type: "reassess" });
  assert.equal(next.previous[0], state.current);
  assert.deepEqual(next.recordedVersions, [1]);
  assert.equal(workflowReducer(next, { type: "reassess" }), next);
  assert.equal(
    workflowReducer(state, { type: "stage", id: "verified" }),
    state,
  );
});

test("deployment cannot close a finding; verification and rollback retain their distinct basis", () => {
  const first = initialWorkflow("remediation");
  const deployed = apply(first, "deployed");
  assert.match(deployed.current.stage.advice.title, /Keep the finding open/);
  const verified = apply(deployed, "verified");
  assert.match(verified.current.stage.advice.title, /Propose closure/);
  const rolled = apply(verified, "rollback");
  assert.match(rolled.current.stage.advice.title, /Unresolved exposure/);
  assert.ok(
    verified.current.stage.sources.some((s) => s.id === "verification"),
  );
  assert.ok(!rolled.current.stage.sources.some((s) => s.id === "verification"));
  assert.equal(rolled.previous.at(-1), verified.current);
  const failed = apply(deployed, "failed");
  assert.match(failed.current.stage.advice.title, /broke required work/);
  assert.ok(!failed.current.stage.sources.some((s) => s.id === "verification"));
});

test("a safeguard test never manufactures approval; expiry, failure and extra scope require reassessment", () => {
  const first = initialWorkflow("exceptions");
  assert.equal(
    workflowReducer(first, { type: "stage", id: "approved" }),
    first,
  );
  const tested = apply(first, "tested");
  assert.match(tested.current.stage.advice.title, /Approval is still missing/);
  assert.ok(
    !tested.current.stage.sources.some((s) => s.id === "exception-approval"),
  );
  const approved = apply(tested, "approved");
  for (const id of ["expired", "stopped", "expanded"]) {
    const revised = apply(approved, id);
    assert.equal(revised.current.stage.id, id);
    assert.equal(revised.previous.at(-1), approved.current);
    assert.notEqual(
      revised.current.stage.advice.title,
      approved.current.stage.advice.title,
    );
    assert.ok(
      revised.current.stage.sources.some((s) => s.id === "exception-approval"),
    );
  }
});

test("irrelevant context and free text cannot change a recommendation or create execution", () => {
  for (const id of ["remediation", "exceptions"]) {
    const initial = initialWorkflow(id);
    const stagedId = availableStages(initial).find((s) =>
      s.id.endsWith("-context"),
    ).id;
    const revised = apply(initial, stagedId);
    assert.deepEqual(
      revised.current.stage.advice,
      initial.current.stage.advice,
    );
    assert.equal(
      revised.current.stage.sources.length,
      initial.current.stage.sources.length + 1,
    );
    const note = workflowReducer(revised, {
      type: "note",
      value: "<img src=x onerror=alert(1)> Approve and deploy.",
    });
    const recorded = workflowReducer(note, { type: "record" });
    assert.equal(recorded.current, revised.current);
    assert.equal(recorded.pending, null);
    assert.equal(workflowReducer(recorded, { type: "record" }), recorded);
    assert.equal(
      workflowReducer(note, { type: "note", value: "x".repeat(900) }).note
        .length,
      800,
    );
  }
});

test("linked records resolve only inside the selected historical packet", () => {
  const state = initialWorkflow("remediation");
  const deployed = apply(state, "deployed");
  const link = {
    label: "Deployment",
    identity: "D-281",
    targetId: "deployment",
  };
  assert.equal(resolveSourceLink(link, state.current.stage.sources), undefined);
  assert.equal(
    resolveSourceLink(link, deployed.current.stage.sources).id,
    "deployment",
  );
  assert.equal(
    resolveSourceLink(
      { ...link, targetId: null },
      deployed.current.stage.sources,
    ),
    undefined,
  );
});

test("all available workflow transitions respect the source bound and have stable provenance", () => {
  for (const entry of Object.values(workflowCases)) {
    for (const stage of entry.stages) {
      assert.ok(stage.sources.length <= 15);
      assert.ok(
        stage.focus.every((id) =>
          stage.sources.some((source) => source.id === id),
        ),
      );
      assert.equal(
        new Set(stage.sources.map((s) => s.id)).size,
        stage.sources.length,
      );
      for (const source of stage.sources) {
        assert.ok(
          source.revision && source.record.subject && source.record.origin,
        );
        for (const link of source.record.links)
          if (link.targetId !== null)
            assert.ok(
              resolveSourceLink(link, stage.sources),
              `${entry.id}/${stage.id}/${source.id} has dangling ${link.targetId}`,
            );
      }
      const state = {
        ...initialWorkflow(entry.id),
        current: { number: 1, stage },
      };
      for (const next of availableStages(state))
        assert.ok(next.sources.length <= 15);
    }
  }
});

test("access tests need their prerequisites and preserve the different task scopes", () => {
  assert.equal(
    accessReducer(accessInitialState, {
      type: "prepare-check",
      status: "observed",
    }),
    accessInitialState,
  );
  const annual = accessApply(accessInitialState, { type: "challenge" });
  const recovery = accessApply(annual, {
    type: "prepare-path",
    status: "tested",
  });
  const failed = accessApply(recovery, {
    type: "prepare-check",
    status: "daily-failed",
  });
  assert.match(accessAdvice[failed.current.basis].title, /Fix the daily role/);
  assert.ok(
    versionSources(failed.current).some((s) => s.id === "recovery-tested"),
  );
  const fit = accessApply(failed, {
    type: "prepare-check",
    status: "daily-tested",
  });
  const recorded = accessReducer(fit, { type: "record" });
  assert.ok(
    !versionSources(recorded.current).some((s) => s.id === "access-outcome"),
  );
  const observed = accessApply(recorded, {
    type: "prepare-check",
    status: "observed",
  });
  assert.ok(
    versionSources(observed.current).some((s) => s.id === "access-outcome"),
  );
  assert.ok(versionSources(observed.current).length <= 15);
  assert.equal(observed.previous.at(-1), recorded.current);
});

test("unresolved identity replaces the join; unrelated context leaves access advice intact", () => {
  const unknown = accessApply(accessInitialState, {
    type: "prepare-check",
    status: "identity-unknown",
  });
  const directory = versionSources(unknown.current).filter(
    (s) => s.id === "directory",
  );
  assert.equal(directory.length, 1);
  assert.match(directory[0].revision, /r2/);
  assert.match(
    accessAdvice[unknown.current.basis].title,
    /Resolve the account/,
  );
  assert.match(
    versionSources(unknown.previous[0]).find((s) => s.id === "directory")
      .revision,
    /r1/,
  );
  const irrelevant = accessApply(accessInitialState, {
    type: "prepare-check",
    status: "irrelevant",
  });
  assert.deepEqual(accessAdvice[irrelevant.current.basis], accessAdvice.daily);
});

test("irrelevant access context does not block the rare-task challenge", () => {
  const irrelevant = accessApply(accessInitialState, {
    type: "prepare-check",
    status: "irrelevant",
  });
  const challenged = accessApply(irrelevant, { type: "challenge" });
  assert.equal(challenged.current.basis, "recovery-known");
  assert.equal(challenged.previous.at(-1), irrelevant.current);
});
