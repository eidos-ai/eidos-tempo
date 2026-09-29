from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel

from app.domain.ids import ProjectId
from app.domain.time_entries import EntrySuggestion, TimeEntry
from app.services.time_entries import TimeEntryDraft, TimerStart


class TimeEntryOut(BaseModel):
    id: UUID
    description: str
    project_id: UUID | None
    start: datetime
    stop: datetime | None

    @classmethod
    def from_domain(cls, entry: TimeEntry) -> "TimeEntryOut":
        return cls(
            id=entry.id,
            description=entry.description,
            project_id=entry.project_id,
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

    def to_command(self) -> TimerStart:
        return TimerStart(
            description=self.description,
            project_id=ProjectId(self.project_id) if self.project_id else None,
        )


class TimeEntryIn(BaseModel):
    description: str = ""
    project_id: UUID | None = None
    start: AwareDatetime
    stop: AwareDatetime | None = None

    def to_draft(self) -> TimeEntryDraft:
        return TimeEntryDraft(
            description=self.description,
            project_id=ProjectId(self.project_id) if self.project_id else None,
            start=self.start,
            stop=self.stop,
        )
