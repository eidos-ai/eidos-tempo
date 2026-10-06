from collections.abc import Sized
from typing import Protocol
from uuid import UUID

from sqlalchemy import ColumnElement, and_, false, func, not_, or_, select, true
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.db.models import ProjectRow, TagRow, TimeEntryRow, UserRow, time_entry_tags
from app.domain.errors import NotFoundError
from app.domain.ids import ClientId, ProjectId, TagId, TimeEntryId, UserId
from app.domain.reports import Choice, ReportFilter
from app.domain.time_entries import EntrySuggestion, TimeEntry
from app.domain.value_objects import DateRange


class SqlTimeEntryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, entry_id: TimeEntryId) -> TimeEntry | None:
        row = self._session.get(TimeEntryRow, entry_id)
        return to_time_entry(row) if row else None

    def get_owner(self, entry_id: TimeEntryId) -> UserId | None:
        owner = self._session.scalar(
            select(TimeEntryRow.user_id).where(TimeEntryRow.id == entry_id)
        )
        return UserId(owner) if owner else None

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

    def list_for_report(self, report_filter: ReportFilter) -> list[TimeEntry]:
        tagged = select(time_entry_tags.c.time_entry_id).where(
            time_entry_tags.c.tag_id.in_(report_filter.tags.ids)
        )
        untagged = (
            ~select(time_entry_tags.c.time_entry_id)
            .where(time_entry_tags.c.time_entry_id == TimeEntryRow.id)
            .exists()
        )
        query = (
            select(TimeEntryRow)
            .outerjoin(ProjectRow, ProjectRow.id == TimeEntryRow.project_id)
            .where(
                TimeEntryRow.deleted_at.is_(None),
                TimeEntryRow.stop.is_not(None),
                TimeEntryRow.start >= report_filter.period.start,
                TimeEntryRow.start < report_filter.period.end,
                TimeEntryRow.description.icontains(report_filter.description, autoescape=True),
                choice_condition(
                    report_filter.users, TimeEntryRow.user_id.in_(report_filter.users.ids), false()
                ),
                column_choice(ProjectRow.client_id, report_filter.clients),
                column_choice(TimeEntryRow.project_id, report_filter.projects),
                choice_condition(report_filter.tags, TimeEntryRow.id.in_(tagged), untagged),
            )
            .order_by(TimeEntryRow.start.desc())
        )
        if report_filter.is_billable is not None:
            query = query.where(TimeEntryRow.is_billable.is_(report_filter.is_billable))
        return [to_time_entry(row) for row in self._session.scalars(query)]

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


def column_choice(
    column: InstrumentedAttribute[UUID | None], choice: Choice[ClientId] | Choice[ProjectId]
) -> ColumnElement[bool]:
    in_ids = and_(column.is_not(None), column.in_(choice.ids))
    return choice_condition(choice, in_ids, column.is_(None))


class Condition(Protocol):
    @property
    def ids(self) -> Sized: ...
    @property
    def include_none(self) -> bool: ...
    @property
    def negate(self) -> bool: ...
    @property
    def is_active(self) -> bool: ...


def choice_condition(
    choice: Condition, in_ids: ColumnElement[bool], is_empty: ColumnElement[bool]
) -> ColumnElement[bool]:
    if not choice.is_active:
        return true()
    matched = or_(
        in_ids if len(choice.ids) else false(),
        is_empty if choice.include_none else false(),
    )
    return not_(matched) if choice.negate else matched


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
        updated_at=row.updated_at,
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
