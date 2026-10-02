from datetime import date, datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel

from app.domain.ids import ProjectId, TagId
from app.domain.story import TrackingStory
from app.domain.time_entries import EntrySuggestion, TimeEntry
from app.services.time_entries import TimeEntryDraft, TimerStart


class TimeEntryOut(BaseModel):
    id: UUID
    description: str
    project_id: UUID | None
    is_billable: bool
    tag_ids: list[UUID]
    start: datetime
    stop: datetime | None

    @classmethod
    def from_domain(cls, entry: TimeEntry) -> "TimeEntryOut":
        return cls(
            id=entry.id,
            description=entry.description,
            project_id=entry.project_id,
            is_billable=entry.is_billable,
            tag_ids=list(entry.tag_ids),
            start=entry.start,
            stop=entry.stop,
        )


class EntrySuggestionOut(BaseModel):
    description: str
    project_id: UUID | None

    @classmethod
    def from_domain(cls, suggestion: EntrySuggestion) -> "EntrySuggestionOut":
        return cls(description=suggestion.description, project_id=suggestion.project_id)


class TimerStartIn(BaseModel):
    description: str = ""
    project_id: UUID | None = None
    is_billable: bool | None = None
    tag_ids: list[UUID] = []

    def to_command(self) -> TimerStart:
        return TimerStart(
            description=self.description,
            project_id=ProjectId(self.project_id) if self.project_id else None,
            is_billable=self.is_billable,
            tag_ids=tuple(TagId(tag_id) for tag_id in self.tag_ids),
        )


class TimeEntryIn(BaseModel):
    description: str = ""
    project_id: UUID | None = None
    is_billable: bool
    tag_ids: list[UUID]
    start: AwareDatetime
    stop: AwareDatetime | None = None

    def to_draft(self) -> TimeEntryDraft:
        return TimeEntryDraft(
            description=self.description,
            project_id=ProjectId(self.project_id) if self.project_id else None,
            is_billable=self.is_billable,
            tag_ids=tuple(TagId(tag_id) for tag_id in self.tag_ids),
            start=self.start,
            stop=self.stop,
        )


class ProjectTotalOut(BaseModel):
    project_id: UUID | None
    seconds: int


class DayTotalOut(BaseModel):
    day: date
    seconds: int


class LongestEntryOut(BaseModel):
    description: str
    project_id: UUID | None
    start: datetime
    seconds: int


class TrackingStoryOut(BaseModel):
    first_day: date | None
    total_seconds: int
    entry_count: int
    days_tracked: int
    longest_streak: int
    favorite_weekday: int | None
    top_projects: list[ProjectTotalOut]
    busiest_day: DayTotalOut | None
    longest_entry: LongestEntryOut | None

    @classmethod
    def from_domain(cls, story: TrackingStory) -> "TrackingStoryOut":
        longest = story.longest_entry
        busiest = story.busiest_day
        return cls(
            first_day=story.first_day,
            total_seconds=story.total_seconds,
            entry_count=story.entry_count,
            days_tracked=story.days_tracked,
            longest_streak=story.longest_streak,
            favorite_weekday=story.favorite_weekday,
            top_projects=[
                ProjectTotalOut(project_id=total.project_id, seconds=total.seconds)
                for total in story.top_projects
            ],
            busiest_day=DayTotalOut(day=busiest.day, seconds=busiest.seconds) if busiest else None,
            longest_entry=(
                LongestEntryOut(
                    description=longest.description,
                    project_id=longest.project_id,
                    start=longest.start,
                    seconds=longest.seconds,
                )
                if longest
                else None
            ),
        )
