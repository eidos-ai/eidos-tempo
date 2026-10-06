"""Request and response shapes copied from Toggl's API (v9 and Reports v2) for existing scripts."""

from datetime import date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.services.toggl_compat import (
    DETAILS_PAGE_SIZE,
    Billable,
    OrderField,
    TagAction,
    TogglDetail,
    TogglDetailsPage,
    TogglEntryChanges,
    TogglGrouping,
    TogglProjectInfo,
    TogglReportQuery,
    TogglSummary,
    TogglSummaryItem,
    TogglTimeEntry,
    TogglTitle,
    TogglUserInfo,
)

WORKSPACE_ID = 1
OnOff = Literal["on", "off"]


class TogglReportQueryIn(BaseModel):
    since: date | None = None
    until: date | None = None
    user_ids: str = ""
    project_ids: str = ""
    client_ids: str = ""
    tag_ids: str = ""
    billable: Billable = Billable.BOTH
    description: str = Field(default="", max_length=500)
    timezone: str | None = None

    @field_validator("user_ids", "project_ids", "client_ids", "tag_ids")
    @classmethod
    def check_id_list(cls, value: str) -> str:
        parse_ids(value)
        return value

    def to_query(self) -> TogglReportQuery:
        return TogglReportQuery(
            since=self.since,
            until=self.until,
            user_ids=parse_ids(self.user_ids),
            project_ids=parse_ids(self.project_ids),
            client_ids=parse_ids(self.client_ids),
            tag_ids=parse_ids(self.tag_ids),
            billable=self.billable,
            description=self.description,
            timezone=self.timezone,
        )


class TogglDetailsQueryIn(TogglReportQueryIn):
    page: int = Field(default=1, ge=1)
    order_field: OrderField = OrderField.DATE
    order_desc: OnOff = "off"


class TogglSummaryQueryIn(TogglReportQueryIn):
    grouping: TogglGrouping = TogglGrouping.PROJECTS
    subgrouping: TogglGrouping = TogglGrouping.TIME_ENTRIES


def parse_ids(value: str) -> tuple[int, ...]:
    try:
        return tuple(int(part) for part in value.split(",") if part.strip())
    except ValueError as error:
        raise ValueError("ids must be comma-separated integers") from error


class TogglMeOut(BaseModel):
    id: int
    email: str
    fullname: str
    timezone: str
    default_workspace_id: int = WORKSPACE_ID


class TogglUserOut(BaseModel):
    id: int
    fullname: str
    email: str
    is_active: bool
    inactive: bool
    is_admin: bool
    role: str

    @classmethod
    def from_info(cls, user: TogglUserInfo) -> "TogglUserOut":
        return cls(
            id=user.id,
            fullname=user.full_name,
            email=user.email,
            is_active=user.is_active,
            inactive=not user.is_active,
            is_admin=user.is_admin,
            role="admin" if user.is_admin else "user",
        )


class TogglProjectOut(BaseModel):
    id: int
    workspace_id: int = WORKSPACE_ID
    client_id: int | None
    name: str
    active: bool
    billable: bool
    is_private: bool = False
    color: str
    created_at: datetime

    @classmethod
    def from_info(cls, project: TogglProjectInfo) -> "TogglProjectOut":
        return cls(
            id=project.id,
            client_id=project.client_id,
            name=project.name,
            active=project.is_active,
            billable=project.is_billable,
            color=project.color,
            created_at=project.created_at,
        )


class TogglDetailOut(BaseModel):
    id: int
    pid: int | None
    tid: None = None
    uid: int
    user: str
    description: str
    start: datetime
    end: datetime
    updated: datetime
    dur: int
    use_stop: bool = True
    client: str | None
    project: str | None
    project_color: str | None
    project_hex_color: str | None
    task: None = None
    billable: None = None
    is_billable: bool
    cur: None = None
    tags: list[str]

    @classmethod
    def from_detail(cls, detail: TogglDetail) -> "TogglDetailOut":
        return cls(
            id=detail.id,
            pid=detail.project_id,
            uid=detail.user_id,
            user=detail.user_name,
            description=detail.description,
            start=detail.start,
            end=detail.end,
            updated=detail.updated,
            dur=detail.duration_ms,
            client=detail.client_name,
            project=detail.project_name,
            project_color=detail.project_color,
            project_hex_color=detail.project_color,
            is_billable=detail.is_billable,
            tags=detail.tags,
        )


class TogglDetailsOut(BaseModel):
    total_grand: int
    total_billable: int
    total_count: int
    per_page: int = DETAILS_PAGE_SIZE
    total_currencies: list[str] = []
    data: list[TogglDetailOut]

    @classmethod
    def from_page(cls, page: TogglDetailsPage) -> "TogglDetailsOut":
        return cls(
            total_grand=page.total_ms,
            total_billable=page.billable_ms,
            total_count=page.total_count,
            data=[TogglDetailOut.from_detail(detail) for detail in page.details],
        )


def title_out(title: TogglTitle) -> dict[str, str | None]:
    if title.grouping is TogglGrouping.PROJECTS:
        return {
            "project": title.name,
            "client": title.client_name,
            "color": title.color,
            "hex_color": title.color,
        }
    key = {
        TogglGrouping.CLIENTS: "client",
        TogglGrouping.USERS: "user",
        TogglGrouping.TIME_ENTRIES: "time_entry",
    }[title.grouping]
    return {key: title.name}


class TogglSummaryItemOut(BaseModel):
    title: dict[str, str | None]
    time: int
    cur: None = None
    sum: None = None
    rate: None = None
    local_start: datetime | None


class TogglSummaryGroupOut(BaseModel):
    id: int | None
    title: dict[str, str | None]
    time: int
    total_currencies: list[str] = []
    items: list[TogglSummaryItemOut]

    @classmethod
    def from_item(cls, group: TogglSummaryItem) -> "TogglSummaryGroupOut":
        return cls(
            id=group.id,
            title=title_out(group.title),
            time=group.time_ms,
            items=[
                TogglSummaryItemOut(
                    title=title_out(item.title), time=item.time_ms, local_start=item.local_start
                )
                for item in group.items
            ],
        )


class TogglSummaryOut(BaseModel):
    total_grand: int
    total_billable: int
    total_currencies: list[str] = []
    data: list[TogglSummaryGroupOut]

    @classmethod
    def from_summary(cls, summary: TogglSummary) -> "TogglSummaryOut":
        return cls(
            total_grand=summary.total_ms,
            total_billable=summary.billable_ms,
            data=[TogglSummaryGroupOut.from_item(group) for group in summary.groups],
        )


class TogglTimeEntryIn(BaseModel):
    description: str | None = None
    project_id: int | None = None
    pid: int | None = None
    start: AwareDatetime | None = None
    stop: AwareDatetime | None = None
    duration: int | None = None
    billable: bool | None = None
    tags: list[str] | None = None
    tag_ids: list[int] | None = None
    tag_action: TagAction | None = None

    def to_changes(self) -> TogglEntryChanges:
        sent = self.model_fields_set
        return TogglEntryChanges(
            description=self.description,
            changes_project="project_id" in sent or "pid" in sent,
            project_id=self.project_id if "project_id" in sent else self.pid,
            start=self.start,
            stop=self.stop,
            duration_seconds=self.duration,
            is_billable=self.billable,
            tags=tuple(self.tags) if self.tags is not None else None,
            tag_ids=tuple(self.tag_ids) if self.tag_ids is not None else None,
            tag_action=self.tag_action,
        )


class TogglTimeEntryOut(BaseModel):
    id: int
    workspace_id: int = WORKSPACE_ID
    wid: int = WORKSPACE_ID
    user_id: int
    uid: int
    project_id: int | None
    pid: int | None
    task_id: None = None
    description: str
    start: datetime
    stop: datetime | None
    duration: int
    billable: bool
    tags: list[str]
    tag_ids: list[int]
    at: datetime

    @classmethod
    def from_entry(cls, entry: TogglTimeEntry) -> "TogglTimeEntryOut":
        return cls(
            id=entry.id,
            user_id=entry.user_id,
            uid=entry.user_id,
            project_id=entry.project_id,
            pid=entry.project_id,
            description=entry.description,
            start=entry.start,
            stop=entry.stop,
            duration=entry.duration_seconds,
            billable=entry.is_billable,
            tags=entry.tags,
            tag_ids=entry.tag_ids,
            at=entry.updated,
        )
