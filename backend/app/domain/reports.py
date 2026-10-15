from collections import defaultdict
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

from app.domain.ids import ClientId, ProjectId, TagId, UserId
from app.domain.time_entries import TimeEntry
from app.domain.value_objects import DateRange

MAX_DAILY_BUCKETS = 31
MAX_WEEKLY_BUCKETS = 26


BILLABLE_KEY = "billable"
NON_BILLABLE_KEY = "non_billable"


class Grouping(StrEnum):
    PROJECT = "project"
    CLIENT = "client"
    MEMBER = "member"
    DESCRIPTION = "description"
    BILLABLE = "billable"


class Resolution(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


@dataclass(frozen=True)
class Choice[T]:
    """Toggl's "is", "is not" and "is empty" filter conditions."""

    ids: tuple[T, ...] = ()
    include_none: bool = False
    negate: bool = False

    @property
    def is_active(self) -> bool:
        return bool(self.ids) or self.include_none

    def matches(self, value: T | None) -> bool:
        return self.matches_any((value,) if value is not None else ())

    def matches_any(self, values: tuple[T, ...]) -> bool:
        if not self.is_active:
            return True
        hit = any(value in self.ids for value in values) or (self.include_none and not values)
        return hit != self.negate


@dataclass(frozen=True)
class ReportFilter:
    period: DateRange
    users: Choice[UserId] = Choice()
    clients: Choice[ClientId] = Choice()
    projects: Choice[ProjectId] = Choice()
    tags: Choice[TagId] = Choice()
    is_billable: bool | None = None
    description: str = ""

    def matches(self, entry: TimeEntry, client_id: ClientId | None) -> bool:
        return (
            not entry.is_deleted
            and not entry.is_running
            and self.period.start <= entry.start < self.period.end
            and self.users.matches(entry.user_id)
            and self.clients.matches(client_id)
            and self.projects.matches(entry.project_id)
            and self.tags.matches_any(entry.tag_ids)
            and (self.is_billable is None or entry.is_billable == self.is_billable)
            and self.description.lower() in entry.description.lower()
        )


@dataclass(frozen=True)
class Duration:
    seconds: int = 0
    billable_seconds: int = 0

    def plus(self, entry: TimeEntry) -> "Duration":
        seconds = entry_seconds(entry)
        return Duration(
            seconds=self.seconds + seconds,
            billable_seconds=self.billable_seconds + (seconds if entry.is_billable else 0),
        )


GroupKey = Callable[[TimeEntry], str | None]


@dataclass(frozen=True)
class Share:
    key: str | None
    seconds: int


@dataclass(frozen=True)
class ChartBucket:
    start: date
    duration: Duration
    segments: list[Share]
    projects: list["SummaryGroup"]


@dataclass(frozen=True)
class SummaryLayout:
    group_by: Grouping = Grouping.PROJECT
    subgroup_by: Grouping = Grouping.MEMBER
    stack_by: Grouping = Grouping.BILLABLE
    slice_by: Grouping = Grouping.PROJECT


@dataclass(frozen=True)
class SummaryGroup:
    key: str | None
    duration: Duration
    subgroups: list["SummaryGroup"]


@dataclass(frozen=True)
class SummaryReport:
    total: Duration
    entry_count: int
    days_tracked: int
    resolution: Resolution
    buckets: list[ChartBucket]
    stack_by: Grouping
    slice_by: Grouping
    slices: list[Share]
    group_by: Grouping
    subgroup_by: Grouping
    groups: list[SummaryGroup]

    @property
    def average_daily_seconds(self) -> int:
        return self.total.seconds // self.days_tracked if self.days_tracked else 0


def entry_seconds(entry: TimeEntry) -> int:
    return int((entry.stop - entry.start).total_seconds()) if entry.stop else 0


def build_summary(
    entries: list[TimeEntry],
    period: DateRange,
    zone: ZoneInfo,
    client_of: Mapping[ProjectId, ClientId | None],
    layout: SummaryLayout,
) -> SummaryReport:
    def local_day(entry: TimeEntry) -> date:
        return entry.start.astimezone(zone).date()

    first_day = period.start.astimezone(zone).date()
    last_day = (period.end - timedelta(microseconds=1)).astimezone(zone).date()
    resolution = choose_resolution(first_day, last_day)
    entries_by_bucket: defaultdict[date, list[TimeEntry]] = defaultdict(list)
    for entry in entries:
        entries_by_bucket[bucket_start(local_day(entry), resolution)].append(entry)

    key_of = group_keys(client_of)
    return SummaryReport(
        total=sum_durations(entries),
        entry_count=len(entries),
        days_tracked=len({local_day(entry) for entry in entries}),
        resolution=resolution,
        buckets=[
            ChartBucket(
                start=start,
                duration=sum_durations(entries_by_bucket[start]),
                segments=shares(entries_by_bucket[start], key_of[layout.stack_by]),
                projects=group_entries(entries_by_bucket[start], key_of[Grouping.PROJECT]),
            )
            for start in bucket_starts(first_day, last_day, resolution)
        ],
        stack_by=layout.stack_by,
        slice_by=layout.slice_by,
        slices=shares(entries, key_of[layout.slice_by]),
        group_by=layout.group_by,
        subgroup_by=layout.subgroup_by,
        groups=group_entries(entries, key_of[layout.group_by], key_of[layout.subgroup_by]),
    )


def shares(entries: list[TimeEntry], key_of: GroupKey) -> list[Share]:
    return [
        Share(key=group.key, seconds=group.duration.seconds)
        for group in group_entries(entries, key_of)
    ]


def group_keys(client_of: Mapping[ProjectId, ClientId | None]) -> dict[Grouping, GroupKey]:
    def client_key(entry: TimeEntry) -> str | None:
        client_id = client_of.get(entry.project_id) if entry.project_id else None
        return str(client_id) if client_id else None

    return {
        Grouping.PROJECT: lambda entry: str(entry.project_id) if entry.project_id else None,
        Grouping.CLIENT: client_key,
        Grouping.MEMBER: lambda entry: str(entry.user_id),
        Grouping.DESCRIPTION: lambda entry: entry.description,
        Grouping.BILLABLE: lambda entry: BILLABLE_KEY if entry.is_billable else NON_BILLABLE_KEY,
    }


def group_entries(
    entries: list[TimeEntry], key_of: GroupKey, subkey_of: GroupKey | None = None
) -> list[SummaryGroup]:
    grouped: defaultdict[str | None, list[TimeEntry]] = defaultdict(list)
    for entry in entries:
        grouped[key_of(entry)].append(entry)
    groups = [
        SummaryGroup(
            key=key,
            duration=sum_durations(members),
            subgroups=group_entries(members, subkey_of) if subkey_of else [],
        )
        for key, members in grouped.items()
    ]
    return sorted(groups, key=lambda group: group.duration.seconds, reverse=True)


def sum_durations(entries: list[TimeEntry]) -> Duration:
    total = Duration()
    for entry in entries:
        total = total.plus(entry)
    return total


def choose_resolution(first_day: date, last_day: date) -> Resolution:
    days = (last_day - first_day).days + 1
    if days <= MAX_DAILY_BUCKETS:
        return Resolution.DAY
    if days <= MAX_WEEKLY_BUCKETS * 7:
        return Resolution.WEEK
    return Resolution.MONTH


def bucket_start(day: date, resolution: Resolution) -> date:
    if resolution is Resolution.WEEK:
        return day - timedelta(days=day.weekday())
    if resolution is Resolution.MONTH:
        return day.replace(day=1)
    return day


def bucket_starts(first_day: date, last_day: date, resolution: Resolution) -> list[date]:
    starts: list[date] = []
    current = bucket_start(first_day, resolution)
    while current <= last_day:
        starts.append(current)
        current = next_bucket(current, resolution)
    return starts


def next_bucket(start: date, resolution: Resolution) -> date:
    if resolution is Resolution.DAY:
        return start + timedelta(days=1)
    if resolution is Resolution.WEEK:
        return start + timedelta(days=7)
    return (start.replace(day=28) + timedelta(days=4)).replace(day=1)
