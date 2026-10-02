from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import TagRow, TimeEntryRow, UserRow
from app.domain.errors import NotFoundError
from app.domain.ids import ProjectId, TagId, TimeEntryId, UserId
from app.domain.time_entries import EntrySuggestion, TimeEntry
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

    def lock_user_entries(self, user_id: UserId) -> None:
        self._session.execute(select(UserRow.id).where(UserRow.id == user_id).with_for_update())

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

    def list_suggestions(self, user_id: UserId, limit: int) -> list[EntrySuggestion]:
        last_used = func.max(TimeEntryRow.start).label("last_used")
        query = (
            select(TimeEntryRow.description, TimeEntryRow.project_id, last_used)
            .where(
                TimeEntryRow.user_id == user_id,
                TimeEntryRow.deleted_at.is_(None),
                TimeEntryRow.description != "",
            )
            .group_by(TimeEntryRow.description, TimeEntryRow.project_id)
            .order_by(last_used.desc())
            .limit(limit)
        )
        return [
            EntrySuggestion(
                description=row.description,
                project_id=ProjectId(row.project_id) if row.project_id else None,
                last_used=row.last_used,
            )
            for row in self._session.execute(query)
        ]

    def add(self, entry: TimeEntry) -> None:
        row = TimeEntryRow(id=entry.id)
        self._apply(row, entry)
        self._session.add(row)
        self._session.flush()

    def save(self, entry: TimeEntry) -> None:
        row = self._session.get(TimeEntryRow, entry.id)
        if row is None:
            raise NotFoundError("Time entry", entry.id)
        self._apply(row, entry)
        self._session.flush()

    def _apply(self, row: TimeEntryRow, entry: TimeEntry) -> None:
        apply_time_entry(row, entry)
        tags = self._session.scalars(select(TagRow).where(TagRow.id.in_(entry.tag_ids))).all()
        if len(tags) != len(entry.tag_ids):
            missing = set(entry.tag_ids) - {TagId(tag.id) for tag in tags}
            raise NotFoundError("Tag", next(iter(missing)))
        row.tags = list(tags)


def to_time_entry(row: TimeEntryRow) -> TimeEntry:
    return TimeEntry(
        id=TimeEntryId(row.id),
        user_id=UserId(row.user_id),
        project_id=ProjectId(row.project_id) if row.project_id else None,
        description=row.description,
        start=row.start,
        stop=row.stop,
        created_at=row.created_at,
        is_billable=row.is_billable,
        tag_ids=tuple(TagId(tag.id) for tag in row.tags),
        deleted_at=row.deleted_at,
    )


def apply_time_entry(row: TimeEntryRow, entry: TimeEntry) -> None:
    row.user_id = entry.user_id
    row.project_id = entry.project_id
    row.description = entry.description
    row.is_billable = entry.is_billable
    row.start = entry.start
    row.stop = entry.stop
    row.created_at = entry.created_at
    row.deleted_at = entry.deleted_at
