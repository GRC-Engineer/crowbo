import { describe, expect, it } from "vitest";
import vectors from "../golden/python-vectors.json";
import { canonicalJson, digest } from "../../src/domain/canonical";
import { grant, logicalId, revisionId, sourceRevision } from "../../src/domain/contracts";

describe("identities match the Python pilot byte for byte", () => {
  for (const [name, row] of Object.entries(vectors.revisions)) {
    it(`revision ${name}`, () => {
      const parsed = sourceRevision.parse(row.input);
      expect(parsed).toEqual(row.dump);
      expect(revisionId(parsed)).toBe(row.revision_id);
      expect(logicalId(parsed)).toBe(row.logical_id);
      expect(digest(["head", logicalId(parsed)])).toBe(row.head_id);
    });
  }
  for (const [name, row] of Object.entries(vectors.digests)) {
    it(`digest ${name}`, () => {
      expect(canonicalJson(row.value)).toBe(row.json);
      expect(digest(row.value)).toBe(row.digest);
    });
  }
  it("grant dump and digest", () => {
    const parsed = grant.parse({ readers: ["operator"], processors: ["turbopuffer", "jev"], checked_at: "2026-09-25T09:55:00Z", expires_at: "2026-09-25T11:00:00Z" });
    expect(parsed).toEqual(vectors.grant.dump);
    expect(digest(parsed)).toBe(vectors.grant.digest);
  });
});

import { accessQuestions, ASSESSOR_CONTRACT, contextAssessmentId } from "../../src/domain/access";
import { assessmentId, CRITERIA_HASH, CRITERIA_VERSION } from "../../src/domain/questions";

describe("question fingerprints match the Python pilot", () => {
  const q = vectors.questions;
  it("commitment criteria", () => {
    expect(CRITERIA_VERSION).toBe(q.commitment_version);
    expect(CRITERIA_HASH).toBe(q.commitment_hash);
  });
  it("access context questions and assessment identities", () => {
    const set = accessQuestions(q.access_subject);
    expect(set.version).toBe(q.access_version);
    expect(set.fingerprint).toBe(q.access_fingerprint);
    const revision = vectors.revisions.legacy_source_update.revision_id;
    expect(assessmentId(revision)).toBe(q.assessment_id_default);
    expect(contextAssessmentId(revision, set)).toBe(q.context_assessment_id);
    expect(ASSESSOR_CONTRACT).toBe(q.assessor_contract);
  });
});
