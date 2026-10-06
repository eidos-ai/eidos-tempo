import logging
import os
import signal
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from google.auth.credentials import AnonymousCredentials
from google.cloud import storage

from app.config import Settings
from app.domain.clock import SystemClock
from app.durability.backup import BackupLocation, BackupService, PostgresBackupTools
from app.durability.commit import Committer, DurableCommitter, PlainCommitter, PostgresWalArchive
from app.durability.lease import GcsLease

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Durability:
    committer: Committer
    backups: BackupService | None
    on_lease_lost: Callable[[], None]


def build_durability(settings: Settings) -> Durability:
    if not settings.durable_writes:
        return Durability(PlainCommitter(), None, lambda: None)
    bucket = storage_client().bucket(settings.bucket)
    lease = GcsLease.from_generation_file(
        bucket, settings.lease_object, Path(settings.run_dir) / "lease-generation"
    )
    location = BackupLocation(settings.bucket, settings.backup_prefix)
    tools = PostgresBackupTools(bucket, location, settings.run_dir, settings.pgdata)
    return Durability(
        committer=DurableCommitter(
            lease, PostgresWalArchive(), timedelta(seconds=settings.archive_timeout_seconds)
        ),
        backups=BackupService(lease, tools, location, SystemClock()),
        on_lease_lost=stop_server,
    )


def storage_client() -> storage.Client:
    if os.environ.get("STORAGE_EMULATOR_HOST"):
        return storage.Client(project="local", credentials=AnonymousCredentials())
    return storage.Client()


def stop_server() -> None:
    logger.critical("Lost the database lease; stopping so only the newer instance serves")
    os.kill(os.getpid(), signal.SIGTERM)
