from datetime import date
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field

from app.api.schemas.time_entries import TimeEntryOut
from app.domain.ids import ClientId, ProjectId, TagId, UserId
from app.domain.reports import (
    Choice,
    Duration,
    Grouping,
    ReportFilter,
    Resolution,
    Share,
    SummaryGroup,
    SummaryLayout,
    SummaryReport,
)
from app.domain.time_entries import TimeEntry
from app.domain.value_objects import DateRange


class ReportQueryIn(BaseModel):
    start: AwareDatetime
    end: AwareDatetime
    user_id: list[UUID] = []
    exclude_users: bool = False
    client_id: list[UUID] = []
    without_client: bool = False
    exclude_clients: bool = False
    project_id: list[UUID] = []
    without_project: bool = False
    exclude_projects: bool = False
    tag_id: list[UUID] = []
    without_tag: bool = False
    exclude_tags: bool = False
    billable: bool | None = None
    description: str = Field(default="", max_length=500)

    def to_filter(self) -> ReportFilter:
        return ReportFilter(
            period=DateRange(start=self.start, end=self.end),
            users=Choice(tuple(UserId(i) for i in self.user_id), False, self.exclude_users),
            clients=Choice(
                tuple(ClientId(i) for i in self.client_id),
                self.without_client,
                self.exclude_clients,
            ),
            projects=Choice(
                tuple(ProjectId(i) for i in self.project_id),
                self.without_project,
                self.exclude_projects,
            ),
            tags=Choice(tuple(TagId(i) for i in self.tag_id), self.without_tag, self.exclude_tags),
            is_billable=self.billable,
            description=self.description.strip(),
        )


class SummaryQueryIn(ReportQueryIn):
    timezone: str
    group_by: Grouping = Grouping.PROJECT
    subgroup_by: Grouping = Grouping.MEMBER
    stack_by: Grouping = Grouping.BILLABLE
    slice_by: Grouping = Grouping.PROJECT
    period_name: str | None = Field(default=None, max_length=40)

    def to_layout(self) -> SummaryLayout:
        return SummaryLayout(
            group_by=self.group_by,
            subgroup_by=self.subgroup_by,
            stack_by=self.stack_by,
            slice_by=self.slice_by,
        )


class ReportEntryOut(TimeEntryOut):
    user_id: UUID

    @classmethod
    def from_report(cls, entry: TimeEntry) -> "ReportEntryOut":
        return cls(**TimeEntryOut.from_domain(entry).model_dump(), user_id=entry.user_id)


class DurationOut(BaseModel):
    seconds: int
    billable_seconds: int

    @classmethod
    def from_domain(cls, duration: Duration) -> "DurationOut":
        return cls(seconds=duration.seconds, billable_seconds=duration.billable_seconds)


class ShareOut(BaseModel):
    key: str | None
    seconds: int

    @classmethod
    def from_domain(cls, share: Share) -> "ShareOut":
        return cls(key=share.key, seconds=share.seconds)


class ChartBucketOut(BaseModel):
    start: date
    seconds: int
    billable_seconds: int
    segments: list[ShareOut]
    projects: list["SummaryGroupOut"]


class SummaryGroupOut(BaseModel):
    key: str | None
    seconds: int
    billable_seconds: int
    subgroups: list["SummaryGroupOut"]

    @classmethod
    def from_domain(cls, group: SummaryGroup) -> "SummaryGroupOut":
        return cls(
            key=group.key,
            seconds=group.duration.seconds,
            billable_seconds=group.duration.billable_seconds,
            subgroups=[cls.from_domain(subgroup) for subgroup in group.subgroups],
        )


class SummaryReportOut(BaseModel):
    total: DurationOut
    entry_count: int
    days_tracked: int
    average_daily_seconds: int
    resolution: Resolution
    buckets: list[ChartBucketOut]
    stack_by: Grouping
    slice_by: Grouping
    slices: list[ShareOut]
    group_by: Grouping
    subgroup_by: Grouping
    groups: list[SummaryGroupOut]

    @classmethod
    def from_domain(cls, report: SummaryReport) -> "SummaryReportOut":
        return cls(
            total=DurationOut.from_domain(report.total),
            entry_count=report.entry_count,
            days_tracked=report.days_tracked,
            average_daily_seconds=report.average_daily_seconds,
            resolution=report.resolution,
            buckets=[
                ChartBucketOut(
                    start=bucket.start,
                    seconds=bucket.duration.seconds,
                    billable_seconds=bucket.duration.billable_seconds,
                    segments=[ShareOut.from_domain(share) for share in bucket.segments],
                    projects=[SummaryGroupOut.from_domain(group) for group in bucket.projects],
                )
                for bucket in report.buckets
            ],
            stack_by=report.stack_by,
            slice_by=report.slice_by,
            slices=[ShareOut.from_domain(share) for share in report.slices],
            group_by=report.group_by,
            subgroup_by=report.subgroup_by,
            groups=[SummaryGroupOut.from_domain(group) for group in report.groups],
        )
