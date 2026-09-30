import { z } from "zod";
import { digest } from "../domain/canonical";
import { grant as grantSchema, head as headSchema, logicalId, revisionId, sourceBatch, sourceRevision } from "../domain/contracts";
import { CrowboError } from "../domain/errors";
import { addMicros, instant, type Instant, micros, now, SECOND } from "../domain/time";
import { nativeId, type SlackSpec, SlackReadError, type ThreadReader } from "../providers/slack";
import { type Evidence, headId } from "./evidence";

/** One resumable reconciliation of explicitly selected Slack threads. */

export const syncState = z.strictObject({
  tenant: z.string(),
  reader: z.string(),
  identity: z.string(),
  config_hash: z.string(),
  status: z.enum(["pending", "ready", "failed"]),
  started_at: instant,
  next_due: instant,
  retry_not_before: instant.nullable().default(null),
  last_success: instant.nullable().default(null),
  fresh_until: instant.nullable().default(null),
  sources: z.record(z.string(), z.string().nullable()).default({}),
  coverage_hash: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type SyncState = z.infer<typeof syncState>;

/** Hash of each sync state exactly as stored, for compare-and-swap on legacy rows. */
const storedHash = new WeakMap<SyncState, string>();

export async function loadState(evidence: Evidence, id: string): Promise<SyncState | null> {
  const raw = await evidence.store.get(id);
  if (!raw) return null;
  const state = syncState.parse(raw);
  storedHash.set(state, digest(raw));
  if (state.tenant !== evidence.settings.tenant || state.reader !== evidence.settings.reader) {
    throw new CrowboError("Sync scope is unavailable to this reader");
  }
  return state;
}

export async function scopeVersions(
  evidence: Evidence,
  ids: readonly string[],
  options: { requireReady?: boolean } = {},
): Promise<Record<string, string | null>> {
  const versions: Record<string, string | null> = {};
  for (const id of [...new Set(ids)].sort()) {
    const state = await loadState(evidence, id);
    let ready = !!state && state.status === "ready" && !!state.fresh_until && micros(now()) < micros(state.fresh_until);
    if (ready && state) {
      const rows = await evidence.store.getMany(Object.keys(state.sources).map(headId));
      for (const [key, revision] of Object.entries(state.sources)) {
        const raw = rows[headId(key)];
        const h = raw ? headSchema.parse(raw) : null;
        if (revision === null) ready &&= h === null || h.withdrawn || h.grant.revoked;
        else {
          ready &&= !!(
            h &&
            h.logical_id === key &&
            h.revision_id === revision &&
            h.sync_id === id &&
            !h.conflicted &&
            evidence.permits(h.grant, "turbopuffer")
          );
        }
      }
    }
    if (options.requireReady && !ready) throw new CrowboError("Evidence sync is incomplete or overdue; refresh before reasoning");
    versions[id] = ready ? state!.coverage_hash : null;
  }
  return versions;
}

export class SlackSync {
  readonly identifier: string;
  readonly identity: string;

  constructor(
    readonly evidence: Evidence,
    readonly spec: SlackSpec,
    readonly reader: ThreadReader,
  ) {
    const s = evidence.settings;
    if (!s.source_scopes.includes(`slack:${spec.workspace}`)) throw new CrowboError("Slack workspace is outside the configured source scope");
    this.identifier = digest(["slack-sync-v1", s.tenant, s.reader, spec.name]);
    this.identity = digest([spec.workspace, spec.team_id, spec.user_id]);
  }

  private async save(state: SyncState, previous: SyncState | null): Promise<SyncState> {
    await this.evidence.store.put(this.identifier, "sync", state, {
      expectedHash: previous ? (storedHash.get(previous) ?? digest(previous)) : null,
      insertOnly: previous === null,
    });
    const saved = syncState.parse(state);
    storedHash.set(saved, digest(state));
    return saved;
  }

  async status() {
    const state = await loadState(this.evidence, this.identifier);
    return {
      sync_id: this.identifier,
      state,
      fresh: !!(
        state &&
        state.identity === this.identity &&
        state.config_hash === digest(this.spec) &&
        (await scopeVersions(this.evidence, [this.identifier]))[this.identifier]
      ),
    };
  }

  async run(options: { force?: boolean } = {}) {
    const old = await loadState(this.evidence, this.identifier);
    const at = now();
    const configHash = digest(this.spec);
    const t = (x: Instant) => micros(x);
    if (old && old.identity !== this.identity) {
      throw new CrowboError("A sync name cannot be rebound to a different workspace or Slack reader");
    }
    if (
      old &&
      ((old.retry_not_before && t(at) < t(old.retry_not_before)) ||
        (old.status === "pending" && t(at) < t(old.next_due)) ||
        (!options.force && old.config_hash === configHash && t(at) < t(old.next_due)))
    ) {
      return {
        sync_id: this.identifier,
        status: "not_due",
        next_due: old.next_due,
        errors: old.status !== "ready" ? [old.error ?? "Source sync remains incomplete"] : [],
      };
    }
    const seconds = (n: number) => BigInt(n) * SECOND;
    let state = await this.save(
      syncState.parse({
        tenant: this.evidence.settings.tenant,
        reader: this.evidence.settings.reader,
        identity: this.identity,
        config_hash: configHash,
        status: "pending",
        started_at: at,
        next_due: addMicros(at, seconds(this.spec.poll_seconds)),
        last_success: old?.last_success ?? null,
        fresh_until: old?.fresh_until ?? null,
        sources: old?.sources ?? {},
        coverage_hash: old?.coverage_hash ?? null,
      }),
      old,
    );
    const outcomes: Record<string, any>[] = [];
    try {
      await this.reader.authenticate(this.spec);
      const snapshots = [];
      for (const target of this.spec.targets) {
        const snapshot = await this.reader.read(target);
        const earliest = t(at) - seconds(this.spec.freshness_seconds);
        if (snapshot.native_id !== nativeId(target) || !(earliest < t(snapshot.checked_at) && t(snapshot.checked_at) <= t(now()))) {
          throw new CrowboError("Slack capture identity or observation time is invalid or stale");
        }
        if (snapshot.unavailable) {
          const lid = digest([state.tenant, "slack", this.spec.workspace, nativeId(target)]);
          await this.evidence.withdraw(lid, snapshot.checked_at, { syncId: this.identifier });
        }
        snapshots.push({ target, snapshot });
      }
      const sources: Record<string, string | null> = {};
      const checkTimes: Instant[] = [];
      for (const { target, snapshot } of snapshots) {
        const lid = digest([state.tenant, "slack", this.spec.workspace, nativeId(target)]);
        checkTimes.push(snapshot.checked_at);
        if (snapshot.unavailable) {
          sources[lid] = null;
          continue;
        }
        const source = sourceRevision.parse({
          fingerprint_version: 2,
          tenant: state.tenant,
          connector: "slack",
          workspace: this.spec.workspace,
          native_id: nativeId(target),
          source_url: `https://${this.spec.workspace}.slack.com/archives/${target.channel_id}/p${target.message_ts.replace(".", "")}`,
          title: target.title,
          text: snapshot.text,
          updated_at: snapshot.checked_at,
          observed_at: snapshot.checked_at,
          timestamp_basis: "observation",
          basis: "real",
          kind: "thread",
          limitations: ["Selected thread only; files are referenced, not fetched.", `Acquisition method: ${snapshot.method}.`],
        });
        const grant = grantSchema.parse({
          readers: [state.reader],
          processors: this.spec.processors,
          checked_at: snapshot.checked_at,
          expires_at: addMicros(snapshot.checked_at, seconds(this.spec.grant_seconds)),
        });
        const [result] = await this.evidence.ingest(
          sourceBatch.parse({
            scope: `Configured Slack threads: ${this.spec.name}`,
            coverage: "partial",
            limitations: ["Complete reads of selected threads do not establish workspace coverage."],
            records: [{ source, grant }],
          }),
          { syncId: this.identifier },
        );
        outcomes.push(result);
        if (!result.assessment_ready || !result.index_ready || (result.errors && result.errors.length)) {
          throw new CrowboError("Source preparation remains incomplete; retry will resume it");
        }
        sources[lid] = revisionId(source);
      }
      // A removed target must no longer be eligible through this single-owner scope.
      for (const lid of Object.keys(state.sources).filter((k) => !(k in sources))) {
        const h = await this.evidence.head(lid);
        if (h && h.sync_id === this.identifier) await this.evidence.withdraw(lid, at, { syncId: this.identifier });
      }
      const checkedAt = checkTimes.reduce((a, b) => (t(a) <= t(b) ? a : b));
      if (t(checkedAt) + seconds(this.spec.freshness_seconds) <= t(now())) {
        throw new CrowboError("Source freshness expired during preparation; read again");
      }
      const updated = syncState.parse({
        ...state,
        status: "ready",
        sources,
        last_success: now(),
        fresh_until: addMicros(checkedAt, seconds(this.spec.freshness_seconds)),
        next_due: addMicros(checkedAt, seconds(this.spec.poll_seconds)),
        coverage_hash: digest([configHash, sources]),
        error: null,
      });
      await this.save(updated, state);
      return {
        sync_id: this.identifier,
        status: "ready",
        changed: !old || old.coverage_hash !== updated.coverage_hash,
        sources: outcomes,
        errors: [],
      };
    } catch (error) {
      const known = error instanceof CrowboError || (error instanceof Error && ["ZodError", "TypeError"].includes(error.name));
      if (!known) throw error;
      const delay = error instanceof SlackReadError ? error.retrySeconds : this.spec.poll_seconds;
      const updated = syncState.parse({
        ...state,
        status: "failed",
        next_due: addMicros(now(), seconds(delay)),
        retry_not_before: error instanceof SlackReadError ? addMicros(now(), seconds(delay)) : null,
        error: error instanceof CrowboError ? error.message : "Slack sync input or response validation failed",
      });
      await this.save(updated, state);
      return { sync_id: this.identifier, status: "failed", sources: outcomes, errors: [updated.error], next_due: updated.next_due };
    }
  }
}

export { logicalId };
