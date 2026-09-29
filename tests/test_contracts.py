from datetime import timedelta

import pytest
from pydantic import ValidationError

from crowbo.contracts import SourceRevision, digest


def test_stored_legacy_revision_keeps_its_original_identity(item):
    legacy = item.source.model_dump(mode="json", exclude={"timestamp_basis", "fingerprint_version"})
    original_id = digest({key: value for key, value in legacy.items() if key != "observed_at"})
    loaded = SourceRevision.model_validate(legacy)
    assert loaded.revision_id == original_id
    assert SourceRevision.model_validate_json(loaded.model_dump_json()).revision_id == original_id


def test_capture_timestamp_is_explicit_and_cannot_impersonate_native_update(item):
    body = item.source.model_dump()
    body.update(timestamp_basis="observation", updated_at=body["observed_at"])
    snapshot = SourceRevision.model_validate(body)
    assert snapshot.revision_id != item.source.revision_id
    body["updated_at"] -= timedelta(seconds=1)
    with pytest.raises(ValidationError, match="capture timestamp"):
        SourceRevision.model_validate(body)
