import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from google.api_core.exceptions import GoogleAPIError
from google.cloud.storage import Bucket

from app.domain.clock import Clock
from app.durability.errors import BackupFailedError
from app.durability.lease import Lease

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BackupLocation:
    bucket: str
    prefix: str

    @property
    def walg_prefix(self) -> str:
        return f"gs://{self.bucket}/backups/{self.prefix}"

    def dump_object(self, name: str) -> str:
        return f"backups/{self.prefix}/dumps/{name}"


class BackupTools(Protocol):
    def push_base_backup(self) -> None: ...

    def dump_database(self, path: Path) -> None: ...

    def upload(self, path: Path, object_name: str) -> None: ...


class PostgresBackupTools:
    """Runs WAL-G and pg_dump against the Postgres that shares this instance's volumes."""

    def __init__(self, bucket: Bucket, location: BackupLocation, socket_dir: str, pgdata: str):
        self._bucket = bucket
        self._pgdata = pgdata
        self._env = os.environ | {
            "WALG_GS_PREFIX": location.walg_prefix,
            "WALG_PG_WAL_SIZE": "1",
            "PGHOST": socket_dir,
            "PGUSER": "tempo",
            "PGDATABASE": "tempo",
        }

    def push_base_backup(self) -> None:
        self._run(["wal-g", "backup-push", self._pgdata])

    def dump_database(self, path: Path) -> None:
        self._run(["pg_dump", "--format=custom", "--file", str(path)])

    def upload(self, path: Path, object_name: str) -> None:
        try:
            self._bucket.blob(object_name).upload_from_filename(str(path), if_generation_match=0)
        except GoogleAPIError as error:
            raise BackupFailedError(f"Uploading {object_name} failed: {error}") from error

    def _run(self, command: list[str]) -> None:
        result = subprocess.run(command, env=self._env, capture_output=True, text=True)
        if result.returncode != 0:
            raise BackupFailedError(f"{command[0]} failed: {result.stderr.strip()[-2000:]}")


@dataclass(frozen=True)
class BackupResult:
    dump_object: str
    dump_bytes: int


class BackupService:
    def __init__(
        self, lease: Lease, tools: BackupTools, location: BackupLocation, clock: Clock
    ) -> None:
        self._lease = lease
        self._tools = tools
        self._location = location
        self._clock = clock

    def run(self) -> BackupResult:
        self._lease.check()
        self._tools.push_base_backup()
        name = f"tempo-{self._clock.now():%Y%m%d-%H%M%S}.dump"
        object_name = self._location.dump_object(name)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / name
            self._tools.dump_database(path)
            size = path.stat().st_size
            self._tools.upload(path, object_name)
        logger.info(
            "Nightly backup finished: base backup pushed, dump %s (%d bytes)", object_name, size
        )
        return BackupResult(object_name, size)
