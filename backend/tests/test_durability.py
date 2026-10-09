from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.cloud.storage import Bucket
from sqlalchemy.orm import Session

from app.api.deps import get_backup_caller_verifier, get_repositories
from app.domain.errors import AuthenticationError
from app.durability.backup import BackupLocation, BackupService
from app.durability.commit import DurableCommitter, PlainCommitter
from app.durability.errors import (
    ArchiveTimeoutError,
    BackupFailedError,
    LeaseLostError,
    LeaseUnavailableError,
)
from app.durability.lease import GcsLease, LeaseWatcher
from app.durability.runtime import Durability
from app.repositories.protocols import Repositories
from tests.fakes import FakeClock
from tests.test_api import login


class FakeSession:
    def __init__(self, log: list[str]) -> None:
        self.log = log

    def flush(self) -> None:
        self.log.append("flush")

    def commit(self) -> None:
        self.log.append("commit")


class FakeLease:
    def __init__(self, log: list[str], lost_after_checks: int | None = None) -> None:
        self.log = log
        self.checks = 0
        self.lost_after_checks = lost_after_checks

    def check(self) -> None:
        self.checks += 1
        self.log.append("lease")
        if self.lost_after_checks is not None and self.checks > self.lost_after_checks:
            raise LeaseLostError("taken over")


class FakeWal:
    def __init__(self, log: list[str], wrote: bool, archived: list[str | None]) -> None:
        self.log = log
        self.wrote = wrote
        self.archived = archived

    def has_written(self, session: Session) -> bool:
        return self.wrote

    def close_segment(self, session: Session) -> str:
        self.log.append("switch")
        return "000000020000000000000010"

    def last_archived(self, session: Session) -> str | None:
        self.log.append("poll")
        return self.archived.pop(0) if len(self.archived) > 1 else self.archived[0]


class FakeTime:
    def __init__(self) -> None:
        self.now = 0.0

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += seconds


def commit_with(wal: FakeWal, lease: FakeLease, log: list[str], time: FakeTime) -> None:
    committer = DurableCommitter(
        lease, wal, timedelta(seconds=1), 0.1, monotonic=time.monotonic, sleep=time.sleep
    )
    committer.commit(cast(Session, FakeSession(log)))


def test_write_is_confirmed_only_after_its_segment_is_archived() -> None:
    log: list[str] = []
    archived: list[str | None] = [
        "00000002.history",
        "00000002000000000000000F",
        "000000020000000000000010",
    ]
    wal = FakeWal(log, wrote=True, archived=archived)

    commit_with(wal, FakeLease(log), log, FakeTime())

    assert log == ["flush", "lease", "commit", "switch", "poll", "poll", "poll", "lease"]


def test_read_only_request_skips_archiving_and_lease() -> None:
    log: list[str] = []

    commit_with(FakeWal(log, wrote=False, archived=[None]), FakeLease(log), log, FakeTime())

    assert log == ["flush", "commit"]


def test_write_is_refused_before_commit_when_lease_is_lost() -> None:
    log: list[str] = []
    wal = FakeWal(log, wrote=True, archived=["000000020000000000000010"])

    with pytest.raises(LeaseLostError):
        commit_with(wal, FakeLease(log, lost_after_checks=0), log, FakeTime())

    assert "commit" not in log


def test_lease_lost_while_archiving_is_not_confirmed() -> None:
    log: list[str] = []
    wal = FakeWal(log, wrote=True, archived=["000000020000000000000010"])

    with pytest.raises(LeaseLostError):
        commit_with(wal, FakeLease(log, lost_after_checks=1), log, FakeTime())


def test_archive_timeout_is_an_error() -> None:
    log: list[str] = []
    wal = FakeWal(log, wrote=True, archived=["00000002000000000000000F"])

    with pytest.raises(ArchiveTimeoutError):
        commit_with(wal, FakeLease(log), log, FakeTime())


class UnreachableBucket:
    def get_blob(self, name: str) -> None:
        raise ConnectionError("connection refused")


class FlakyLease:
    def __init__(self, error: Exception | None) -> None:
        self.error = error

    def check(self) -> None:
        if self.error is not None:
            raise self.error


def test_unreachable_storage_makes_the_lease_unavailable() -> None:
    lease = GcsLease(cast(Bucket, UnreachableBucket()), "lease/owner", 1)

    with pytest.raises(LeaseUnavailableError):
        lease.check()


@pytest.mark.parametrize(
    ("error", "keeps_watching", "stops"),
    [
        (None, True, False),
        (LeaseUnavailableError("storage down"), True, False),
        (LeaseLostError("taken over"), False, True),
    ],
)
def test_lease_watcher_stops_the_server_only_when_the_lease_is_lost(
    error: Exception | None, keeps_watching: bool, stops: bool
) -> None:
    stopped: list[bool] = []
    watcher = LeaseWatcher(FlakyLease(error), lambda: stopped.append(True), 30)

    assert watcher.check_once() is keeps_watching
    assert bool(stopped) is stops


def test_lease_loss_returns_503_and_stops_the_server(api_client: TestClient) -> None:
    login(api_client)
    app = api_client.app
    assert isinstance(app, FastAPI)
    repositories = app.dependency_overrides[get_repositories]()
    stopped: list[bool] = []
    app.state.durability = Durability(PlainCommitter(), None, lambda: stopped.append(True))

    def lease_lost_commit() -> Iterator[Repositories]:
        yield repositories
        raise LeaseLostError("taken over")

    app.dependency_overrides[get_repositories] = lease_lost_commit

    response = api_client.post("/api/time-entries/start", json={"description": "Late"})

    assert response.status_code == 503
    assert stopped == [True]


class FakeTools:
    def __init__(self, log: list[str], fail_base_backup: bool = False) -> None:
        self.log = log
        self.fail_base_backup = fail_base_backup

    def push_base_backup(self) -> None:
        if self.fail_base_backup:
            raise BackupFailedError("wal-g failed")
        self.log.append("base backup")

    def dump_database(self, path: Path) -> None:
        path.write_bytes(b"dump")
        self.log.append("dump")

    def upload(self, path: Path, object_name: str) -> None:
        self.log.append(f"upload {object_name}")


NOON = datetime(2026, 10, 6, 6, 0, tzinfo=UTC)


def backup_service(log: list[str], lease: FakeLease, tools: FakeTools) -> BackupService:
    return BackupService(lease, tools, BackupLocation("eidos-tempo", "prod"), FakeClock(NOON))


def test_backup_pushes_base_backup_and_uploads_dump() -> None:
    log: list[str] = []

    result = backup_service(log, FakeLease(log), FakeTools(log)).run()

    assert result.dump_object == "backups/prod/dumps/tempo-20261006-060000.dump"
    assert result.dump_bytes == 4
    assert log == ["lease", "base backup", "dump", f"upload {result.dump_object}"]


def test_backup_is_refused_without_the_lease() -> None:
    log: list[str] = []

    with pytest.raises(LeaseLostError):
        backup_service(log, FakeLease(log, lost_after_checks=0), FakeTools(log)).run()

    assert log == ["lease"]


class FakeVerifier:
    def verify(self, authorization: str) -> None:
        if authorization != "Bearer scheduler":
            raise AuthenticationError("bad token")


def test_backup_route_needs_the_scheduler_token(api_client: TestClient) -> None:
    app = api_client.app
    assert isinstance(app, FastAPI)
    log: list[str] = []
    service = backup_service(log, FakeLease(log), FakeTools(log))
    app.state.durability = Durability(PlainCommitter(), service, lambda: None)
    app.dependency_overrides[get_backup_caller_verifier] = FakeVerifier

    assert api_client.post("/api/internal/backup").status_code == 401
    forged = {"Authorization": "Bearer forged"}
    assert api_client.post("/api/internal/backup", headers=forged).status_code == 401
    response = api_client.post(
        "/api/internal/backup", headers={"Authorization": "Bearer scheduler"}
    )

    assert response.status_code == 200
    assert response.json()["dump_object"] == "backups/prod/dumps/tempo-20261006-060000.dump"


def test_backup_route_is_closed_when_not_configured(api_client: TestClient) -> None:
    response = api_client.post("/api/internal/backup", headers={"Authorization": "Bearer x"})

    assert response.status_code == 401


def test_failed_backup_returns_503(api_client: TestClient) -> None:
    app = api_client.app
    assert isinstance(app, FastAPI)
    log: list[str] = []
    service = backup_service(log, FakeLease(log), FakeTools(log, fail_base_backup=True))
    app.state.durability = Durability(PlainCommitter(), service, lambda: None)
    app.dependency_overrides[get_backup_caller_verifier] = FakeVerifier

    response = api_client.post(
        "/api/internal/backup", headers={"Authorization": "Bearer scheduler"}
    )

    assert response.status_code == 503
