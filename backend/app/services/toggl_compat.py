"""Toggl-shaped reports and edits, so scripts written for Toggl's API keep working.

Toggl identifies everything with integers; Tempo maps its UUIDs to numbers (`NumericIdRepository`).
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from enum import StrEnum
from typing import TypeVar
from uuid import UUID
from zoneinfo import ZoneInfo

from app.domain.clock import Clock
from app.domain.errors import InvalidValueError, NotFoundError
from app.domain.ids import ClientId, ProjectId, TagId, TimeEntryId, UserId
from app.domain.numeric_ids import NumberedEntity
from app.domain.reports import (
    Choice,
    Grouping,
    ReportFilter,
    SummaryGroup,
    SummaryLayout,
    SummaryReport,
    entry_seconds,
)
from app.domain.time_entries import TimeEntry
from app.domain.users import User
from app.domain.value_objects import DateRange, parse_timezone
from app.repositories.protocols import NumericIdRepository, TagRepository
from app.services.reports import ReportCatalog, ReportService
from app.services.time_entries import TimeEntryDraft, TimeEntryService

DETAILS_PAGE_SIZE = 50
DEFAULT_DAYS = 7
MAX_DAYS = 366
NO_ID = 0
"""Toggl's id for "without project/client/tag" in report filters."""

IdT = TypeVar("IdT", bound=UUID)


class Billable(StrEnum):
    YES = "yes"
    NO = "no"
    BOTH = "both"


class OrderField(StrEnum):
    DATE = "date"
    DESCRIPTION = "description"
    DURATION = "duration"
    USER = "user"


class TogglGrouping(StrEnum):
    PROJECTS = "projects"
    CLIENTS = "clients"
    USERS = "users"
    TIME_ENTRIES = "time_entries"


GROUPING = {
    TogglGrouping.PROJECTS: Grouping.PROJECT,
    TogglGrouping.CLIENTS: Grouping.CLIENT,
    TogglGrouping.USERS: Grouping.MEMBER,
    TogglGrouping.TIME_ENTRIES: Grouping.DESCRIPTION,
}


class TagAction(StrEnum):
    ADD = "add"
    DELETE = "delete"


@dataclass(frozen=True)
class TogglReportQuery:
    since: date | None = None
    until: date | None = None
    user_ids: tuple[int, ...] = ()
    project_ids: tuple[int, ...] = ()
    client_ids: tuple[int, ...] = ()
    tag_ids: tuple[int, ...] = ()
    billable: Billable = Billable.BOTH
    description: str = ""
    timezone: str | None = None


@dataclass(frozen=True)
class ResolvedQuery:
    report_filter: ReportFilter
    zone: ZoneInfo


@dataclass(frozen=True)
class TogglDetail:
    id: int
    user_id: int
    user_name: str
    project_id: int | None
    project_name: str | None
    project_color: str | None
    client_name: str | None
    description: str
    start: datetime
    end: datetime
    updated: datetime
    duration_ms: int
    is_billable: bool
    tags: list[str]


@dataclass(frozen=True)
class TogglDetailsPage:
    total_count: int
    total_ms: int
    billable_ms: int
    details: list[TogglDetail]


@dataclass(frozen=True)
class TogglTitle:
    grouping: TogglGrouping
    name: str | None
    client_name: str | None = None
    color: str | None = None


@dataclass(frozen=True)
class TogglSummaryItem:
    id: int | None
    title: TogglTitle
    time_ms: int
    items: list["TogglSummaryItem"]
    local_start: datetime | None = None


@dataclass(frozen=True)
class TogglSummary:
    total_ms: int
    billable_ms: int
    groups: list[TogglSummaryItem]


@dataclass(frozen=True)
class TogglProjectInfo:
    id: int
    name: str
    client_id: int | None
    color: str
    is_billable: bool
    is_active: bool
    created_at: datetime


@dataclass(frozen=True)
class TogglUserInfo:
    id: int
    email: str
    full_name: str
    is_active: bool
    is_admin: bool


@dataclass(frozen=True)
class TogglTimeEntry:
    id: int
    user_id: int
    project_id: int | None
    description: str
    start: datetime
    stop: datetime | None
    duration_seconds: int
    is_billable: bool
    tags: list[str]
    tag_ids: list[int]
    updated: datetime


@dataclass(frozen=True)
class TogglEntryChanges:
    """Toggl updates only the fields that are sent.

    `changes_project` tells "project sent as null" apart from "project not sent".
    """

    description: str | None = None
    changes_project: bool = False
    project_id: int | None = None
    start: datetime | None = None
    stop: datetime | None = None
    duration_seconds: int | None = None
    is_billable: bool | None = None
    tags: tuple[str, ...] | None = None
    tag_ids: tuple[int, ...] | None = None
    tag_action: TagAction | None = None


class TogglCompatService:
    def __init__(
        self,
        reports: ReportService,
        time_entries: TimeEntryService,
        tags: TagRepository,
        numeric_ids: NumericIdRepository,
        clock: Clock,
        default_timezone: str,
    ) -> None:
        self._reports = reports
        self._time_entries = time_entries
        self._tags = tags
        self._numbers = numeric_ids
        self._clock = clock
        self._default_timezone = default_timezone

    def user_number(self, user: User) -> int:
        return self._numbers.numbers_for(NumberedEntity.USER, {user.id})[user.id]

    def list_users(self, actor: User) -> list[TogglUserInfo]:
        users = list(self._reports.catalog(actor).users.values())
        numbers = self._numbers.numbers_for(NumberedEntity.USER, {u.id for u in users})
        return [
            TogglUserInfo(numbers[u.id], str(u.email), u.full_name, u.is_active, u.is_admin)
            for u in sorted(users, key=lambda u: u.full_name.lower())
        ]

    def list_projects(self, actor: User, active: bool | None) -> list[TogglProjectInfo]:
        catalog = self._reports.catalog(actor)
        projects = [
            p for p in catalog.projects.values() if active is None or active != p.is_archived
        ]
        project_numbers = self._numbers.numbers_for(
            NumberedEntity.PROJECT, {p.id for p in projects}
        )
        client_numbers = self._numbers.numbers_for(
            NumberedEntity.CLIENT, {p.client_id for p in projects if p.client_id}
        )
        return [
            TogglProjectInfo(
                id=project_numbers[p.id],
                name=p.name,
                client_id=client_numbers[p.client_id] if p.client_id else None,
                color=str(p.color),
                is_billable=p.is_billable,
                is_active=not p.is_archived,
                created_at=p.created_at,
            )
            for p in sorted(projects, key=lambda p: p.name.lower())
        ]

    def resolve(self, query: TogglReportQuery) -> ResolvedQuery:
        zone = parse_timezone(query.timezone or self._default_timezone)
        until = query.until or self._clock.now().astimezone(zone).date()
        since = query.since or until - timedelta(days=DEFAULT_DAYS - 1)
        if since > until:
            raise InvalidValueError("since must not be after until")
        if (until - since).days >= MAX_DAYS:
            raise InvalidValueError(f"A report can cover at most {MAX_DAYS} days")
        period = DateRange(
            start=datetime.combine(since, time(), tzinfo=zone),
            end=datetime.combine(until + timedelta(days=1), time(), tzinfo=zone),
        )
        billable = {Billable.YES: True, Billable.NO: False, Billable.BOTH: None}[query.billable]
        report_filter = ReportFilter(
            period=period,
            users=self._choice(NumberedEntity.USER, query.user_ids, UserId, allows_none=False),
            clients=self._choice(NumberedEntity.CLIENT, query.client_ids, ClientId),
            projects=self._choice(NumberedEntity.PROJECT, query.project_ids, ProjectId),
            tags=self._choice(NumberedEntity.TAG, query.tag_ids, TagId),
            is_billable=billable,
            description=query.description.strip(),
        )
        return ResolvedQuery(report_filter=report_filter, zone=zone)

    def details(
        self,
        actor: User,
        query: TogglReportQuery,
        page: int,
        order_field: OrderField,
        order_desc: bool,
    ) -> TogglDetailsPage:
        resolved = self.resolve(query)
        catalog = self._reports.catalog(actor)
        entries = self.sorted_entries(actor, resolved, catalog, order_field, order_desc)
        first = (page - 1) * DETAILS_PAGE_SIZE
        shown = entries[first : first + DETAILS_PAGE_SIZE]
        return TogglDetailsPage(
            total_count=len(entries),
            total_ms=sum(entry_seconds(e) for e in entries) * 1000,
            billable_ms=sum(entry_seconds(e) for e in entries if e.is_billable) * 1000,
            details=self._details(shown, catalog, resolved.zone),
        )

    def sorted_entries(
        self,
        actor: User,
        resolved: ResolvedQuery,
        catalog: ReportCatalog,
        order_field: OrderField,
        order_desc: bool,
    ) -> list[TimeEntry]:
        def user_name(entry: TimeEntry) -> str:
            user = catalog.users.get(entry.user_id)
            return user.full_name.lower() if user else ""

        keys: dict[OrderField, Callable[[TimeEntry], str | int | datetime]] = {
            OrderField.DATE: lambda e: e.start,
            OrderField.DESCRIPTION: lambda e: e.description.lower(),
            OrderField.DURATION: entry_seconds,
            OrderField.USER: user_name,
        }
        entries = self._reports.list_entries(actor, resolved.report_filter)
        numbers = self._numbers.numbers_for(NumberedEntity.TIME_ENTRY, {e.id for e in entries})
        by_number = sorted(entries, key=lambda e: numbers[e.id])
        return sorted(by_number, key=keys[order_field], reverse=order_desc)

    def summary(
        self,
        actor: User,
        query: TogglReportQuery,
        grouping: TogglGrouping,
        subgrouping: TogglGrouping,
    ) -> TogglSummary:
        resolved = self.resolve(query)
        report = self.summary_report(actor, resolved, grouping, subgrouping)
        catalog = self._reports.catalog(actor)
        return TogglSummary(
            total_ms=report.total.seconds * 1000,
            billable_ms=report.total.billable_seconds * 1000,
            groups=[
                self._summary_item(group, grouping, subgrouping, catalog) for group in report.groups
            ],
        )

    def summary_report(
        self,
        actor: User,
        resolved: ResolvedQuery,
        grouping: TogglGrouping,
        subgrouping: TogglGrouping,
    ) -> SummaryReport:
        layout = SummaryLayout(group_by=GROUPING[grouping], subgroup_by=GROUPING[subgrouping])
        return self._reports.summarize(actor, resolved.report_filter, resolved.zone.key, layout)

    def update_entry(
        self, actor: User, entry_number: int, changes: TogglEntryChanges
    ) -> TogglTimeEntry:
        internal_id = self._numbers.internal_id(NumberedEntity.TIME_ENTRY, entry_number)
        if internal_id is None:
            raise NotFoundError("Time entry", entry_number)
        entry_id = TimeEntryId(internal_id)
        entry = self._time_entries.get_editable_entry(actor, entry_id)
        start = changes.start or entry.start
        stop = changes.stop or entry.stop
        if changes.stop is None and changes.duration_seconds is not None:
            if changes.duration_seconds < 0:
                raise InvalidValueError("A negative duration (running entry) is not supported")
            stop = start + timedelta(seconds=changes.duration_seconds)
        project_id = (
            self._optional_internal(NumberedEntity.PROJECT, changes.project_id, ProjectId)
            if changes.changes_project
            else entry.project_id
        )
        draft = TimeEntryDraft(
            description=entry.description if changes.description is None else changes.description,
            project_id=project_id,
            start=start,
            stop=stop,
            is_billable=entry.is_billable if changes.is_billable is None else changes.is_billable,
            tag_ids=self._changed_tags(entry.tag_ids, changes),
        )
        return self.time_entry(self._time_entries.update_entry(actor, entry_id, draft))

    def time_entry(self, entry: TimeEntry) -> TogglTimeEntry:
        tags = [tag for tag_id in entry.tag_ids if (tag := self._tags.get(tag_id))]
        tag_numbers = self._numbers.numbers_for(NumberedEntity.TAG, set(entry.tag_ids))
        return TogglTimeEntry(
            id=self._number(NumberedEntity.TIME_ENTRY, entry.id),
            user_id=self._number(NumberedEntity.USER, entry.user_id),
            project_id=self._number(NumberedEntity.PROJECT, entry.project_id)
            if entry.project_id
            else None,
            description=entry.description,
            start=entry.start.astimezone(UTC),
            stop=entry.stop.astimezone(UTC) if entry.stop else None,
            duration_seconds=entry_seconds(entry) if entry.stop else -1,
            is_billable=entry.is_billable,
            tags=[tag.name for tag in tags],
            tag_ids=[tag_numbers[tag_id] for tag_id in entry.tag_ids],
            updated=entry.updated_at or entry.created_at,
        )

    def _changed_tags(
        self, current: tuple[TagId, ...], changes: TogglEntryChanges
    ) -> tuple[TagId, ...]:
        if changes.tags is None and changes.tag_ids is None:
            return current
        named = tuple(self._tag_named(name) for name in changes.tags or ())
        numbered = tuple(
            self._internal(NumberedEntity.TAG, number, TagId) for number in changes.tag_ids or ()
        )
        requested = tuple(dict.fromkeys(named + numbered))
        if changes.tag_action is TagAction.ADD:
            return tuple(dict.fromkeys(current + requested))
        if changes.tag_action is TagAction.DELETE:
            return tuple(tag for tag in current if tag not in requested)
        return requested

    def _tag_named(self, name: str) -> TagId:
        tag = self._tags.get_by_name(name)
        if tag is None:
            raise InvalidValueError(f"Unknown tag {name!r}")
        return tag.id

    def _details(
        self, entries: list[TimeEntry], catalog: ReportCatalog, zone: ZoneInfo
    ) -> list[TogglDetail]:
        entry_numbers = self._numbers.numbers_for(
            NumberedEntity.TIME_ENTRY, {e.id for e in entries}
        )
        user_numbers = self._numbers.numbers_for(NumberedEntity.USER, {e.user_id for e in entries})
        project_numbers = self._numbers.numbers_for(
            NumberedEntity.PROJECT, {e.project_id for e in entries if e.project_id}
        )
        details = []
        for entry in entries:
            project = catalog.projects.get(entry.project_id) if entry.project_id else None
            client = (
                catalog.clients.get(project.client_id) if project and project.client_id else None
            )
            user = catalog.users.get(entry.user_id)
            stop = entry.stop or entry.start
            details.append(
                TogglDetail(
                    id=entry_numbers[entry.id],
                    user_id=user_numbers[entry.user_id],
                    user_name=user.full_name if user else "",
                    project_id=project_numbers[project.id] if project else None,
                    project_name=project.name if project else None,
                    project_color=str(project.color) if project else None,
                    client_name=client.name if client else None,
                    description=entry.description,
                    start=entry.start.astimezone(zone).replace(microsecond=0),
                    end=stop.astimezone(zone).replace(microsecond=0),
                    updated=(entry.updated_at or entry.created_at)
                    .astimezone(zone)
                    .replace(microsecond=0),
                    duration_ms=entry_seconds(entry) * 1000,
                    is_billable=entry.is_billable,
                    tags=[catalog.tags[t].name for t in entry.tag_ids if t in catalog.tags],
                )
            )
        return details

    def _summary_item(
        self,
        group: SummaryGroup,
        grouping: TogglGrouping,
        subgrouping: TogglGrouping,
        catalog: ReportCatalog,
    ) -> TogglSummaryItem:
        return TogglSummaryItem(
            id=self._group_number(group.key, grouping),
            title=self._title(group.key, grouping, catalog),
            time_ms=group.duration.seconds * 1000,
            items=[
                TogglSummaryItem(
                    id=self._group_number(sub.key, subgrouping),
                    title=self._title(sub.key, subgrouping, catalog),
                    time_ms=sub.duration.seconds * 1000,
                    items=[],
                )
                for sub in group.subgroups
            ],
        )

    def _group_number(self, key: str | None, grouping: TogglGrouping) -> int | None:
        entity = {
            TogglGrouping.PROJECTS: NumberedEntity.PROJECT,
            TogglGrouping.CLIENTS: NumberedEntity.CLIENT,
            TogglGrouping.USERS: NumberedEntity.USER,
        }.get(grouping)
        if entity is None or key is None:
            return None
        return self._number(entity, UUID(key))

    def _title(
        self, key: str | None, grouping: TogglGrouping, catalog: ReportCatalog
    ) -> TogglTitle:
        if grouping is TogglGrouping.TIME_ENTRIES or key is None:
            return TogglTitle(grouping, key)
        if grouping is TogglGrouping.USERS:
            user = catalog.users.get(UserId(UUID(key)))
            return TogglTitle(grouping, user.full_name if user else None)
        if grouping is TogglGrouping.CLIENTS:
            client = catalog.clients.get(ClientId(UUID(key)))
            return TogglTitle(grouping, client.name if client else None)
        project = catalog.projects.get(ProjectId(UUID(key)))
        if project is None:
            return TogglTitle(grouping, None)
        client = catalog.clients.get(project.client_id) if project.client_id else None
        return TogglTitle(
            grouping, project.name, client.name if client else None, str(project.color)
        )

    def _choice(
        self,
        entity: NumberedEntity,
        numbers: tuple[int, ...],
        id_type: Callable[[UUID], IdT],
        allows_none: bool = True,
    ) -> Choice[IdT]:
        include_none = allows_none and NO_ID in numbers
        ids = tuple(self._internal(entity, n, id_type) for n in numbers if n != NO_ID)
        return Choice(ids=ids, include_none=include_none)

    def _number(self, entity: NumberedEntity, internal_id: UUID) -> int:
        return self._numbers.numbers_for(entity, {internal_id})[internal_id]

    def _internal(self, entity: NumberedEntity, number: int, id_type: Callable[[UUID], IdT]) -> IdT:
        internal_id = self._numbers.internal_id(entity, number)
        if internal_id is None:
            raise InvalidValueError(f"Unknown {entity.value.replace('_', ' ')} id {number}")
        return id_type(internal_id)

    def _optional_internal(
        self, entity: NumberedEntity, number: int | None, id_type: Callable[[UUID], IdT]
    ) -> IdT | None:
        return None if number is None else self._internal(entity, number, id_type)
