from datetime import timedelta

import pytest

from app.domain.errors import (
    ConflictError,
    InvalidValueError,
    NotFoundError,
    PermissionDeniedError,
)
from app.domain.ids import ProjectId, TagId, new_uuid
from app.domain.users import User
from app.domain.value_objects import DateRange, HexColor
from app.services.projects import ProjectDraft, ProjectService
from app.services.tags import TagDraft, TagService
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


def test_timer_starts_and_stops_at_the_recent_click_time(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    first = time_entry_service.start_timer(member, TimerStart("First", None))
    clock.advance(timedelta(minutes=30))
    clicked = clock.now() - timedelta(seconds=2)
    second = time_entry_service.start_timer(member, TimerStart("Second", None, start=clicked))
    clock.advance(timedelta(minutes=10))
    stopped = time_entry_service.stop_timer(member, clock.now() - timedelta(seconds=1))

    period = DateRange(clock.now() - timedelta(days=1), clock.now() + timedelta(days=1))
    entries = {e.id: e for e in time_entry_service.list_entries(member, period)}
    assert second.start == clicked
    assert entries[first.id].stop == clicked
    assert stopped.stop == clock.now() - timedelta(seconds=1)


@pytest.mark.parametrize("offset", [timedelta(seconds=5), timedelta(minutes=-2)])
def test_click_time_from_a_wrong_clock_falls_back_to_now(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock, offset: timedelta
) -> None:
    entry = time_entry_service.start_timer(
        member, TimerStart("Work", None, start=clock.now() + offset)
    )
    clock.advance(timedelta(minutes=5))
    stopped = time_entry_service.stop_timer(member, clock.now() + offset)

    assert entry.start == clock.now() - timedelta(minutes=5)
    assert stopped.stop == clock.now()


def test_click_time_never_goes_before_the_running_entry(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    first = time_entry_service.start_timer(member, TimerStart("First", None))
    clock.advance(timedelta(seconds=10))
    second = time_entry_service.start_timer(
        member, TimerStart("Second", None, start=first.start - timedelta(seconds=5))
    )

    assert second.start == first.start
    clock.advance(timedelta(seconds=10))
    stopped = time_entry_service.stop_timer(member, second.start - timedelta(seconds=1))
    assert stopped.stop == second.start


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


def test_members_cannot_touch_other_users_entries(
    time_entry_service: TimeEntryService, member: User, admin: User, clock: FakeClock
) -> None:
    start = clock.now() - timedelta(hours=1)
    entry = time_entry_service.create_entry(
        admin, TimeEntryDraft("Private", None, start, clock.now())
    )

    with pytest.raises(NotFoundError):
        time_entry_service.update_entry(
            member, entry.id, TimeEntryDraft("Mine now", None, start, clock.now())
        )
    with pytest.raises(NotFoundError):
        time_entry_service.delete_entry(member, entry.id)


def test_admins_can_edit_and_delete_other_users_entries(
    time_entry_service: TimeEntryService, member: User, admin: User, clock: FakeClock
) -> None:
    start = clock.now() - timedelta(hours=1)
    entry = time_entry_service.create_entry(
        member, TimeEntryDraft("Typo", None, start, clock.now())
    )

    updated = time_entry_service.update_entry(
        admin, entry.id, TimeEntryDraft("Fixed", None, start, clock.now(), is_billable=True)
    )

    assert updated.user_id == member.id
    assert updated.description == "Fixed"
    assert updated.is_billable
    time_entry_service.delete_entry(admin, entry.id)
    period = DateRange(start - timedelta(days=1), start + timedelta(days=1))
    assert time_entry_service.list_entries(member, period) == []


def test_delete_is_soft_and_hides_entry(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    start = clock.now() - timedelta(hours=1)
    entry = time_entry_service.create_entry(member, TimeEntryDraft("x", None, start, clock.now()))

    time_entry_service.delete_entry(member, entry.id)

    period = DateRange(start - timedelta(days=1), start + timedelta(days=1))
    assert time_entry_service.list_entries(member, period) == []
    with pytest.raises(NotFoundError):
        time_entry_service.update_entry(
            member, entry.id, TimeEntryDraft("revived", None, start, clock.now())
        )
    with pytest.raises(NotFoundError):
        time_entry_service.delete_entry(member, entry.id)


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


def test_billable_defaults_from_project_and_can_be_overridden(
    time_entry_service: TimeEntryService,
    project_service: ProjectService,
    admin: User,
    member: User,
    clock: FakeClock,
) -> None:
    project = project_service.create_project(
        admin, ProjectDraft("Vision", HexColor("#7b4de7"), None, True)
    )
    defaulted = time_entry_service.start_timer(member, TimerStart("x", project.id))
    assert defaulted.is_billable

    start = clock.now() - timedelta(hours=2)
    overridden = time_entry_service.create_entry(
        member,
        TimeEntryDraft("y", project.id, start, start + timedelta(hours=1), is_billable=False),
    )
    assert not overridden.is_billable

    no_project = time_entry_service.create_entry(
        member, TimeEntryDraft("z", None, start, start + timedelta(minutes=30))
    )
    assert not no_project.is_billable


def test_tags_must_exist_and_be_active_but_existing_ones_are_kept(
    time_entry_service: TimeEntryService,
    tag_service: TagService,
    admin: User,
    member: User,
    clock: FakeClock,
) -> None:
    research = tag_service.create_tag(member, TagDraft("research"))
    meeting = tag_service.create_tag(member, TagDraft("meeting"))
    start = clock.now() - timedelta(hours=1)

    entry = time_entry_service.create_entry(
        member,
        TimeEntryDraft(
            "x", None, start, clock.now(), tag_ids=(research.id, meeting.id, research.id)
        ),
    )
    assert entry.tag_ids == (research.id, meeting.id)

    tag_service.update_tag(admin, research.id, TagDraft("research", is_archived=True))
    kept = time_entry_service.update_entry(
        member, entry.id, TimeEntryDraft("x", None, start, clock.now(), tag_ids=(research.id,))
    )
    assert kept.tag_ids == (research.id,)

    with pytest.raises(InvalidValueError):
        time_entry_service.start_timer(member, TimerStart("y", None, tag_ids=(research.id,)))
    with pytest.raises(NotFoundError):
        time_entry_service.start_timer(member, TimerStart("y", None, tag_ids=(TagId(new_uuid()),)))


def test_tag_names_are_unique_and_only_admins_rename(
    tag_service: TagService, admin: User, member: User
) -> None:
    tag = tag_service.create_tag(member, TagDraft("Research"))

    with pytest.raises(ConflictError):
        tag_service.create_tag(member, TagDraft("research"))
    with pytest.raises(PermissionDeniedError):
        tag_service.update_tag(member, tag.id, TagDraft("Renamed"))
    assert tag_service.update_tag(admin, tag.id, TagDraft("Renamed")).name == "Renamed"


def test_running_entry_cannot_be_moved_into_the_future(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    running = time_entry_service.start_timer(member, TimerStart("Work", None))

    with pytest.raises(InvalidValueError):
        time_entry_service.update_entry(
            member,
            running.id,
            TimeEntryDraft("Work", None, clock.now() + timedelta(minutes=5), None),
        )


def test_stop_never_ends_before_start_when_the_clock_goes_back(
    time_entry_service: TimeEntryService, member: User, clock: FakeClock
) -> None:
    running = time_entry_service.start_timer(member, TimerStart("Work", None))
    clock.advance(timedelta(seconds=-30))

    stopped = time_entry_service.stop_timer(member)

    assert stopped.stop == running.start


def test_description_is_limited_to_500_characters(
    time_entry_service: TimeEntryService, member: User
) -> None:
    with pytest.raises(InvalidValueError):
        time_entry_service.start_timer(member, TimerStart("x" * 501, None))
