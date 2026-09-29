from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.models import TimeEntryRow
from app.domain.errors import NotFoundError
from app.domain.ids import ProjectId, TimeEntryId, UserId
from app.domain.time_entries import TimeEntry
from app.domain.value_objects import DateRange


class SqlTimeEntryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, entry_id: TimeEntryId) -> TimeEntry | None:
        row = self._session.get(TimeEntryRow, entry_id)
        return to_time_entry(row) if row else None

    def get_running(self, user_id: UserId) -> TimeEntry | None:
        row = self._session.scalar(
            select(TimeEntryRow).where(
                TimeEntryRow.user_id == user_id,
                TimeEntryRow.stop.is_(None),
                TimeEntryRow.deleted_at.is_(None),
            )
        )
        return to_time_entry(row) if row else None

    def list_overlapping(self, user_id: UserId, period: DateRange) -> list[TimeEntry]:
        query = (
            select(TimeEntryRow)
            .where(
                TimeEntryRow.user_id == user_id,
                TimeEntryRow.deleted_at.is_(None),
                TimeEntryRow.start < period.end,
                or_(TimeEntryRow.stop.is_(None), TimeEntryRow.stop > period.start),
            )
            .order_by(TimeEntryRow.start.desc())
        )
        return [to_time_entry(row) for row in self._session.scalars(query)]

    def add(self, entry: TimeEntry) -> None:
        row = TimeEntryRow(id=entry.id)
        apply_time_entry(row, entry)
        self._session.add(row)
        self._session.flush()

    def save(self, entry: TimeEntry) -> None:
        row = self._session.get(TimeEntryRow, entry.id)
        if row is None:
            raise NotFoundError("Time entry", entry.id)
        apply_time_entry(row, entry)
        self._session.flush()


def to_time_entry(row: TimeEntryRow) -> TimeEntry:
    return TimeEntry(
        id=TimeEntryId(row.id),
        user_id=UserId(row.user_id),
        project_id=ProjectId(row.project_id) if row.project_id else None,
        description=row.description,
        start=row.start,
        stop=row.stop,
        created_at=row.created_at,
        deleted_at=row.deleted_at,
    )


def apply_time_entry(row: TimeEntryRow, entry: TimeEntry) -> None:
    row.user_id = entry.user_id
    row.project_id = entry.project_id
    row.description = entry.description
    row.start = entry.start
    row.stop = entry.stop
    row.created_at = entry.created_at
    row.deleted_at = entry.deleted_at
