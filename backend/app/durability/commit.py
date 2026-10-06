import time
from collections.abc import Callable
from datetime import timedelta
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.durability.errors import ArchiveTimeoutError
from app.durability.lease import Lease


class Committer(Protocol):
    def commit(self, session: Session) -> None: ...


class PlainCommitter:
    def commit(self, session: Session) -> None:
        session.commit()


class WalArchive(Protocol):
    def has_written(self, session: Session) -> bool: ...

    def close_segment(self, session: Session) -> str: ...

    def last_archived(self, session: Session) -> str | None: ...


class PostgresWalArchive:
    def has_written(self, session: Session) -> bool:
        return bool(
            session.execute(
                text("SELECT pg_current_xact_id_if_assigned() IS NOT NULL")
            ).scalar_one()
        )

    def close_segment(self, session: Session) -> str:
        segment: str = session.execute(text("SELECT pg_walfile_name(pg_switch_wal())")).scalar_one()
        session.commit()
        return segment

    def last_archived(self, session: Session) -> str | None:
        archived: str | None = session.execute(
            text("SELECT last_archived_wal FROM pg_stat_archiver")
        ).scalar_one()
        session.rollback()
        return archived


class DurableCommitter:
    """Commits, then waits until the change is archived to the bucket, holding the lease throughout.

    WAL segment names sort in archive order, so the change is safe once the archiver's last
    archived segment is at or after the segment that held the commit.
    """

    def __init__(
        self,
        lease: Lease,
        wal: WalArchive,
        timeout: timedelta,
        poll_seconds: float = 0.05,
        monotonic: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._lease = lease
        self._wal = wal
        self._timeout = timeout
        self._poll_seconds = poll_seconds
        self._monotonic = monotonic
        self._sleep = sleep

    def commit(self, session: Session) -> None:
        session.flush()
        if not self._wal.has_written(session):
            session.commit()
            return
        self._lease.check()
        session.commit()
        segment = self._wal.close_segment(session)
        self._wait_until_archived(session, segment)
        self._lease.check()

    def _wait_until_archived(self, session: Session, segment: str) -> None:
        deadline = self._monotonic() + self._timeout.total_seconds()
        while True:
            archived = self._wal.last_archived(session)
            if archived is not None and archived >= segment:
                return
            if self._monotonic() >= deadline:
                raise ArchiveTimeoutError(
                    f"WAL segment {segment} was not archived within {self._timeout}; "
                    f"last archived: {archived}"
                )
            self._sleep(self._poll_seconds)
