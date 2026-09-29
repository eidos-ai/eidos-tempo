from datetime import timedelta

import pytest

from app.domain.errors import ConflictError, InvalidValueError, NotFoundError
from app.domain.ids import ProjectId
from app.domain.users import User
from app.domain.value_objects import DateRange, HexColor
from app.services.projects import ProjectDraft, ProjectService
from app.services.time_entries import TimeEntryDraft, TimeEntryService, TimerStart
from tests.fakes import FakeClock


def test_start_timer_creates_running_entry(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    entry = time_entry_service.start_timer(member, TimerStart("  Standup ", None))

    assert entry.is_running
    assert entry.start == clock.now()
    assert entry.description == "Standup"
    assert time_entry_service.get_running(member) == entry


def test_starting_a_new_timer_stops_the_running_one(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    first = time_entry_service.start_timer(member, TimerStart("First", None))
    clock.advance(timedelta(minutes=30))
    second = time_entry_service.start_timer(member, TimerStart("Second", None))

    period = DateRange(clock.now() - timedelta(days=1), clock.now() + timedelta(days=1))
    entries = {e.id: e for e in time_entry_service.list_entries(member, period)}
    assert entries[first.id].stop == clock.now()
    assert entries[second.id].is_running


def test_stop_timer_without_running_entry_fails(
    time_entry_service: TimeEntryService, member: User
) -> None:
    with pytest.raises(ConflictError):
        time_entry_service.stop_timer(member)


def test_stop_timer_sets_stop_time(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    time_entry_service.start_timer(member, TimerStart("Work", None))
    clock.advance(timedelta(hours=1))

    stopped = time_entry_service.stop_timer(member)

    assert stopped.duration(clock.now()) == timedelta(hours=1)
    assert time_entry_service.get_running(member) is None


def test_manual_entry_requires_stop(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    with pytest.raises(InvalidValueError):
        time_entry_service.create_entry(member, TimeEntryDraft("x", None, clock.now(), None))


def test_manual_entry_cannot_stop_before_start(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    draft = TimeEntryDraft("x", None, clock.now(), clock.now() - timedelta(minutes=1))
    with pytest.raises(InvalidValueError):
        time_entry_service.create_entry(member, draft)


def test_stopped_entry_cannot_be_resumed_by_update(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    start = clock.now() - timedelta(hours=2)
    entry = time_entry_service.create_entry(
        member, TimeEntryDraft("x", None, start, start + timedelta(hours=1))
    )
    with pytest.raises(InvalidValueError):
        time_entry_service.update_entry(member, entry.id, TimeEntryDraft("x", None, start, None))


def test_users_cannot_touch_other_users_entries(
    time_entry_service: TimeEntryService, member: User, admin: User
) -> None:
    entry = time_entry_service.start_timer(member, TimerStart("Private", None))

    with pytest.raises(NotFoundError):
        time_entry_service.delete_entry(admin, entry.id)


def test_delete_is_soft_and_hides_entry(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    start = clock.now() - timedelta(hours=1)
    entry = time_entry_service.create_entry(member, TimeEntryDraft("x", None, start, clock.now()))

    time_entry_service.delete_entry(member, entry.id)

    period = DateRange(start - timedelta(days=1), start + timedelta(days=1))
    assert time_entry_service.list_entries(member, period) == []


def test_list_includes_entries_overlapping_the_period(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    start = clock.now() - timedelta(hours=2)
    time_entry_service.create_entry(member, TimeEntryDraft("x", None, start, clock.now()))

    period = DateRange(clock.now() - timedelta(hours=1), clock.now() + timedelta(hours=1))
    assert len(time_entry_service.list_entries(member, period)) == 1


def test_archived_project_cannot_be_used_for_new_entries(
    time_entry_service: TimeEntryService,
    project_service: ProjectService,
    admin: User,
    member: User,
) -> None:
    project = project_service.create_project(
        admin, ProjectDraft("Old", HexColor("#7b4de7"), None, True, is_archived=True)
    )
    with pytest.raises(InvalidValueError):
        time_entry_service.start_timer(member, TimerStart("x", project.id))


def test_suggestions_are_distinct_recent_first_and_exclude_unusable_entries(
    time_entry_service: TimeEntryService,
    project_service: ProjectService,
    admin: User,
    member: User,
    clock: FakeClock,
) -> None:
    active = project_service.create_project(
        admin, ProjectDraft("Active", HexColor("#7b4de7"), None, True)
    )
    retired = project_service.create_project(
        admin, ProjectDraft("Retired", HexColor("#3f8f87"), None, True)
    )

    def log(
        description: str, project_id: ProjectId | None, hours_ago: int, user: User = member
    ) -> None:
        start = clock.now() - timedelta(hours=hours_ago)
        time_entry_service.create_entry(
            user, TimeEntryDraft(description, project_id, start, start + timedelta(minutes=30))
        )

    log("Model training", active.id, hours_ago=10)
    log("Standup", None, hours_ago=5)
    log("Model training", active.id, hours_ago=2)
    log("Old work", retired.id, hours_ago=3)
    log("", active.id, hours_ago=1)
    log("Admin only", None, hours_ago=1, user=admin)
    deleted_start = clock.now() - timedelta(hours=1)
    deleted = time_entry_service.create_entry(
        member, TimeEntryDraft("Deleted", None, deleted_start, clock.now())
    )
    time_entry_service.delete_entry(member, deleted.id)
    project_service.update_project(
        admin,
        retired.id,
        ProjectDraft("Retired", HexColor("#3f8f87"), None, True, is_archived=True),
    )

    suggestions = time_entry_service.list_suggestions(member)

    assert [(s.description, s.project_id) for s in suggestions] == [
        ("Model training", active.id),
        ("Standup", None),
    ]
