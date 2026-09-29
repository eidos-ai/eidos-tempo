from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.errors import ConflictError, InvalidValueError
from app.domain.ids import ProjectId, TimeEntryId, UserId


@dataclass
class TimeEntry:
    id: TimeEntryId
    user_id: UserId
    project_id: ProjectId | None
    description: str
    start: datetime
    stop: datetime | None
    created_at: datetime
    deleted_at: datetime | None = None

    def __post_init__(self) -> None:
        ensure_valid_period(self.start, self.stop)

    @property
    def is_running(self) -> bool:
        return self.stop is None

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def duration(self, now: datetime) -> timedelta:
        return (self.stop or now) - self.start

    def stop_at(self, when: datetime) -> None:
        if not self.is_running:
            raise ConflictError(f"Time entry {self.id} is already stopped")
        ensure_valid_period(self.start, when)
        self.stop = when


@dataclass(frozen=True)
class EntrySuggestion:
    description: str
    project_id: ProjectId | None
    last_used: datetime


def ensure_valid_period(start: datetime, stop: datetime | None) -> None:
    if start.tzinfo is None or (stop is not None and stop.tzinfo is None):
        raise InvalidValueError("Time entry times must be timezone-aware")
    if stop is not None and stop < start:
        raise InvalidValueError("Time entry cannot stop before it starts")
