"""One resumable reconciliation of explicitly selected Slack threads."""

from datetime import timedelta
from typing import Literal

from pydantic import AwareDatetime, Field

from .contracts import Grant, Head, Record, SourceBatch, SourceInput, SourceRevision, digest, now
from .evidence import head_id
from .runtime import CrowboError
from .slack import SlackReadError


class SyncState(Record):
    tenant: str
    reader: str
    identity: str
    config_hash: str
    status: Literal["pending", "ready", "failed"]
    started_at: AwareDatetime
    next_due: AwareDatetime
    retry_not_before: AwareDatetime | None = None
    last_success: AwareDatetime | None = None
    fresh_until: AwareDatetime | None = None
    sources: dict[str, str | None] = Field(default_factory=dict)
    coverage_hash: str | None = None
    error: str | None = None


def load_state(evidence, identifier):
    raw = evidence.store.get(identifier)
    if raw is None:
        return None
    state = SyncState.model_validate(raw)
    if (state.tenant, state.reader) != (evidence.settings.tenant, evidence.settings.reader):
        raise CrowboError("Sync scope is unavailable to this reader")
    return state


def scope_versions(evidence, identifiers, *, require_ready=False):
    versions = {}
    for identifier in sorted(set(identifiers)):
        state = load_state(evidence, identifier)
        ready = state and state.status == "ready" and state.fresh_until and now() < state.fresh_until
        if ready:
            rows = evidence.store.get_many([head_id(key) for key in state.sources])
            for key, revision in state.sources.items():
                raw = rows.get(head_id(key))
                head = Head.model_validate(raw) if raw else None
                if revision is None:
                    ready = ready and (head is None or head.withdrawn or head.grant.revoked)
                else:
                    ready = ready and bool(
                        head
                        and head.logical_id == key
                        and head.revision_id == revision
                        and head.sync_id == identifier
                        and not head.conflicted
                        and evidence.permits(head.grant, "turbopuffer")
                    )
        if require_ready and not ready:
            raise CrowboError("Evidence sync is incomplete or overdue; refresh before reasoning")
        versions[identifier] = state.coverage_hash if ready else None
    return versions


class SlackSync:
    def __init__(self, evidence, spec, reader):
        self.evidence, self.spec, self.reader = evidence, spec, reader
        settings = evidence.settings
        if f"slack:{spec.workspace}" not in settings.source_scopes:
            raise CrowboError("Slack workspace is outside the configured source scope")
        self.identifier = digest(["slack-sync-v1", settings.tenant, settings.reader, spec.name])
        self.identity = digest([spec.workspace, spec.team_id, spec.user_id])

    def _save(self, state, previous):
        self.evidence.store.put(
            self.identifier,
            "sync",
            state.model_dump(mode="json"),
            expected_hash=digest(previous.model_dump(mode="json", exclude_unset=True)) if previous else None,
            insert_only=previous is None,
        )
        return SyncState.model_validate(state.model_dump(mode="json"))

    def status(self):
        state = load_state(self.evidence, self.identifier)
        return {
            "sync_id": self.identifier,
            "state": state.model_dump(mode="json") if state else None,
            "fresh": bool(
                state
                and state.identity == self.identity
                and state.config_hash == digest(self.spec.model_dump(mode="json"))
                and scope_versions(self.evidence, [self.identifier])[self.identifier]
            ),
        }

    def run(self, *, force=False):
        old = load_state(self.evidence, self.identifier)
        at = now()
        config_hash = digest(self.spec.model_dump(mode="json"))
        if old and old.identity != self.identity:
            raise CrowboError("A sync name cannot be rebound to a different workspace or Slack reader")
        if old and (
            (old.retry_not_before and at < old.retry_not_before)
            or (old.status == "pending" and at < old.next_due)
            or (not force and old.config_hash == config_hash and at < old.next_due)
        ):
            return {
                "sync_id": self.identifier,
                "status": "not_due",
                "next_due": old.next_due.isoformat(),
                "errors": [old.error or "Source sync remains incomplete"] if old.status != "ready" else [],
            }
        state = SyncState(
            tenant=self.evidence.settings.tenant,
            reader=self.evidence.settings.reader,
            identity=self.identity,
            config_hash=config_hash,
            status="pending",
            started_at=at,
            next_due=at + timedelta(seconds=self.spec.poll_seconds),
            last_success=old.last_success if old else None,
            fresh_until=old.fresh_until if old else None,
            sources=old.sources if old else {},
            coverage_hash=old.coverage_hash if old else None,
        )
        state = self._save(state, old)
        outcomes = []
        try:
            self.reader.authenticate(self.spec)
            snapshots = []
            for target in self.spec.targets:
                snapshot = self.reader.read(target)
                if (
                    snapshot.native_id != target.native_id
                    or not at - timedelta(seconds=self.spec.freshness_seconds) < snapshot.checked_at <= now()
                ):
                    raise CrowboError("Slack capture identity or observation time is invalid or stale")
                if snapshot.unavailable:
                    logical_id = digest([state.tenant, "slack", self.spec.workspace, target.native_id])
                    self.evidence.withdraw(logical_id, snapshot.checked_at, sync_id=self.identifier)
                snapshots.append((target, snapshot))
            sources, check_times = {}, []
            for target, snapshot in snapshots:
                logical_id = digest([state.tenant, "slack", self.spec.workspace, target.native_id])
                check_times.append(snapshot.checked_at)
                if snapshot.unavailable:
                    sources[logical_id] = None
                    continue
                source = SourceRevision(
                    fingerprint_version=2,
                    tenant=state.tenant,
                    connector="slack",
                    workspace=self.spec.workspace,
                    native_id=target.native_id,
                    source_url=f"https://{self.spec.workspace}.slack.com/archives/{target.channel_id}/p{target.message_ts.replace('.', '')}",
                    title=target.title,
                    text=snapshot.text,
                    updated_at=snapshot.checked_at,
                    observed_at=snapshot.checked_at,
                    timestamp_basis="observation",
                    basis="real",
                    kind="thread",
                    limitations=(
                        "Selected thread only; files are referenced, not fetched.",
                        f"Acquisition method: {snapshot.method}.",
                    ),
                )
                grant = Grant(
                    readers=(state.reader,),
                    processors=self.spec.processors,
                    checked_at=snapshot.checked_at,
                    expires_at=snapshot.checked_at + timedelta(seconds=self.spec.grant_seconds),
                )
                result = self.evidence.ingest(
                    SourceBatch(
                        scope=f"Configured Slack threads: {self.spec.name}",
                        coverage="partial",
                        limitations=(
                            "Complete reads of selected threads do not establish workspace coverage.",
                        ),
                        records=(SourceInput(source=source, grant=grant),),
                    ),
                    sync_id=self.identifier,
                )[0]
                outcomes.append(result)
                if (
                    not result.get("assessment_ready")
                    or not result.get("index_ready")
                    or result.get("errors")
                ):
                    raise CrowboError("Source preparation remains incomplete; retry will resume it")
                sources[logical_id] = source.revision_id
            # A removed target must no longer be eligible through this single-owner scope.
            for logical_id in state.sources.keys() - sources.keys():
                head = self.evidence._head(logical_id)
                if head and head.sync_id == self.identifier:
                    self.evidence.withdraw(logical_id, at, sync_id=self.identifier)
            checked_at = min(check_times)
            if checked_at + timedelta(seconds=self.spec.freshness_seconds) <= now():
                raise CrowboError("Source freshness expired during preparation; read again")
            updated = state.model_copy(
                update={
                    "status": "ready",
                    "sources": sources,
                    "last_success": now(),
                    "fresh_until": checked_at + timedelta(seconds=self.spec.freshness_seconds),
                    "next_due": checked_at + timedelta(seconds=self.spec.poll_seconds),
                    "coverage_hash": digest([config_hash, sources]),
                    "error": None,
                }
            )
            self._save(updated, state)
            return {
                "sync_id": self.identifier,
                "status": "ready",
                "changed": not old or old.coverage_hash != updated.coverage_hash,
                "sources": outcomes,
                "errors": [],
            }
        except (CrowboError, ValueError, TypeError, KeyError) as error:
            delay = error.retry_seconds if isinstance(error, SlackReadError) else self.spec.poll_seconds
            updated = state.model_copy(
                update={
                    "status": "failed",
                    "next_due": now() + timedelta(seconds=delay),
                    "retry_not_before": now() + timedelta(seconds=delay)
                    if isinstance(error, SlackReadError)
                    else None,
                    "error": str(error)
                    if isinstance(error, CrowboError)
                    else "Slack sync input or response validation failed",
                }
            )
            self._save(updated, state)
            return {
                "sync_id": self.identifier,
                "status": "failed",
                "sources": outcomes,
                "errors": [updated.error],
                "next_due": updated.next_due.isoformat(),
            }
