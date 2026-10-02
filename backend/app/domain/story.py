from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.domain.ids import ProjectId
from app.domain.time_entries import TimeEntry

TOP_PROJECT_COUNT = 3
SATURDAY = 5
LONGEST_WEEKEND_GAP = 3


@dataclass(frozen=True)
class ProjectTotal:
    project_id: ProjectId | None
    seconds: int


@dataclass(frozen=True)
class DayTotal:
    day: date
    seconds: int


@dataclass(frozen=True)
class LongestEntry:
    description: str
    project_id: ProjectId | None
    start: datetime
    seconds: int


@dataclass(frozen=True)
class TrackingStory:
    first_day: date | None
    total_seconds: int
    entry_count: int
    days_tracked: int
    longest_streak: int
    favorite_weekday: int | None
    top_projects: list[ProjectTotal]
    busiest_day: DayTotal | None
    longest_entry: LongestEntry | None


def build_story(entries: list[TimeEntry], zone: ZoneInfo, now: datetime) -> TrackingStory:
    seconds_by_day: defaultdict[date, int] = defaultdict(int)
    seconds_by_project: Counter[ProjectId | None] = Counter()
    seconds_by_weekday: Counter[int] = Counter()
    longest: TimeEntry | None = None
    for entry in entries:
        seconds = int(entry.duration(now).total_seconds())
        day = entry.start.astimezone(zone).date()
        seconds_by_day[day] += seconds
        seconds_by_project[entry.project_id] += seconds
        seconds_by_weekday[day.weekday()] += seconds
        if longest is None or entry.duration(now) > longest.duration(now):
            longest = entry

    busiest = max(seconds_by_day.items(), key=lambda item: item[1], default=None)
    return TrackingStory(
        first_day=min(seconds_by_day, default=None),
        total_seconds=sum(seconds_by_day.values()),
        entry_count=len(entries),
        days_tracked=len(seconds_by_day),
        longest_streak=longest_workday_streak(sorted(seconds_by_day)),
        favorite_weekday=seconds_by_weekday.most_common(1)[0][0] if entries else None,
        top_projects=[
            ProjectTotal(project_id=project_id, seconds=seconds)
            for project_id, seconds in seconds_by_project.most_common(TOP_PROJECT_COUNT)
        ],
        busiest_day=DayTotal(day=busiest[0], seconds=busiest[1]) if busiest else None,
        longest_entry=(
            LongestEntry(
                description=longest.description,
                project_id=longest.project_id,
                start=longest.start,
                seconds=int(longest.duration(now).total_seconds()),
            )
            if longest
            else None
        ),
    )


def longest_workday_streak(days: list[date]) -> int:
    """Consecutive tracked days, where untracked weekends don't break the streak."""
    best = current = 0
    previous: date | None = None
    for day in days:
        current = current + 1 if previous and only_weekend_between(previous, day) else 1
        best = max(best, current)
        previous = day
    return best


def only_weekend_between(earlier: date, later: date) -> bool:
    gap = (later - earlier).days
    return gap <= LONGEST_WEEKEND_GAP and all(
        (earlier + timedelta(days=offset)).weekday() >= SATURDAY for offset in range(1, gap)
    )
