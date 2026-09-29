import fcntl
import json
import os
import sqlite3
import subprocess
from contextlib import contextmanager
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from pydantic import AwareDatetime, Field, model_validator

from .contracts import Record, digest, now


class CrowboError(Exception):
    """A bounded, non-sensitive error that may be shown by the CLI."""


class GroupMembership(Record):
    tenant: str = Field(min_length=1, max_length=100)
    reader: str = Field(min_length=1, max_length=100)
    groups: tuple[Annotated[str, Field(min_length=1, max_length=200)], ...] = Field(max_length=100)
    checked_at: AwareDatetime
    expires_at: AwareDatetime

    @model_validator(mode="after")
    def lease(self):
        if not timedelta(0) < self.expires_at - self.checked_at <= timedelta(hours=1):
            raise ValueError("group membership requires a positive lease of at most one hour")
        return self


class Settings(Record):
    tenant: str = Field(min_length=1, max_length=100)
    reader: str = Field(min_length=1, max_length=100)
    membership: GroupMembership | None = None
    source_scopes: tuple[str, ...]
    runtime_dir: Path
    cloudflare_account: str = Field(pattern=r"^[a-f0-9]{32}$")
    gateway: str = Field(default="default", pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    max_provider_calls: int = Field(default=250, ge=1, le=1750)
    budget_usd: Decimal | None = Field(
        default=None, ge=Decimal("0.05"), le=Decimal("87.50"), decimal_places=2
    )
    query_processors: tuple[str, ...] = ()
    questions_file: Path | None = None
    experiment_id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,79}$")

    @model_validator(mode="after")
    def membership_identity(self):
        if self.experiment_id is None and self.budget_usd is None:
            raise ValueError("legacy settings require a cost reservation or an explicit experiment")
        if self.membership and (self.membership.tenant, self.membership.reader) != (self.tenant, self.reader):
            raise ValueError("group membership must belong to the configured tenant and reader")
        return self

    def active_groups(self, at):
        member = self.membership
        if (
            member is not None
            and (member.tenant, member.reader) == (self.tenant, self.reader)
            and member.checked_at <= at < member.expires_at
        ):
            return member.groups
        return ()

    @property
    def namespace_prefix(self):
        return "crowbo-pilot-" + digest(self.tenant)[:20]


def outside_checkout(path: Path) -> Path:
    path = path.expanduser().resolve()
    checkout = Path(__file__).resolve().parents[2]
    if path == checkout or checkout in path.parents:
        raise CrowboError("Private runtime files must be outside the development checkout")
    for parent in (path, *path.parents):
        if (parent / ".git").exists():
            raise CrowboError("Private runtime files must be outside Git checkouts")
    return path


def read_private(path: Path, max_bytes: int = 1_000_000) -> bytes:
    path = outside_checkout(path)
    if path.stat().st_mode & 0o077:
        raise CrowboError("Private input requires owner-only file permissions (chmod 600)")
    with path.open("rb") as stream:
        data = stream.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise CrowboError("Private input exceeds the configured size limit")
    return data


def secret(service: str) -> str:
    names = {
        "turbopuffer": "TURBOPUFFER_API_KEY",
        "cloudflare": "CLOUDFLARE_API_TOKEN",
        "slack": "SLACK_API_TOKEN",
    }
    value = os.environ.get(names[service])
    if not value:
        try:
            result = subprocess.run(
                [
                    "/usr/bin/security",
                    "find-generic-password",
                    "-a",
                    "crowbo",
                    "-s",
                    "crowbo/" + service,
                    "-w",
                ],
                capture_output=True,
                timeout=60,
                check=False,
            )
            value = result.stdout.decode("ascii").rstrip("\r\n") if result.returncode == 0 else None
        except (OSError, UnicodeError, subprocess.TimeoutExpired):
            value = None
    if not value or not 16 <= len(value) <= 2048 or not value.isascii() or any(c.isspace() for c in value):
        raise CrowboError("Required provider credential is unavailable")
    return value


class Runtime:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.directory = outside_checkout(settings.runtime_dir)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.directory.stat().st_mode & 0o077:
            raise CrowboError("Runtime directory requires owner-only permissions (chmod 700)")
        db = self.directory / "operations.sqlite3"
        fd = os.open(db, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(fd)
        if db.stat().st_mode & 0o077:
            raise CrowboError("Runtime database requires owner-only permissions")
        self.db = sqlite3.connect(db)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, at TEXT, provider TEXT, operation TEXT, receipt TEXT)"
        )
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            if "experiment_id" not in {row[1] for row in self.db.execute("PRAGMA table_info(calls)")}:
                self.db.execute("ALTER TABLE calls ADD COLUMN experiment_id TEXT")
            self.db.execute(
                "CREATE TABLE IF NOT EXISTS experiments (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, "
                "reader TEXT NOT NULL, max_requests INTEGER NOT NULL, max_models INTEGER NOT NULL, created_at TEXT NOT NULL)"
            )

    @contextmanager
    def locked(self):
        fd = os.open(self.directory / "worker.lock", os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            raise CrowboError("Another local Crowbo operation is running") from None
        try:
            yield
        finally:
            os.close(fd)

    def reserve(self, provider: str, operation: str) -> int:
        if self.settings.experiment_id is not None:
            # Reservation and quota check share a write transaction, even across processes.
            try:
                self.db.execute("BEGIN IMMEDIATE")
                status = self.experiment_status()
                if status["requests"] >= status["max_requests"]:
                    raise CrowboError("Experiment request allowance exhausted")
                if operation in {"review", "assess"} and status["model_calls"] >= status["max_models"]:
                    raise CrowboError("Experiment model-call allowance exhausted")
                cursor = self.db.execute(
                    "INSERT INTO calls (at, provider, operation, experiment_id) VALUES (?, ?, ?, ?)",
                    (now().isoformat(), provider, operation, self.settings.experiment_id),
                )
                self.db.commit()
                return cursor.lastrowid
            except Exception:
                self.db.rollback()
                raise
        count = self.db.execute("SELECT count(*) FROM calls").fetchone()[0]
        if count >= self.settings.max_provider_calls:
            raise CrowboError("Pilot request allowance exhausted; review usage before increasing it")
        # Conservative application reservation, not a provider invoice or account-wide cap.
        if self.settings.budget_usd is None or (count + 1) * 5 > int(self.settings.budget_usd * 100):
            raise CrowboError("Pilot cost reservation exhausted; review provider billing before continuing")
        cursor = self.db.execute(
            "INSERT INTO calls (at, provider, operation) VALUES (?, ?, ?)",
            (now().isoformat(), provider, operation),
        )
        self.db.commit()
        return cursor.lastrowid

    def create_experiment(self, max_requests: int, max_models: int):
        identifier = self.settings.experiment_id
        if identifier is None or not 1 <= max_models <= max_requests <= 10000:
            raise CrowboError("Select an experiment and valid request/model-call limits")
        values = (identifier, self.settings.tenant, self.settings.reader, max_requests, max_models)
        with self.db:
            self.db.execute(
                "INSERT OR IGNORE INTO experiments VALUES (?, ?, ?, ?, ?, ?)",
                (*values, now().isoformat()),
            )
            stored = self.db.execute(
                "SELECT id, tenant, reader, max_requests, max_models FROM experiments WHERE id = ?",
                (identifier,),
            ).fetchone()
            if stored != values:
                raise CrowboError("Experiment identity and allocation cannot be changed")
        return self.experiment_status()

    def experiment_status(self):
        row = self.db.execute(
            "SELECT max_requests, max_models, created_at FROM experiments WHERE id = ? AND tenant = ? AND reader = ?",
            (self.settings.experiment_id, self.settings.tenant, self.settings.reader),
        ).fetchone()
        if row is None:
            raise CrowboError("Experiment unavailable; the operator must create it explicitly")
        requests, models = self.db.execute(
            "SELECT count(*), coalesce(sum(operation IN ('review', 'assess')), 0) FROM calls WHERE experiment_id = ?",
            (self.settings.experiment_id,),
        ).fetchone()
        return {
            "experiment_id": self.settings.experiment_id,
            "max_requests": row[0],
            "max_models": row[1],
            "created_at": row[2],
            "requests": requests,
            "model_calls": models,
            "billing": "Not a dollar estimate; consult provider usage and invoices.",
        }

    def receipt(self, call_id: int, values: dict):
        self.db.execute("UPDATE calls SET receipt = ? WHERE id = ?", (json.dumps(values), call_id))
        self.db.commit()

    def write_report(self, name: str, value: dict):
        path = self.directory / name
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
        return path

    def close(self):
        self.db.close()
