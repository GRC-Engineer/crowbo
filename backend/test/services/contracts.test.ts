// Port of tests/test_contracts.py.
import { describe, expect, it } from "vitest";
import { digest } from "../../src/domain/canonical";
import { revisionId, sourceRevision } from "../../src/domain/contracts";
import { addMicros, SECOND } from "../../src/domain/time";
import { makeItem } from "../helpers";

describe("contracts", () => {
  it("py: tests/test_contracts.py::test_stored_legacy_revision_keeps_its_original_identity", () => {
    const { timestamp_basis: _t, fingerprint_version: _f, ...legacy } = makeItem().source;
    const { observed_at: _o, ...hashed } = legacy;
    const originalId = digest(hashed);
    const loaded = sourceRevision.parse(legacy);
    expect(revisionId(loaded)).toBe(originalId);
    expect(revisionId(sourceRevision.parse(JSON.parse(JSON.stringify(loaded))))).toBe(originalId);
  });

  it("py: tests/test_contracts.py::test_capture_timestamp_is_explicit_and_cannot_impersonate_native_update", () => {
    const item = makeItem();
    const body: Record<string, any> = { ...item.source, timestamp_basis: "observation", updated_at: item.source.observed_at };
    const snapshot = sourceRevision.parse(body);
    expect(revisionId(snapshot)).not.toBe(revisionId(item.source));
    body.updated_at = addMicros(body.updated_at, -SECOND);
    expect(() => sourceRevision.parse(body)).toThrow(/capture timestamp/);
  });
});
