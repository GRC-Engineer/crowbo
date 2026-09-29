from datetime import timedelta

from .contracts import Assessment, EvidenceView, Head, SourceBatch, SourceRevision, digest, now
from .questions import DEFAULT_QUESTIONS, QuestionSet
from .runtime import CrowboError, Settings


def head_id(logical_id):
    return digest(["head", logical_id])


def assessment_id(revision_id, version=DEFAULT_QUESTIONS.version, fingerprint=DEFAULT_QUESTIONS.fingerprint):
    return digest(["assessment", revision_id, version, fingerprint, "typesafe/jev"])


class Evidence:
    """Owns revision binding, current grants and resumable preparation for one local operator."""

    def __init__(self, settings: Settings, store, jev, questions=DEFAULT_QUESTIONS):
        self.settings, self.store, self.jev = settings, store, jev
        self.questions = questions

    def _source_scope(self, source):
        if (
            source.tenant != self.settings.tenant
            or f"{source.connector}:{source.workspace}" not in self.settings.source_scopes
        ):
            raise CrowboError("Source is outside this tenant or the configured source scope")

    def permits(self, grant, processor=None):
        at = now()
        return grant.permits(self.settings.reader, at, processor, groups=self.settings.active_groups(at))

    def _permit(self, grant, processor=None):
        if not self.permits(grant, processor):
            raise CrowboError("Current reader or processing permission is unavailable")

    def _head(self, logical_id):
        data = self.store.get(head_id(logical_id))
        head = Head.model_validate(data) if data else None
        if head and head.logical_id != logical_id:
            raise CrowboError("Source head identity mismatch")
        return head

    def _save_head(self, head, previous):
        body = head.model_dump(mode="json")
        self.store.put(
            head_id(head.logical_id),
            "head",
            body,
            logical_id=head.logical_id,
            revision_id=head.revision_id,
            readers=() if head.withdrawn or head.grant.revoked else head.grant.readers,
            reader_groups=() if head.withdrawn or head.grant.revoked else head.grant.reader_groups,
            expires_at=head.grant.expires_at.isoformat(),
            expected_hash=digest(previous.model_dump(mode="json", exclude_unset=True)) if previous else None,
            insert_only=previous is None,
        )
        return Head.model_validate(body)

    def _current(self, head, processor=None):
        current = self._head(head.logical_id)
        if current != head:
            raise CrowboError("Evidence or permissions changed during this operation")
        self._permit(head.grant, processor)
        if head.withdrawn:
            raise CrowboError("Source has been withdrawn")
        if head.conflicted:
            raise CrowboError("Conflicting source revisions require reconciliation")

    def ingest(self, batch: SourceBatch, *, sync_id=None):
        for item in batch.records:
            self._source_scope(item.source)
        outcomes = []
        for item in batch.records:
            source, grant = item.source, item.grant
            old = self._head(source.logical_id)
            if old and sync_id and old.sync_id not in (None, sync_id):
                raise CrowboError("Source already belongs to another sync scope")
            if old and grant.checked_at < old.grant.checked_at:
                raise CrowboError("An older permission snapshot cannot replace current permissions")
            if grant.checked_at > now():
                raise CrowboError("Permission check time is in the future")
            if old and grant.checked_at == old.grant.checked_at and grant != old.grant:
                raise CrowboError("Conflicting permission snapshots require reconciliation")
            if not self.permits(grant, "turbopuffer"):
                if old:
                    withdrawn = (
                        old.withdrawn
                        or grant.revoked
                        or not ((grant.readers or grant.reader_groups) and "turbopuffer" in grant.processors)
                    )
                    self._save_head(
                        old.model_copy(
                            update={
                                "grant": grant,
                                "indexed_revision": None if withdrawn else old.indexed_revision,
                                "index_grant_hash": None,
                                "withdrawn": withdrawn,
                            }
                        ),
                        old,
                    )
                    if withdrawn:
                        self.store.delete_chunks(old.logical_id, old.generation)
                outcomes.append({"logical_id": source.logical_id, "status": "access_denied"})
                continue
            if old and source.updated_at < old.updated_at:
                if grant != old.grant:
                    self._save_head(old.model_copy(update={"grant": grant, "index_grant_hash": None}), old)
                outcomes.append({"logical_id": source.logical_id, "status": "older_revision_ignored"})
                continue
            existing = self.store.get(source.revision_id)
            if existing:
                stored = SourceRevision.model_validate(existing)
                if stored.revision_id != source.revision_id:
                    raise CrowboError("Stored source revision failed its integrity check")
            else:
                self.store.put(
                    source.revision_id,
                    "revision",
                    source.model_dump(mode="json"),
                    logical_id=source.logical_id,
                    revision_id=source.revision_id,
                    insert_only=True,
                )
            if old and source.updated_at == old.updated_at and source.revision_id != old.revision_id:
                self._save_head(old.model_copy(update={"conflicted": True, "grant": grant}), old)
                outcomes.append({"logical_id": source.logical_id, "status": "conflicting_revision"})
                continue
            unchanged = old is not None and old.revision_id == source.revision_id
            same_index = unchanged and not old.withdrawn and not old.grant.revoked
            head = Head(
                logical_id=source.logical_id,
                revision_id=source.revision_id,
                updated_at=source.updated_at,
                grant=grant,
                scope=batch.scope,
                coverage=batch.coverage,
                limitations=batch.limitations,
                assessment_id=old.assessment_id if unchanged else None,
                indexed_revision=old.indexed_revision if same_index else None,
                conflicted=old.conflicted if unchanged else False,
                generation=old.generation if same_index else (old.generation + 1 if old else 1),
                last_checked_at=source.observed_at,
                index_grant_hash=old.index_grant_hash if same_index else None,
                sync_id=sync_id or (old.sync_id if old else None),
            )
            if head != old:
                head = self._save_head(head, old)
            else:
                head = old
            outcomes.append(self._prepare_safely(head))
        return outcomes

    def withdraw(self, logical_id, checked_at, *, sync_id=None):
        old = self._head(logical_id)
        if old is None:
            return
        if sync_id and old.sync_id not in (None, sync_id):
            raise CrowboError("Source already belongs to another sync scope")
        if checked_at < old.grant.checked_at or checked_at > now():
            raise CrowboError("Withdrawal permission check is out of order")
        source = SourceRevision.model_validate(self.store.get(old.revision_id))
        self._source_scope(source)
        if source.logical_id != old.logical_id or source.revision_id != old.revision_id:
            raise CrowboError("Withdrawal source does not match its current head")
        grant = old.grant.model_copy(
            update={"revoked": True, "checked_at": checked_at, "expires_at": checked_at + timedelta(hours=1)}
        )
        self._save_head(
            old.model_copy(update={"grant": grant, "withdrawn": True, "indexed_revision": None}), old
        )
        self.store.delete_chunks(logical_id, old.generation)

    def _prepare(self, head):
        self._current(head, "turbopuffer")
        source = SourceRevision.model_validate(self.store.get(head.revision_id))
        self._source_scope(source)
        if source.revision_id != head.revision_id or source.logical_id != head.logical_id:
            raise CrowboError("Source head does not match its stored revision")
        outcome = {"logical_id": head.logical_id, "revision_id": head.revision_id, "errors": []}
        aid = assessment_id(source.revision_id, self.questions.version, self.questions.fingerprint)
        if head.assessment_id != aid:
            try:
                self._current(head, "jev")
                prior = self.store.get(aid)
                assessed = Assessment.model_validate(prior) if prior else self.jev.assess(source)
                if assessed.source_revision != source.revision_id:
                    raise CrowboError("Assessment does not match its input revision and criteria")
                self.questions.check(assessed)
                self._current(head, "jev")
                if prior is None:
                    self.store.put(
                        aid,
                        "assessment",
                        assessed.model_dump(mode="json"),
                        logical_id=head.logical_id,
                        revision_id=head.revision_id,
                    )
                updated = head.model_copy(update={"assessment_id": aid})
                head = self._save_head(updated, head)
            except (CrowboError, ValueError) as error:
                if not isinstance(error, CrowboError):
                    error = CrowboError("Assessment does not match the configured questions")
                outcome["errors"].append({"stage": "jev", "error": str(error)})
        if head.indexed_revision != head.revision_id:
            try:
                self._current(head, "voyage")
                self.store.index(source, head.grant, head.generation)
                self._current(head, "voyage")
                updated = head.model_copy(
                    update={
                        "indexed_revision": head.revision_id,
                        "index_grant_hash": digest(head.grant.model_dump(mode="json")),
                    }
                )
                head = self._save_head(updated, head)
            except CrowboError as error:
                outcome["errors"].append({"stage": "embedding", "error": str(error)})
        elif head.index_grant_hash != digest(head.grant.model_dump(mode="json")):
            try:
                self._current(head, "turbopuffer")
                self.store.refresh_index(source, head.grant, head.generation)
                self._current(head, "turbopuffer")
                updated = head.model_copy(
                    update={"index_grant_hash": digest(head.grant.model_dump(mode="json"))}
                )
                head = self._save_head(updated, head)
            except CrowboError as error:
                outcome["errors"].append({"stage": "index_permissions", "error": str(error)})
        outcome.update(
            assessment_ready=head.assessment_id == aid,
            index_ready=head.indexed_revision == head.revision_id
            and head.index_grant_hash == digest(head.grant.model_dump(mode="json")),
        )
        return outcome

    def resume(self):
        return [
            self._prepare_safely(Head.model_validate(row))
            for row in self.store.heads(self.settings.reader, groups=self.settings.active_groups(now()))
        ]

    def _prepare_safely(self, head):
        try:
            return self._prepare(head)
        except CrowboError as error:
            return {"logical_id": head.logical_id, "errors": [{"stage": "source", "error": str(error)}]}

    def inspect(self, logical_id: str) -> EvidenceView:
        return self.inspect_many([logical_id])[0]

    def _heads(self, logical_ids):
        rows = self.store.get_many([head_id(key) for key in logical_ids])
        heads = []
        for key in logical_ids:
            raw = rows.get(head_id(key))
            if raw is None:
                raise CrowboError("Record is unavailable")
            head = Head.model_validate(raw)
            if head.logical_id != key:
                raise CrowboError("Source head identity mismatch")
            heads.append(head)
        return heads

    def inspect_many(self, logical_ids):
        keys = tuple(logical_ids)
        if not 1 <= len(keys) <= 40 or len(set(keys)) != len(keys):
            raise CrowboError("Evidence selection is outside the pilot limits")
        heads = self._heads(keys)
        for head in heads:
            self._permit(head.grant, "turbopuffer")
            if head.withdrawn:
                raise CrowboError("Source has been withdrawn")
            if head.conflicted:
                raise CrowboError("Conflicting source revisions require reconciliation")
        identifiers = [head.revision_id for head in heads]
        identifiers.extend(head.assessment_id for head in heads if head.assessment_id)
        rows = self.store.get_many(identifiers)
        views = [self._view(head, rows) for head in heads]
        if self._heads(keys) != heads:
            raise CrowboError("Evidence or permissions changed during this operation")
        for head in heads:
            self._permit(head.grant, "turbopuffer")
        return views

    def _view(self, head, rows):
        source = SourceRevision.model_validate(rows.get(head.revision_id))
        self._source_scope(source)
        if source.revision_id != head.revision_id or source.logical_id != head.logical_id:
            raise CrowboError("Source revision integrity check failed")
        assessment = None
        if head.assessment_id:
            raw = rows.get(head.assessment_id)
            if raw is None:
                raise CrowboError("Referenced assessment is unavailable")
            assessment = Assessment.model_validate(raw)
            if assessment.source_revision != head.revision_id or head.assessment_id != assessment_id(
                head.revision_id, assessment.criteria_version, assessment.criteria_hash
            ):
                raise CrowboError("Assessment revision or criteria mismatch")
            if assessment.questions:
                QuestionSet(version=assessment.criteria_version, questions=assessment.questions).check(
                    assessment
                )
        return EvidenceView(
            source=source,
            assessment=assessment,
            coverage=head.coverage,
            limitations=head.limitations,
            index_ready=head.indexed_revision == head.revision_id
            and head.index_grant_hash == digest(head.grant.model_dump(mode="json")),
            assessment_current=assessment is not None
            and assessment.criteria_version == self.questions.version
            and assessment.criteria_hash == self.questions.fingerprint,
            last_checked_at=head.last_checked_at or source.observed_at,
            sync_id=head.sync_id,
        )

    def check_processing(self, view: EvidenceView, processor: str):
        self.check_processing_many([view], processor)

    def check_processing_many(self, views, processor: str):
        heads = self._heads([view.source.logical_id for view in views])
        for view, head in zip(views, heads, strict=True):
            self._check_processing(view, head, processor)

    def _check_processing(self, view, head, processor):
        self._source_scope(view.source)
        self._permit(head.grant, processor)
        self._permit(head.grant, "turbopuffer")
        if head.withdrawn:
            raise CrowboError("Source has been withdrawn")
        if head.conflicted:
            raise CrowboError("Conflicting source revisions require reconciliation")
        if head.revision_id != view.source.revision_id:
            raise CrowboError("Evidence changed during this operation")
        expected = (
            None
            if view.assessment is None
            else assessment_id(
                view.source.revision_id, view.assessment.criteria_version, view.assessment.criteria_hash
            )
        )
        if head.assessment_id != expected:
            raise CrowboError("Assessment changed during this operation")

    def list_current(self):
        return [
            self.inspect(row["logical_id"])
            for row in self.store.heads(self.settings.reader, groups=self.settings.active_groups(now()))
        ]

    def authorize_history(self, source: SourceRevision):
        return self.authorize_history_many([source])[0]

    def authorize_history_many(self, sources):
        heads = self._heads([source.logical_id for source in sources])
        for source, head in zip(sources, heads, strict=True):
            self._source_scope(source)
            self._permit(head.grant, "turbopuffer")
        return heads

    def search(self, query: str, mode="semantic", limit=10):
        if (
            not 1 <= len(query.encode()) <= 4000
            or mode not in {"semantic", "keyword"}
            or not 1 <= limit <= 30
        ):
            raise CrowboError("Search input is outside the pilot limits")
        required = {"turbopuffer", "voyage"} if mode == "semantic" else {"turbopuffer"}
        if not required.issubset(self.settings.query_processors):
            raise CrowboError("Query processing is not permitted for this route")
        hits = self.store.search(
            self.settings.reader, query, mode, limit, groups=self.settings.active_groups(now())
        )
        views, seen = [], set()
        for hit in hits:
            logical_id = hit["logical_id"]
            if logical_id in seen:
                continue
            head = self._head(logical_id)
            if (
                head is None
                or head.revision_id != hit["revision_id"]
                or not self.permits(head.grant, "turbopuffer")
                or head.withdrawn
                or head.conflicted
                or hit.get("generation", 0) != head.generation
            ):
                continue
            view = self.inspect(logical_id)
            if view.source.revision_id == hit["revision_id"]:
                views.append(view)
                seen.add(logical_id)
        return views
