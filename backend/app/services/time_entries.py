import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.domain.clock import Clock
from app.domain.errors import ConflictError, InvalidValueError, NotFoundError
from app.domain.ids import ProjectId, TagId, TimeEntryId, new_uuid
from app.domain.story import TrackingStory, build_story
from app.domain.time_entries import EntrySuggestion, TimeEntry, ensure_valid_period
from app.domain.users import User
from app.domain.value_objects import DateRange, parse_timezone
from app.repositories.protocols import ProjectRepository, TagRepository, TimeEntryRepository

logger = logging.getLogger(__name__)

MAX_DESCRIPTION_LENGTH = 500
MAX_SUGGESTIONS = 300
STORY_START = datetime(2000, 1, 1, tzinfo=UTC)


@dataclass(frozen=True)
class TimerStart:
    description: str
    project_id: ProjectId | None
    is_billable: bool | None = None
    tag_ids: tuple[TagId, ...] = ()


@dataclass(frozen=True)
class TimeEntryDraft:
    description: str
    project_id: ProjectId | None
    start: datetime
    stop: datetime | None
    is_billable: bool | None = None
    tag_ids: tuple[TagId, ...] = ()


class TimeEntryService:
    def __init__(
        self,
        time_entries: TimeEntryRepository,
        projects: ProjectRepository,
        tags: TagRepository,
        clock: Clock,
    ) -> None:
        self._entries = time_entries
        self._projects = projects
        self._tags = tags
        self._clock = clock

    def list_entries(self, actor: User, period: DateRange) -> list[TimeEntry]:
        return self._entries.list_overlapping(actor.id, period)

    def get_story(self, actor: User, timezone: str) -> TrackingStory:
        zone = parse_timezone(timezone)
        now = self._clock.now()
        entries = self._entries.list_overlapping(actor.id, DateRange(start=STORY_START, end=now))
        return build_story(entries, zone, now)

    def list_suggestions(self, actor: User) -> list[EntrySuggestion]:
        active_projects = {
            project.id for project in self._projects.list_all(include_archived=False)
        }
        return [
            suggestion
            for suggestion in self._entries.list_suggestions(actor.id, MAX_SUGGESTIONS)
            if suggestion.project_id is None or suggestion.project_id in active_projects
        ]

    def get_running(self, actor: User) -> TimeEntry | None:
        return self._entries.get_running(actor.id)

    def start_timer(self, actor: User, timer: TimerStart) -> TimeEntry:
        self._ensure_project_usable(timer.project_id, current=None)
        tag_ids = self._usable_tags(timer.tag_ids, current=())
        self._entries.lock_user_entries(actor.id)
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
            is_billable=self._billable(timer.is_billable, timer.project_id),
            tag_ids=tag_ids,
        )
        self._entries.add(entry)
        return entry

    def stop_timer(self, actor: User) -> TimeEntry:
        self._entries.lock_user_entries(actor.id)
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
        tag_ids = self._usable_tags(draft.tag_ids, current=())
        entry = TimeEntry(
            id=TimeEntryId(new_uuid()),
            user_id=actor.id,
            project_id=draft.project_id,
            description=clean_description(draft.description),
            start=draft.start,
            stop=draft.stop,
            created_at=self._clock.now(),
            is_billable=self._billable(draft.is_billable, draft.project_id),
            tag_ids=tag_ids,
        )
        self._entries.add(entry)
        return entry

    def update_entry(self, actor: User, entry_id: TimeEntryId, draft: TimeEntryDraft) -> TimeEntry:
        entry = self._get_editable(actor, entry_id)
        if draft.stop is None and not entry.is_running:
            raise InvalidValueError("A stopped entry cannot be resumed; start a timer instead")
        if draft.stop is None and draft.start > self._clock.now():
            raise InvalidValueError("A running entry cannot start in the future")
        ensure_valid_period(draft.start, draft.stop)
        self._ensure_project_usable(draft.project_id, current=entry.project_id)
        entry.tag_ids = self._usable_tags(draft.tag_ids, current=entry.tag_ids)
        entry.is_billable = self._billable(draft.is_billable, draft.project_id)
        entry.description = clean_description(draft.description)
        entry.project_id = draft.project_id
        entry.start = draft.start
        entry.stop = draft.stop
        self._entries.save(entry)
        log_if_on_behalf(actor, entry, "updated")
        return entry

    def delete_entry(self, actor: User, entry_id: TimeEntryId) -> None:
        entry = self._get_editable(actor, entry_id)
        entry.deleted_at = self._clock.now()
        self._entries.save(entry)
        log_if_on_behalf(actor, entry, "deleted")

    def _get_editable(self, actor: User, entry_id: TimeEntryId) -> TimeEntry:
        owner = self._entries.get_owner(entry_id)
        if owner is None or (owner != actor.id and not actor.is_admin):
            raise NotFoundError("Time entry", entry_id)
        self._entries.lock_user_entries(owner)
        entry = self._entries.get(entry_id)
        if entry is None or entry.is_deleted:
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

    def _billable(self, requested: bool | None, project_id: ProjectId | None) -> bool:
        if requested is not None:
            return requested
        project = self._projects.get(project_id) if project_id else None
        return project.is_billable if project else False

    def _usable_tags(
        self, tag_ids: tuple[TagId, ...], current: tuple[TagId, ...]
    ) -> tuple[TagId, ...]:
        unique_ids = tuple(dict.fromkeys(tag_ids))
        for tag_id in unique_ids:
            if tag_id in current:
                continue
            tag = self._tags.get(tag_id)
            if tag is None:
                raise NotFoundError("Tag", tag_id)
            if tag.is_archived:
                raise InvalidValueError(f"Tag {tag.name!r} is archived")
        return unique_ids


def log_if_on_behalf(actor: User, entry: TimeEntry, action: str) -> None:
    if entry.user_id != actor.id:
        logger.info(
            "Time entry %s of user %s %s by %s", entry.id, entry.user_id, action, actor.email
        )


def clean_description(description: str) -> str:
    cleaned = description.strip()
    if len(cleaned) > MAX_DESCRIPTION_LENGTH:
        raise InvalidValueError(f"Description cannot exceed {MAX_DESCRIPTION_LENGTH} characters")
    return cleaned
