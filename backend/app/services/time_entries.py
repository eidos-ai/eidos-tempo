from dataclasses import dataclass
from datetime import datetime

from app.domain.clock import Clock
from app.domain.errors import ConflictError, InvalidValueError, NotFoundError
from app.domain.ids import ProjectId, TimeEntryId, new_uuid
from app.domain.time_entries import TimeEntry, ensure_valid_period
from app.domain.users import User
from app.domain.value_objects import DateRange
from app.repositories.protocols import ProjectRepository, TimeEntryRepository

MAX_DESCRIPTION_LENGTH = 500


@dataclass(frozen=True)
class TimerStart:
    description: str
    project_id: ProjectId | None


@dataclass(frozen=True)
class TimeEntryDraft:
    description: str
    project_id: ProjectId | None
    start: datetime
    stop: datetime | None


class TimeEntryService:
    def __init__(
        self, time_entries: TimeEntryRepository, projects: ProjectRepository, clock: Clock
    ) -> None:
        self._entries = time_entries
        self._projects = projects
        self._clock = clock

    def list_entries(self, actor: User, period: DateRange) -> list[TimeEntry]:
        return self._entries.list_overlapping(actor.id, period)

    def get_running(self, actor: User) -> TimeEntry | None:
        return self._entries.get_running(actor.id)

    def start_timer(self, actor: User, timer: TimerStart) -> TimeEntry:
        self._ensure_project_usable(timer.project_id, current=None)
        now = self._clock.now()
        running = self._entries.get_running(actor.id)
        if running is not None:
            running.stop_at(now)
            self._entries.save(running)
        entry = TimeEntry(
            id=TimeEntryId(new_uuid()),
            user_id=actor.id,
            project_id=timer.project_id,
            description=clean_description(timer.description),
            start=now,
            stop=None,
            created_at=now,
        )
        self._entries.add(entry)
        return entry

    def stop_timer(self, actor: User) -> TimeEntry:
        running = self._entries.get_running(actor.id)
        if running is None:
            raise ConflictError("No timer is running")
        running.stop_at(max(self._clock.now(), running.start))
        self._entries.save(running)
        return running

    def create_entry(self, actor: User, draft: TimeEntryDraft) -> TimeEntry:
        if draft.stop is None:
            raise InvalidValueError("Manual entries need a stop time; start a timer instead")
        ensure_valid_period(draft.start, draft.stop)
        self._ensure_project_usable(draft.project_id, current=None)
        entry = TimeEntry(
            id=TimeEntryId(new_uuid()),
            user_id=actor.id,
            project_id=draft.project_id,
            description=clean_description(draft.description),
            start=draft.start,
            stop=draft.stop,
            created_at=self._clock.now(),
        )
        self._entries.add(entry)
        return entry

    def update_entry(self, actor: User, entry_id: TimeEntryId, draft: TimeEntryDraft) -> TimeEntry:
        entry = self._get_owned(actor, entry_id)
        if draft.stop is None and not entry.is_running:
            raise InvalidValueError("A stopped entry cannot be resumed; start a timer instead")
        if draft.stop is None and draft.start > self._clock.now():
            raise InvalidValueError("A running entry cannot start in the future")
        ensure_valid_period(draft.start, draft.stop)
        self._ensure_project_usable(draft.project_id, current=entry.project_id)
        entry.description = clean_description(draft.description)
        entry.project_id = draft.project_id
        entry.start = draft.start
        entry.stop = draft.stop
        self._entries.save(entry)
        return entry

    def delete_entry(self, actor: User, entry_id: TimeEntryId) -> None:
        entry = self._get_owned(actor, entry_id)
        entry.deleted_at = self._clock.now()
        self._entries.save(entry)

    def _get_owned(self, actor: User, entry_id: TimeEntryId) -> TimeEntry:
        entry = self._entries.get(entry_id)
        if entry is None or entry.is_deleted or entry.user_id != actor.id:
            raise NotFoundError("Time entry", entry_id)
        return entry

    def _ensure_project_usable(
        self, project_id: ProjectId | None, current: ProjectId | None
    ) -> None:
        if project_id is None or project_id == current:
            return
        project = self._projects.get(project_id)
        if project is None:
            raise NotFoundError("Project", project_id)
        if project.is_archived:
            raise InvalidValueError(f"Project {project.name!r} is archived")


def clean_description(description: str) -> str:
    cleaned = description.strip()
    if len(cleaned) > MAX_DESCRIPTION_LENGTH:
        raise InvalidValueError(f"Description cannot exceed {MAX_DESCRIPTION_LENGTH} characters")
    return cleaned
