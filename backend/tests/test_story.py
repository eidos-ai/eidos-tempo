from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.domain.errors import InvalidValueError
from app.domain.ids import ProjectId, TimeEntryId, UserId, new_uuid
from app.domain.story import build_story, longest_workday_streak
from app.domain.time_entries import TimeEntry
from app.domain.users import User
from app.services.time_entries import TimeEntryDraft, TimeEntryService

NOW = datetime(2026, 10, 2, 12, 0, tzinfo=UTC)
MONTEVIDEO = ZoneInfo("America/Montevideo")


def entry(
    start: datetime, hours: float, project_id: ProjectId | None = None, description: str = ""
) -> TimeEntry:
    return TimeEntry(
        id=TimeEntryId(new_uuid()),
        user_id=UserId(new_uuid()),
        project_id=project_id,
        description=description,
        start=start,
        stop=start + timedelta(hours=hours),
        created_at=start,
    )


def test_story_sums_time_per_project_day_and_entry() -> None:
    vision, ops = ProjectId(new_uuid()), ProjectId(new_uuid())
    entries = [
        entry(datetime(2026, 9, 28, 12, tzinfo=UTC), 2, vision),
        entry(datetime(2026, 9, 29, 12, tzinfo=UTC), 5, ops, "Release"),
        entry(datetime(2026, 9, 29, 18, tzinfo=UTC), 1, vision),
        entry(datetime(2026, 9, 30, 12, tzinfo=UTC), 1),
    ]

    story = build_story(entries, MONTEVIDEO, NOW)

    assert story.first_day == date(2026, 9, 28)
    assert story.total_seconds == 9 * 3600
    assert story.entry_count == 4
    assert story.days_tracked == 3
    assert story.longest_streak == 3
    assert story.favorite_weekday == 1
    assert [(p.project_id, p.seconds) for p in story.top_projects] == [
        (ops, 5 * 3600),
        (vision, 3 * 3600),
        (None, 3600),
    ]
    assert story.busiest_day is not None and story.busiest_day.day == date(2026, 9, 29)
    assert story.longest_entry is not None and story.longest_entry.description == "Release"


def test_story_uses_the_local_day() -> None:
    late_monday_local = datetime(2026, 9, 29, 1, tzinfo=UTC)

    story = build_story([entry(late_monday_local, 1)], MONTEVIDEO, NOW)

    assert story.first_day == date(2026, 9, 28)


def test_story_counts_running_entry_until_now() -> None:
    running = entry(NOW - timedelta(hours=2), 0)
    running.stop = None

    assert build_story([running], MONTEVIDEO, NOW).total_seconds == 2 * 3600


def test_empty_story() -> None:
    story = build_story([], MONTEVIDEO, NOW)

    assert story.first_day is None
    assert story.total_seconds == 0
    assert story.longest_streak == 0
    assert story.top_projects == []
    assert story.busiest_day is None
    assert story.longest_entry is None


def test_untracked_weekends_do_not_break_the_streak() -> None:
    friday, monday, wednesday = date(2026, 10, 2), date(2026, 10, 5), date(2026, 10, 7)

    assert longest_workday_streak([friday, monday]) == 2
    assert longest_workday_streak([friday, monday, wednesday]) == 2
    assert longest_workday_streak([date(2026, 10, 3), date(2026, 10, 4)]) == 2


def test_story_only_includes_own_entries(
    time_entry_service: TimeEntryService, member: User, admin: User
) -> None:
    start = datetime(2026, 9, 21, 9, tzinfo=UTC)
    time_entry_service.create_entry(
        admin, TimeEntryDraft("Admin work", None, start, start + timedelta(hours=3))
    )
    time_entry_service.create_entry(
        member, TimeEntryDraft("Member work", None, start, start + timedelta(hours=1))
    )

    story = time_entry_service.get_story(member, "UTC")

    assert story.total_seconds == 3600


def test_story_rejects_unknown_timezone(time_entry_service: TimeEntryService, member: User) -> None:
    with pytest.raises(InvalidValueError):
        time_entry_service.get_story(member, "Mars/Olympus")
