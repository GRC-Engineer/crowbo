import { digest } from "../domain/canonical";
import { head as headSchema, logicalId, permits, revisionId, sourceRevision } from "../domain/contracts";
import { CrowboError } from "../domain/errors";
import { activeGroups, type Settings } from "../domain/settings";
import { DAY, localDate, micros, now } from "../domain/time";
import { headId } from "../services/evidence";
import type { Store } from "../services/ports";
import {
  type EvalGate,
  evalGate,
  type FactAssertion,
  factAssertion,
  type FactSet,
  type Freshness,
  type Question,
  question as questionSchema,
  type Served,
  type StoredFact,
  subjectKey,
  WORKFLOW_OF,
  type Workflow,
} from "./model";
import { CRITERIA_VERSION, evaluate } from "./rules";

/** Who is asking: the resolved operator settings plus roles granted by their credential. */
export type Caller = { settings: Settings; roles: readonly string[] };

const CONTENT_FRESHNESS = DAY;

/**
 * Standing decisions over source-bound facts. Rule-tier answers take microseconds, so they are
 * computed on read and stored as immutable, input-addressed versions (idempotent inserts):
 * there is no recompute queue to lose and no cached answer to drift. Currency and access are
 * derived at read against current heads and grants, so revocation applies on the next ask.
 */
export class Standing {
  constructor(
    private readonly store: Store,
    private readonly options: { allowSyntheticGates: boolean },
  ) {}

  private require(caller: Caller, role: string) {
    if (!caller.roles.includes(role)) throw new CrowboError(`This operation requires the ${role} role`);
  }

  private teams(caller: Caller): string[] {
    return activeGroups(caller.settings, now());
  }

  /** Bind a subject to the one team whose members may see its standing decisions. */
  async registerSubject(caller: Caller, q: Question, team: string) {
    this.require(caller, "operator");
    const parsed = questionSchema.parse(q);
    const key = subjectKey(parsed);
    const id = digest(["subject", caller.settings.tenant, key]);
    const existing = await this.store.get(id);
    const body = { kind: "subject", tenant: caller.settings.tenant, subject_key: key, question: parsed, workflow: WORKFLOW_OF[parsed.kind], team };
    if (existing) {
      if (existing.team !== team) throw new CrowboError("A subject's team cannot be reassigned; register a new subject identity");
      return existing;
    }
    await this.store.put(id, "subject", body, { logicalId: WORKFLOW_OF[parsed.kind], insertOnly: true });
    return body;
  }

  /** Append one immutable fact. Source quotes must be exact, unique spans of a permitted revision. */
  async assertFact(caller: Caller, input: FactAssertion): Promise<StoredFact> {
    const fact = factAssertion.parse(input);
    const subject = await this.subject(fact.subject_key);
    if (!subject || !this.teams(caller).includes(subject.team)) throw new CrowboError("Subject is unavailable");
    if (subject.workflow !== fact.workflow) throw new CrowboError("Fact workflow does not match its subject");
    if (fact.provenance === "operator_assertion" && fact.attributed_to !== caller.settings.reader) {
      throw new CrowboError("Operator assertions are attributed to the asserting reader");
    }
    for (const citation of fact.citations) {
      const raw = await this.store.get(citation.revision_id);
      if (!raw) throw new CrowboError("Cited revision is unavailable");
      const source = sourceRevision.parse(raw);
      if (logicalId(source) !== citation.source_id || revisionId(source) !== citation.revision_id) {
        throw new CrowboError("Cited revision failed its integrity check");
      }
      const h = await this.head(citation.source_id);
      if (!h || !permits(h.grant, caller.settings.reader, now(), "turbopuffer", this.teams(caller))) {
        throw new CrowboError("Current reader or processing permission is unavailable");
      }
      const first = source.text.indexOf(citation.quote);
      if (first < 0 || source.text.indexOf(citation.quote, first + citation.quote.length) >= 0) {
        throw new CrowboError("Fact quote must match one exact span in its cited revision");
      }
    }
    const body = { ...fact, asserted_by: caller.settings.reader };
    const id = digest(["fact", caller.settings.tenant, body]);
    const stored = { ...body, id, asserted_at: now() } as StoredFact;
    const existing = await this.store.get(id);
    if (existing) return existing as StoredFact;
    await this.store.put(id, "fact", stored, { logicalId: fact.subject_key, insertOnly: true });
    return stored;
  }

  /** Record an evaluation result for a criteria version. Only a criteria approver may do this. */
  async recordGate(caller: Caller, input: EvalGate) {
    this.require(caller, "criteria_approver");
    const gate = evalGate.parse(input);
    if (gate.approved_by !== caller.settings.reader) throw new CrowboError("A gate is approved by the recording reader");
    const body = { ...gate, kind: "eval_gate", tenant: caller.settings.tenant, recorded_at: now() };
    const id = digest(["eval_gate", caller.settings.tenant, gate]);
    if (!(await this.store.get(id))) await this.store.put(id, "eval_gate", body, { logicalId: gate.question_kind, insertOnly: true });
    return { id, ...body };
  }

  /** Activate the current criteria version for a question kind. Requires a passing gate for it. */
  async activateCriteria(caller: Caller, kind: Question["kind"], gateId: string) {
    this.require(caller, "criteria_approver");
    const gate = await this.store.get(gateId);
    if (!gate || gate.kind !== "eval_gate" || gate.tenant !== caller.settings.tenant || gate.question_kind !== kind) {
      throw new CrowboError("Evaluation gate is unavailable for this question kind");
    }
    if (!gate.passed) throw new CrowboError("Criteria can only be activated by a passing evaluation gate");
    if (gate.criteria_version !== CRITERIA_VERSION[kind]) throw new CrowboError("The gate evaluated a different criteria version");
    if (gate.qualification === "synthetic_fixture" && !this.options.allowSyntheticGates) {
      throw new CrowboError("Synthetic fixture gates cannot activate criteria in this environment");
    }
    const id = digest(["criteria_active", caller.settings.tenant, kind]);
    const previous = await this.store.get(id);
    const body = { kind, tenant: caller.settings.tenant, criteria_version: gate.criteria_version, gate_id: gateId, qualification: gate.qualification, activated_by: caller.settings.reader, activated_at: now() };
    await this.store.put(id, "criteria_active", body, { expectedHash: previous ? digest(previous) : null, insertOnly: previous === null });
    return body;
  }

  async ask(caller: Caller, input: Question): Promise<Served | { status: "not_ready"; reason: string }> {
    const q = questionSchema.parse(input);
    const key = subjectKey(q);
    const subject = await this.subject(key);
    if (!subject || !this.teams(caller).includes(subject.team)) return { status: "unavailable" };
    const active = await this.store.get(digest(["criteria_active", caller.settings.tenant, q.kind]));
    if (!active || active.criteria_version !== CRITERIA_VERSION[q.kind]) return { status: "not_ready", reason: "no_active_criteria" };

    const facts = (await this.store.scan("fact", key)) as StoredFact[];
    const live: StoredFact[] = [];
    const sourceIds = new Set<string>();
    const stale: string[] = [];
    const at = now();
    for (const fact of facts.filter((f) => f.workflow === WORKFLOW_OF[q.kind])) {
      let current = true;
      for (const c of fact.citations) {
        sourceIds.add(c.source_id);
        const h = await this.head(c.source_id);
        if (!h || h.revision_id !== c.revision_id || h.withdrawn) current = false;
      }
      if (current) live.push(fact);
    }
    // Access: every contributing source must be readable now, by this caller. No partial answers.
    const heads = [];
    for (const source of sourceIds) {
      const h = await this.head(source);
      if (!h) return { status: "unavailable" };
      heads.push(h);
      if (h.withdrawn) continue; // withdrawn facts are excluded above; history needs no disclosure
      if (!permits(h.grant, caller.settings.reader, at, "turbopuffer", this.teams(caller))) return { status: "unavailable" };
    }
    const conflictedSources = heads.filter((h) => h.conflicted);
    if (conflictedSources.length) return { status: "blocked", reason: "conflicting_revisions", predicates: [] };

    const resolved = resolve(latestPerOrigin(live));
    const conflicting = Object.entries(resolved).filter(([, f]) => f.state === "conflicting").map(([p]) => p);
    if (conflicting.length) return { status: "blocked", reason: "conflicting_facts", predicates: conflicting.sort() };

    for (const h of heads) {
      if (h.withdrawn) continue;
      const checked = h.last_checked_at ?? h.updated_at;
      if (micros(at) - micros(checked) > CONTENT_FRESHNESS) stale.push("content_unchecked_24h");
    }
    for (const fact of live) {
      if (fact.effective_until && micros(fact.effective_until) <= micros(at)) stale.push("assertion_lapsed");
    }

    const today = localDate(at);
    const verdict = evaluate(q, resolved, today);
    const expires = resolved.expires_on?.state === "stated" ? resolved.expires_on.value : null;
    const inputs = {
      question: q,
      criteria_version: active.criteria_version,
      gate_id: active.gate_id,
      facts: live.map((f) => f.id).sort(),
      revisions: heads.filter((h) => !h.withdrawn).map((h) => [h.logical_id, h.revision_id]).sort(),
      phase: q.kind === "exception_valid" && expires ? (expires <= today ? "after_expiry" : "before_expiry") : null,
    };
    const versionId = digest(["decision_version", caller.settings.tenant, subject.team, inputs]);
    let version = await this.store.get(versionId);
    if (!version) {
      const pointerId = digest(["decision_latest", caller.settings.tenant, subject.team, q.kind, key]);
      const pointer = await this.store.get(pointerId);
      version = {
        id: versionId,
        kind: "decision_version",
        tenant: caller.settings.tenant,
        team: subject.team,
        subject_key: key,
        question: q,
        workflow: WORKFLOW_OF[q.kind],
        criteria_version: active.criteria_version,
        criteria_qualification: active.qualification,
        inputs,
        verdict,
        valid_until: expires && expires > today ? `${expires}T00:00:00Z` : null,
        predecessor: pointer?.version_id ?? null,
        computed_at: at,
        tier: "rule",
        simulated: true,
        authority_verified: false,
      };
      try {
        await this.store.put(versionId, "decision_version", version, { logicalId: key, insertOnly: true });
      } catch (error) {
        const raced = await this.store.get(versionId);
        if (!(error instanceof CrowboError) || !raced) throw error;
        version = raced;
      }
      if (pointer?.version_id !== versionId) {
        await this.store
          .put(pointerId, "decision_latest", { version_id: versionId, subject_key: key }, { expectedHash: pointer ? digest(pointer) : null, insertOnly: !pointer })
          .catch(() => undefined); // the pointer is a convenience; history is recoverable from versions
      }
    }
    const freshness: Freshness = stale.length ? { status: "stale", reasons: [...new Set(stale)].sort() } : { status: "current" };
    return { status: "answered", version, freshness };
  }

  /** All standing answers for one workflow that this caller may see, for a review board. */
  async survey(caller: Caller, workflow: Workflow, limit = 500) {
    const subjects = (await this.store.scan("subject", workflow)).filter(
      (s) => s.tenant === caller.settings.tenant && this.teams(caller).includes(s.team),
    );
    const rows = [];
    for (const s of subjects.slice(0, limit)) rows.push({ subject_key: s.subject_key, served: await this.ask(caller, s.question) });
    return { workflow, count: rows.length, truncated: subjects.length > limit, rows };
  }

  /** Immutable version history for one subject, oldest first. */
  async history(caller: Caller, input: Question) {
    const q = questionSchema.parse(input);
    const key = subjectKey(q);
    const subject = await this.subject(key);
    if (!subject || !this.teams(caller).includes(subject.team)) return { status: "unavailable" as const };
    const served = await this.ask(caller, q);
    if (served.status === "unavailable") return served;
    const versions = (await this.store.scan("decision_version", key))
      .filter((v) => v.team === subject.team && v.question.kind === q.kind)
      .sort((a, b) => (micros(a.computed_at) < micros(b.computed_at) ? -1 : 1));
    return { status: "ok" as const, versions };
  }

  private async subject(key: string) {
    const rows = await this.store.scan("subject");
    return rows.find((s) => s.subject_key === key) ?? null;
  }

  private async head(source: string) {
    const raw = await this.store.get(headId(source));
    return raw ? headSchema.parse(raw) : null;
  }
}

/** Per origin (extractor or asserting reader) and predicate, the most recent assertion wins. */
function latestPerOrigin(facts: StoredFact[]): StoredFact[] {
  const latest = new Map<string, StoredFact>();
  for (const f of facts) {
    const origin = `${f.predicate}\u0000${f.provenance}\u0000${f.extractor ?? f.attributed_to}`;
    const prior = latest.get(origin);
    if (!prior || micros(prior.asserted_at as any) < micros(f.asserted_at as any)) latest.set(origin, f);
  }
  return [...latest.values()];
}

/** Across origins: agreeing stated values are stated; differing values or any conflict are conflicting. */
function resolve(facts: StoredFact[]): FactSet {
  const out: FactSet = {};
  const byPredicate = new Map<string, StoredFact[]>();
  for (const f of facts) byPredicate.set(f.predicate, [...(byPredicate.get(f.predicate) ?? []), f]);
  for (const [predicate, group] of byPredicate) {
    const statedValues = new Set(group.filter((f) => f.state === "stated").map((f) => f.value));
    const anyConflict = group.some((f) => f.state === "conflicting");
    const state = anyConflict || statedValues.size > 1 ? "conflicting" : statedValues.size === 1 ? "stated" : "unknown";
    out[predicate] = {
      state,
      value: state === "stated" ? [...statedValues][0] : null,
      fact_ids: group.map((f) => f.id).sort(),
      provenance: [...new Set(group.map((f) => f.provenance))].sort(),
    };
  }
  return out;
}
