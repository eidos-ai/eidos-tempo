from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.domain.ids import ClientId, ProjectId, TimeEntryId, UserId, new_uuid
from app.domain.reports import (
    NON_BILLABLE_KEY,
    Choice,
    Grouping,
    ReportFilter,
    Resolution,
    SummaryLayout,
    build_summary,
    choose_resolution,
)
from app.domain.time_entries import TimeEntry
from app.domain.users import User
from app.domain.value_objects import DateRange, HexColor
from app.exports.report_pdf import filter_chips
from app.services.clients import ClientDraft, ClientService
from app.services.projects import ProjectDraft, ProjectService
from app.services.reports import ReportService
from app.services.time_entries import TimeEntryDraft, TimeEntryService, TimerStart
from tests.fakes import FakeClock

MONTEVIDEO = ZoneInfo("America/Montevideo")
SEPTEMBER = DateRange(
    datetime(2026, 9, 1, tzinfo=MONTEVIDEO), datetime(2026, 10, 1, tzinfo=MONTEVIDEO)
)
ALICE = UserId(new_uuid())
BOB = UserId(new_uuid())


def entry(
    start: datetime,
    hours: float,
    user_id: UserId = ALICE,
    project_id: ProjectId | None = None,
    is_billable: bool = False,
    description: str = "",
) -> TimeEntry:
    return TimeEntry(
        id=TimeEntryId(new_uuid()),
        user_id=user_id,
        project_id=project_id,
        description=description,
        start=start,
        stop=start + timedelta(hours=hours),
        created_at=start,
        is_billable=is_billable,
    )


def test_summary_totals_and_daily_buckets_use_the_local_day() -> None:
    late_evening = datetime(2026, 9, 2, 23, 30, tzinfo=MONTEVIDEO)
    entries = [
        entry(late_evening, 1, is_billable=True),
        entry(datetime(2026, 9, 2, 9, tzinfo=MONTEVIDEO), 2),
        entry(datetime(2026, 9, 3, 9, tzinfo=MONTEVIDEO), 3),
    ]

    report = build_summary(entries, SEPTEMBER, MONTEVIDEO, {}, SummaryLayout())

    assert report.total.seconds == 6 * 3600
    assert report.total.billable_seconds == 3600
    assert report.days_tracked == 2
    assert report.average_daily_seconds == 3 * 3600
    assert report.resolution is Resolution.DAY
    assert len(report.buckets) == 30
    second = report.buckets[1]
    assert second.start == date(2026, 9, 2)
    assert second.duration.seconds == 3 * 3600
    assert second.duration.billable_seconds == 3600


def test_summary_groups_by_project_then_member() -> None:
    vision, client = ProjectId(new_uuid()), ClientId(new_uuid())
    day = datetime(2026, 9, 7, 9, tzinfo=MONTEVIDEO)
    entries = [
        entry(day, 2, ALICE, vision),
        entry(day, 1, BOB, vision),
        entry(day, 4, BOB),
    ]

    report = build_summary(entries, SEPTEMBER, MONTEVIDEO, {vision: client}, SummaryLayout())

    without_project, vision_group = report.groups
    assert without_project.key is None
    assert without_project.duration.seconds == 4 * 3600
    assert vision_group.key == str(vision)
    assert [(g.key, g.duration.seconds) for g in vision_group.subgroups] == [
        (str(ALICE), 2 * 3600),
        (str(BOB), 3600),
    ]
    assert [(share.key, share.seconds) for share in report.slices] == [
        (None, 4 * 3600),
        (str(vision), 3 * 3600),
    ]
    assert [(s.key, s.seconds) for s in report.buckets[6].segments] == [
        (NON_BILLABLE_KEY, 7 * 3600)
    ]

    layout = SummaryLayout(Grouping.CLIENT, Grouping.DESCRIPTION, Grouping.MEMBER, Grouping.CLIENT)
    by_client = build_summary(entries, SEPTEMBER, MONTEVIDEO, {vision: client}, layout)
    assert {g.key: g.duration.seconds for g in by_client.groups} == {
        None: 4 * 3600,
        str(client): 3 * 3600,
    }
    assert {s.key: s.seconds for s in by_client.buckets[6].segments} == {
        str(ALICE): 2 * 3600,
        str(BOB): 5 * 3600,
    }
    assert [s.key for s in by_client.slices] == [None, str(client)]


def test_chart_buckets_break_down_projects_whatever_the_stack() -> None:
    vision = ProjectId(new_uuid())
    day = datetime(2026, 9, 7, 9, tzinfo=MONTEVIDEO)
    entries = [
        entry(day, 2, ALICE, vision, is_billable=True),
        entry(day, 1, BOB, vision),
        entry(day, 4, BOB),
    ]
    layout = SummaryLayout(stack_by=Grouping.MEMBER)

    report = build_summary(entries, SEPTEMBER, MONTEVIDEO, {vision: None}, layout)

    assert [
        (group.key, group.duration.seconds, group.duration.billable_seconds)
        for group in report.buckets[6].projects
    ] == [(None, 4 * 3600, 0), (str(vision), 3 * 3600, 2 * 3600)]
    assert report.buckets[5].projects == []


@pytest.mark.parametrize(
    ("days", "resolution"),
    [(1, Resolution.DAY), (31, Resolution.DAY), (32, Resolution.WEEK), (365, Resolution.MONTH)],
)
def test_long_ranges_use_coarser_buckets(days: int, resolution: Resolution) -> None:
    first = date(2026, 1, 1)
    assert choose_resolution(first, first + timedelta(days=days - 1)) is resolution


def test_monthly_buckets_cover_every_month() -> None:
    year = DateRange(datetime(2026, 1, 1, tzinfo=UTC), datetime(2027, 1, 1, tzinfo=UTC))
    report = build_summary([], year, ZoneInfo("UTC"), {}, SummaryLayout())
    assert [bucket.start.month for bucket in report.buckets] == list(range(1, 13))


def test_filter_conditions_is_is_not_and_is_empty() -> None:
    vision = ProjectId(new_uuid())
    client = ClientId(new_uuid())
    with_project = entry(datetime(2026, 9, 7, 9, tzinfo=MONTEVIDEO), 1, project_id=vision)
    without_project = entry(datetime(2026, 9, 7, 11, tzinfo=MONTEVIDEO), 1)

    is_vision = ReportFilter(SEPTEMBER, projects=Choice((vision,)))
    assert is_vision.matches(with_project, client)
    assert not is_vision.matches(without_project, None)

    is_not_vision = ReportFilter(SEPTEMBER, projects=Choice((vision,), negate=True))
    assert not is_not_vision.matches(with_project, client)
    assert is_not_vision.matches(without_project, None)

    no_project = ReportFilter(SEPTEMBER, projects=Choice(include_none=True))
    assert no_project.matches(without_project, None)
    assert not no_project.matches(with_project, client)

    no_client = ReportFilter(SEPTEMBER, clients=Choice(include_none=True))
    assert not no_client.matches(with_project, client)
    assert no_client.matches(without_project, None)

    has_client = ReportFilter(SEPTEMBER, clients=Choice(include_none=True, negate=True))
    assert has_client.matches(with_project, client)


def report_period(clock: FakeClock) -> DateRange:
    return DateRange(clock.now() - timedelta(days=7), clock.now() + timedelta(days=1))


def test_members_only_see_their_own_entries(
    report_service: ReportService,
    time_entry_service: TimeEntryService,
    member: User,
    admin: User,
    clock: FakeClock,
) -> None:
    start = clock.now() - timedelta(hours=2)
    mine = time_entry_service.create_entry(member, TimeEntryDraft("Mine", None, start, clock.now()))
    time_entry_service.create_entry(admin, TimeEntryDraft("Admin's", None, start, clock.now()))

    asking_for_admin = ReportFilter(report_period(clock), users=Choice((admin.id,)))

    assert [e.id for e in report_service.list_entries(member, asking_for_admin)] == [mine.id]
    assert len(report_service.list_entries(admin, ReportFilter(report_period(clock)))) == 2
    assert report_service.catalog(member).users.keys() == {member.id}


def test_reports_filter_by_client_billable_and_description(
    report_service: ReportService,
    time_entry_service: TimeEntryService,
    project_service: ProjectService,
    client_service: ClientService,
    admin: User,
    clock: FakeClock,
) -> None:
    client = client_service.create_client(admin, ClientDraft("BrainLogic"))
    project = project_service.create_project(
        admin, ProjectDraft("Vision", HexColor("#7B4DE7"), client.id, is_billable=True)
    )
    start = clock.now() - timedelta(hours=3)
    billable = time_entry_service.create_entry(
        admin, TimeEntryDraft("Model training", project.id, start, start + timedelta(hours=1))
    )
    time_entry_service.create_entry(
        admin, TimeEntryDraft("Internal sync", None, start, start + timedelta(hours=1))
    )
    period = report_period(clock)

    by_client = ReportFilter(period, clients=Choice((client.id,)))
    assert [e.id for e in report_service.list_entries(admin, by_client)] == [billable.id]
    only_billable = ReportFilter(period, is_billable=True)
    assert [e.id for e in report_service.list_entries(admin, only_billable)] == [billable.id]
    by_text = ReportFilter(period, description="TRAIN")
    assert [e.id for e in report_service.list_entries(admin, by_text)] == [billable.id]


def test_running_entries_are_left_out_of_reports(
    report_service: ReportService,
    time_entry_service: TimeEntryService,
    member: User,
    clock: FakeClock,
) -> None:
    time_entry_service.start_timer(member, TimerStart("Running", None))
    clock.advance(timedelta(minutes=5))

    assert report_service.list_entries(member, ReportFilter(report_period(clock))) == []


def test_pdf_filter_chips_describe_what_the_actor_chose(
    report_service: ReportService,
    project_service: ProjectService,
    member: User,
    admin: User,
    clock: FakeClock,
) -> None:
    project = project_service.create_project(
        admin, ProjectDraft("Vision", HexColor("#7B4DE7"), None, is_billable=False)
    )
    chosen = ReportFilter(
        report_period(clock),
        users=Choice((admin.id,), negate=True),
        projects=Choice((project.id,)),
        clients=Choice(include_none=True),
        is_billable=False,
        description="sync",
    )

    as_admin = filter_chips(
        report_service.requested_filter(admin, chosen), report_service.catalog(admin)
    )
    as_member = filter_chips(
        report_service.requested_filter(member, chosen), report_service.catalog(member)
    )

    assert as_admin == [
        ("Member", f"is not {admin.full_name}"),
        ("Client", "is empty"),
        ("Project", "is Vision"),
        ("Billable", "is non-billable"),
        ("Description", 'contains "sync"'),
    ]
    assert as_member == as_admin[1:]
