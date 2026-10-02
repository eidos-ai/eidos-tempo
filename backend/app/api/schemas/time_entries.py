from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel

from app.domain.ids import ProjectId, TagId
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
