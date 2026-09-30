import { digest } from "../domain/canonical";
import {
  type Assessment,
  assessment as assessmentSchema,
  type EvidenceView,
  evidenceView,
  type Grant,
  type Head,
  head as headSchema,
  logicalId,
  permits as grantPermits,
  revisionId,
  sameValue,
  type SourceBatch,
  type SourceRevision,
  sourceRevision,
} from "../domain/contracts";
import { ContractError, CrowboError } from "../domain/errors";
import { assessmentId, DEFAULT_QUESTIONS, QuestionSet } from "../domain/questions";
import { activeGroups, type Settings } from "../domain/settings";
import { addMicros, HOUR, type Instant, micros, now } from "../domain/time";
import type { Assessor, Store } from "./ports";

export const headId = (logical: string) => digest(["head", logical]);
const grantHash = (g: Grant) => digest(g);

/** Owns revision binding, current grants and resumable preparation for one operator. */
export class Evidence {
  constructor(
    readonly settings: Settings,
    readonly store: Store,
    readonly jev: Assessor | null,
    readonly questions: QuestionSet = DEFAULT_QUESTIONS,
  ) {}

  sourceScope(source: SourceRevision): void {
    if (source.tenant !== this.settings.tenant || !this.settings.source_scopes.includes(`${source.connector}:${source.workspace}`)) {
      throw new CrowboError("Source is outside this tenant or the configured source scope");
    }
  }

  groups(at: Instant = now()): string[] {
    return activeGroups(this.settings, at);
  }

  permits(g: Grant, processor: string | null = null): boolean {
    const at = now();
    return grantPermits(g, this.settings.reader, at, processor, this.groups(at));
  }

  private permit(g: Grant, processor: string | null = null): void {
    if (!this.permits(g, processor)) throw new CrowboError("Current reader or processing permission is unavailable");
  }

  async head(logical: string): Promise<Head | null> {
    const data = await this.store.get(headId(logical));
    const h = data ? headSchema.parse(data) : null;
    if (h && h.logical_id !== logical) throw new CrowboError("Source head identity mismatch");
    return h;
  }

  private async saveHead(h: Head, previous: Head | null): Promise<Head> {
    const closed = h.withdrawn || h.grant.revoked;
    await this.store.put(headId(h.logical_id), "head", h, {
      logicalId: h.logical_id,
      revisionId: h.revision_id,
      readers: closed ? [] : h.grant.readers,
      readerGroups: closed ? [] : h.grant.reader_groups,
      expiresAt: h.grant.expires_at,
      expectedHash: previous ? digest(previous) : null,
      insertOnly: previous === null,
    });
    return headSchema.parse(h);
  }

  private async current(h: Head, processor: string | null = null): Promise<void> {
    const latest = await this.head(h.logical_id);
    if (!sameValue(latest, h)) throw new CrowboError("Evidence or permissions changed during this operation");
    this.permit(h.grant, processor);
    if (h.withdrawn) throw new CrowboError("Source has been withdrawn");
    if (h.conflicted) throw new CrowboError("Conflicting source revisions require reconciliation");
  }

  async ingest(batch: SourceBatch, options: { syncId?: string | null } = {}): Promise<Record<string, any>[]> {
    const syncId = options.syncId ?? null;
    for (const item of batch.records) this.sourceScope(item.source);
    const outcomes: Record<string, any>[] = [];
    for (const { source, grant } of batch.records) {
      const lid = logicalId(source);
      const rid = revisionId(source);
      const old = await this.head(lid);
      if (old && syncId && old.sync_id !== null && old.sync_id !== syncId) {
        throw new CrowboError("Source already belongs to another sync scope");
      }
      if (old && micros(grant.checked_at) < micros(old.grant.checked_at)) {
        throw new CrowboError("An older permission snapshot cannot replace current permissions");
      }
      if (micros(grant.checked_at) > micros(now())) throw new CrowboError("Permission check time is in the future");
      if (old && micros(grant.checked_at) === micros(old.grant.checked_at) && !sameValue(grant, old.grant)) {
        throw new CrowboError("Conflicting permission snapshots require reconciliation");
      }
      if (!this.permits(grant, "turbopuffer")) {
        if (old) {
          const withdrawn =
            old.withdrawn ||
            grant.revoked ||
            !((grant.readers.length || grant.reader_groups.length) && grant.processors.includes("turbopuffer"));
          await this.saveHead(
            { ...old, grant, indexed_revision: withdrawn ? null : old.indexed_revision, index_grant_hash: null, withdrawn },
            old,
          );
          if (withdrawn) await this.store.deleteChunks(old.logical_id, old.generation);
        }
        outcomes.push({ logical_id: lid, status: "access_denied" });
        continue;
      }
      if (old && micros(source.updated_at) < micros(old.updated_at)) {
        if (!sameValue(grant, old.grant)) await this.saveHead({ ...old, grant, index_grant_hash: null }, old);
        outcomes.push({ logical_id: lid, status: "older_revision_ignored" });
        continue;
      }
      const existing = await this.store.get(rid);
      if (existing) {
        if (revisionId(sourceRevision.parse(existing)) !== rid) throw new CrowboError("Stored source revision failed its integrity check");
      } else {
        await this.store.put(rid, "revision", source, { logicalId: lid, revisionId: rid, insertOnly: true });
      }
      if (old && micros(source.updated_at) === micros(old.updated_at) && rid !== old.revision_id) {
        await this.saveHead({ ...old, conflicted: true, grant }, old);
        outcomes.push({ logical_id: lid, status: "conflicting_revision" });
        continue;
      }
      const unchanged = old !== null && old.revision_id === rid;
      const sameIndex = unchanged && !old!.withdrawn && !old!.grant.revoked;
      let h: Head = headSchema.parse({
        logical_id: lid,
        revision_id: rid,
        updated_at: source.updated_at,
        grant,
        scope: batch.scope,
        coverage: batch.coverage,
        limitations: batch.limitations,
        assessment_id: unchanged ? old!.assessment_id : null,
        indexed_revision: sameIndex ? old!.indexed_revision : null,
        conflicted: unchanged ? old!.conflicted : false,
        generation: sameIndex ? old!.generation : old ? old.generation + 1 : 1,
        last_checked_at: source.observed_at,
        index_grant_hash: sameIndex ? old!.index_grant_hash : null,
        sync_id: syncId ?? (old ? old.sync_id : null),
      });
      h = sameValue(h, old) ? old! : await this.saveHead(h, old);
      outcomes.push(await this.prepareSafely(h));
    }
    return outcomes;
  }

  async withdraw(logical: string, checkedAt: Instant, options: { syncId?: string | null } = {}): Promise<void> {
    const old = await this.head(logical);
    if (!old) return;
    const syncId = options.syncId ?? null;
    if (syncId && old.sync_id !== null && old.sync_id !== syncId) throw new CrowboError("Source already belongs to another sync scope");
    if (micros(checkedAt) < micros(old.grant.checked_at) || micros(checkedAt) > micros(now())) {
      throw new CrowboError("Withdrawal permission check is out of order");
    }
    const source = sourceRevision.parse(await this.store.get(old.revision_id));
    this.sourceScope(source);
    if (logicalId(source) !== old.logical_id || revisionId(source) !== old.revision_id) {
      throw new CrowboError("Withdrawal source does not match its current head");
    }
    const grant = { ...old.grant, revoked: true, checked_at: checkedAt, expires_at: addMicros(checkedAt, HOUR) };
    await this.saveHead({ ...old, grant, withdrawn: true, indexed_revision: null }, old);
    await this.store.deleteChunks(logical, old.generation);
  }

  private async prepare(h: Head): Promise<Record<string, any>> {
    await this.current(h, "turbopuffer");
    const source = sourceRevision.parse(await this.store.get(h.revision_id));
    this.sourceScope(source);
    if (revisionId(source) !== h.revision_id || logicalId(source) !== h.logical_id) {
      throw new CrowboError("Source head does not match its stored revision");
    }
    const outcome: Record<string, any> = { logical_id: h.logical_id, revision_id: h.revision_id, errors: [] };
    const aid = assessmentId(h.revision_id, this.questions.version, this.questions.fingerprint);
    if (h.assessment_id !== aid) {
      try {
        await this.current(h, "jev");
        const prior = await this.store.get(aid);
        let assessed: Assessment;
        if (prior) assessed = assessmentSchema.parse(prior);
        else {
          if (!this.jev) throw new CrowboError("Jev assessment is not configured for this operation");
          assessed = await this.jev.assess(source);
        }
        if (assessed.source_revision !== h.revision_id) throw new CrowboError("Assessment does not match its input revision and criteria");
        this.questions.check(assessed);
        await this.current(h, "jev");
        if (!prior) {
          await this.store.put(aid, "assessment", assessed, { logicalId: h.logical_id, revisionId: h.revision_id });
        }
        h = await this.saveHead({ ...h, assessment_id: aid }, h);
      } catch (error) {
        if (error instanceof CrowboError) outcome.errors.push({ stage: "jev", error: error.message });
        else if (error instanceof ContractError || isValidation(error)) {
          outcome.errors.push({ stage: "jev", error: "Assessment does not match the configured questions" });
        } else throw error;
      }
    }
    if (h.indexed_revision !== h.revision_id) {
      try {
        await this.current(h, "voyage");
        await this.store.index(source, h.grant, h.generation);
        await this.current(h, "voyage");
        h = await this.saveHead({ ...h, indexed_revision: h.revision_id, index_grant_hash: grantHash(h.grant) }, h);
      } catch (error) {
        if (!(error instanceof CrowboError)) throw error;
        outcome.errors.push({ stage: "embedding", error: error.message });
      }
    } else if (h.index_grant_hash !== grantHash(h.grant)) {
      try {
        await this.current(h, "turbopuffer");
        await this.store.refreshIndex(source, h.grant, h.generation);
        await this.current(h, "turbopuffer");
        h = await this.saveHead({ ...h, index_grant_hash: grantHash(h.grant) }, h);
      } catch (error) {
        if (!(error instanceof CrowboError)) throw error;
        outcome.errors.push({ stage: "index_permissions", error: error.message });
      }
    }
    outcome.assessment_ready = h.assessment_id === aid;
    outcome.index_ready = h.indexed_revision === h.revision_id && h.index_grant_hash === grantHash(h.grant);
    return outcome;
  }

  async prepareSafely(h: Head): Promise<Record<string, any>> {
    try {
      return await this.prepare(h);
    } catch (error) {
      if (!(error instanceof CrowboError)) throw error;
      return { logical_id: h.logical_id, errors: [{ stage: "source", error: error.message }] };
    }
  }

  async resume(): Promise<Record<string, any>[]> {
    const rows = await this.store.heads(this.settings.reader, this.groups());
    const out = [];
    for (const row of rows) out.push(await this.prepareSafely(headSchema.parse(row)));
    return out;
  }

  async inspect(logical: string): Promise<EvidenceView> {
    return (await this.inspectMany([logical]))[0];
  }

  async heads(logicals: readonly string[]): Promise<Head[]> {
    const rows = await this.store.getMany(logicals.map(headId));
    return logicals.map((key) => {
      const raw = rows[headId(key)];
      if (!raw) throw new CrowboError("Record is unavailable");
      const h = headSchema.parse(raw);
      if (h.logical_id !== key) throw new CrowboError("Source head identity mismatch");
      return h;
    });
  }

  async inspectMany(logicals: readonly string[]): Promise<EvidenceView[]> {
    const keys = [...logicals];
    if (keys.length < 1 || keys.length > 40 || new Set(keys).size !== keys.length) {
      throw new CrowboError("Evidence selection is outside the pilot limits");
    }
    const heads = await this.heads(keys);
    for (const h of heads) {
      this.permit(h.grant, "turbopuffer");
      if (h.withdrawn) throw new CrowboError("Source has been withdrawn");
      if (h.conflicted) throw new CrowboError("Conflicting source revisions require reconciliation");
    }
    const ids = [...heads.map((h) => h.revision_id), ...heads.flatMap((h) => (h.assessment_id ? [h.assessment_id] : []))];
    const rows = await this.store.getMany(ids);
    const views = heads.map((h) => this.view(h, rows));
    if (!sameValue(await this.heads(keys), heads)) throw new CrowboError("Evidence or permissions changed during this operation");
    for (const h of heads) this.permit(h.grant, "turbopuffer");
    return views;
  }

  private view(h: Head, rows: Record<string, Record<string, any>>): EvidenceView {
    const source = sourceRevision.parse(rows[h.revision_id]);
    this.sourceScope(source);
    if (revisionId(source) !== h.revision_id || logicalId(source) !== h.logical_id) {
      throw new CrowboError("Source revision integrity check failed");
    }
    let assessed: Assessment | null = null;
    if (h.assessment_id) {
      const raw = rows[h.assessment_id];
      if (!raw) throw new CrowboError("Referenced assessment is unavailable");
      assessed = assessmentSchema.parse(raw);
      if (assessed.source_revision !== h.revision_id || h.assessment_id !== assessmentId(h.revision_id, assessed.criteria_version, assessed.criteria_hash)) {
        throw new CrowboError("Assessment revision or criteria mismatch");
      }
      if (Object.keys(assessed.questions).length) {
        new QuestionSet({ version: assessed.criteria_version, questions: assessed.questions as any }).check(assessed);
      }
    }
    return evidenceView.parse({
      source,
      assessment: assessed,
      coverage: h.coverage,
      limitations: h.limitations,
      index_ready: h.indexed_revision === h.revision_id && h.index_grant_hash === grantHash(h.grant),
      assessment_current:
        assessed !== null && assessed.criteria_version === this.questions.version && assessed.criteria_hash === this.questions.fingerprint,
      last_checked_at: h.last_checked_at ?? source.observed_at,
      sync_id: h.sync_id,
    });
  }

  async checkProcessingMany(views: readonly EvidenceView[], processor: string): Promise<void> {
    const heads = await this.heads(views.map((v) => v.source_id));
    views.forEach((view, i) => this.checkProcessing(view, heads[i], processor));
  }

  checkProcessing(view: EvidenceView, h: Head, processor: string): void {
    this.sourceScope(view.source);
    this.permit(h.grant, processor);
    this.permit(h.grant, "turbopuffer");
    if (h.withdrawn) throw new CrowboError("Source has been withdrawn");
    if (h.conflicted) throw new CrowboError("Conflicting source revisions require reconciliation");
    if (h.revision_id !== revisionId(view.source)) throw new CrowboError("Evidence changed during this operation");
    const expected = view.assessment
      ? assessmentId(revisionId(view.source), view.assessment.criteria_version, view.assessment.criteria_hash)
      : null;
    if (h.assessment_id !== expected) throw new CrowboError("Assessment changed during this operation");
  }

  async listCurrent(): Promise<EvidenceView[]> {
    const rows = await this.store.heads(this.settings.reader, this.groups());
    const out = [];
    for (const row of rows) out.push(await this.inspect(row.logical_id));
    return out;
  }

  async authorizeHistoryMany(sources: readonly SourceRevision[]): Promise<Head[]> {
    const heads = await this.heads(sources.map(logicalId));
    sources.forEach((source, i) => {
      this.sourceScope(source);
      this.permit(heads[i].grant, "turbopuffer");
    });
    return heads;
  }

  async search(query: string, mode: string = "semantic", limit = 10): Promise<EvidenceView[]> {
    const size = new TextEncoder().encode(query).length;
    if (size < 1 || size > 4000 || (mode !== "semantic" && mode !== "keyword") || limit < 1 || limit > 30) {
      throw new CrowboError("Search input is outside the pilot limits");
    }
    const required = mode === "semantic" ? ["turbopuffer", "voyage"] : ["turbopuffer"];
    if (!required.every((p) => this.settings.query_processors.includes(p))) {
      throw new CrowboError("Query processing is not permitted for this route");
    }
    const hits = await this.store.search(this.settings.reader, query, mode, limit, this.groups());
    const views: EvidenceView[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
      if (seen.has(hit.logical_id)) continue;
      const h = await this.head(hit.logical_id);
      if (
        !h ||
        h.revision_id !== hit.revision_id ||
        !this.permits(h.grant, "turbopuffer") ||
        h.withdrawn ||
        h.conflicted ||
        (hit.generation ?? 0) !== h.generation
      ) {
        continue;
      }
      const view = await this.inspect(hit.logical_id);
      if (revisionId(view.source) === hit.revision_id) {
        views.push(view);
        seen.add(hit.logical_id);
      }
    }
    return views;
  }
}

function isValidation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { name?: string }).name === "ZodError";
}
