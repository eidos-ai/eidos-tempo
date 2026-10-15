from collections.abc import Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.db.models import Base
from app.domain.api_tokens import ApiToken
from app.domain.clients import Client
from app.domain.ids import ClientId, ProjectId, TagId, TimeEntryId, UserId, new_uuid
from app.domain.numeric_ids import FIRST_TEMPO_NUMBER, NumberedEntity
from app.domain.projects import Project
from app.domain.reports import Choice, ReportFilter
from app.domain.sessions import AuthSession
from app.domain.tags import Tag
from app.domain.time_entries import TimeEntry
from app.domain.users import Role, User
from app.domain.value_objects import DateRange, EmailAddress, HexColor
from app.durability.commit import PostgresWalArchive
from app.repositories.protocols import Repositories
from app.repositories.sql import build_sql_repositories
from app.services.time_entries import TimeEntryService
from tests.fakes import FakeClock


class IntegrationSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TEMPO_", extra="ignore")

    test_database_url: str | None = None


TEST_DATABASE_URL = IntegrationSettings().test_database_url
NOW = datetime(2026, 9, 28, 9, 0, tzinfo=UTC)

pytestmark = pytest.mark.skipif(
    TEST_DATABASE_URL is None, reason="TEMPO_TEST_DATABASE_URL is not set"
)


@pytest.fixture
def session() -> Iterator[Session]:
    assert TEST_DATABASE_URL is not None
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with Session(engine) as db_session:
        yield db_session
    engine.dispose()


@pytest.fixture
def sql_repositories(session: Session) -> Repositories:
    return build_sql_repositories(session)


def make_user(repositories: Repositories) -> User:
    user = User(
        id=UserId(new_uuid()),
        email=EmailAddress("dev@eidos.ai"),
        full_name="Dev",
        role=Role.MEMBER,
        password_hash="hash",
        created_at=NOW,
    )
    repositories.users.add(user)
    return user


def make_entry(user: User, start: datetime, stop: datetime | None) -> TimeEntry:
    return TimeEntry(
        id=TimeEntryId(new_uuid()),
        user_id=user.id,
        project_id=None,
        description="work",
        start=start,
        stop=stop,
        created_at=NOW,
    )


def test_user_round_trip(sql_repositories: Repositories) -> None:
    user = make_user(sql_repositories)

    assert sql_repositories.users.get_by_email(EmailAddress("DEV@eidos.ai")) == user


def test_only_one_running_entry_per_user(sql_repositories: Repositories, session: Session) -> None:
    user = make_user(sql_repositories)
    sql_repositories.time_entries.add(make_entry(user, NOW, None))

    with pytest.raises(IntegrityError):
        sql_repositories.time_entries.add(make_entry(user, NOW, None))
    session.rollback()


def test_list_overlapping_skips_deleted_entries(sql_repositories: Repositories) -> None:
    user = make_user(sql_repositories)
    kept = make_entry(user, NOW, NOW + timedelta(hours=1))
    deleted = make_entry(user, NOW, NOW + timedelta(hours=1))
    deleted.deleted_at = NOW
    sql_repositories.time_entries.add(kept)
    sql_repositories.time_entries.add(deleted)

    period = DateRange(NOW - timedelta(days=1), NOW + timedelta(days=1))
    assert sql_repositories.time_entries.list_overlapping(user.id, period) == [kept]


def test_session_refresh_and_expired_cleanup(sql_repositories: Repositories) -> None:
    user = make_user(sql_repositories)
    active = AuthSession("a" * 64, user.id, NOW, NOW + timedelta(days=1))
    expired = AuthSession("b" * 64, user.id, NOW, NOW - timedelta(seconds=1))
    sql_repositories.sessions.add(active)
    sql_repositories.sessions.add(expired)

    sql_repositories.sessions.save(active.refreshed(NOW, timedelta(days=90)))
    sql_repositories.sessions.delete_expired(NOW)

    stored = sql_repositories.sessions.get(active.token_hash)
    assert stored is not None
    assert stored.expires_at == NOW + timedelta(days=90)
    assert sql_repositories.sessions.get(expired.token_hash) is None


def test_suggestions_group_by_description_and_project(sql_repositories: Repositories) -> None:
    user = make_user(sql_repositories)
    other = User(
        id=UserId(new_uuid()),
        email=EmailAddress("other@eidos.ai"),
        full_name="Other",
        role=Role.MEMBER,
        password_hash="hash",
        created_at=NOW,
    )
    sql_repositories.users.add(other)
    for hours, description, owner in [
        (1, "Review", user),
        (3, "Review", user),
        (2, "Planning", user),
        (0, "", user),
        (0, "Not mine", other),
    ]:
        entry = make_entry(
            owner, NOW + timedelta(hours=hours), NOW + timedelta(hours=hours, minutes=30)
        )
        entry.description = description
        sql_repositories.time_entries.add(entry)

    suggestions = sql_repositories.time_entries.list_suggestions(user.id, limit=10)

    assert [(s.description, s.last_used) for s in suggestions] == [
        ("Review", NOW + timedelta(hours=3)),
        ("Planning", NOW + timedelta(hours=2)),
    ]


def test_entry_tags_and_billable_round_trip(sql_repositories: Repositories) -> None:
    user = make_user(sql_repositories)
    research = Tag(id=TagId(new_uuid()), name="Research", created_at=NOW)
    sql_repositories.tags.add(research)
    entry = make_entry(user, NOW, NOW + timedelta(hours=1))
    entry.is_billable = True
    entry.tag_ids = (research.id,)
    sql_repositories.time_entries.add(entry)

    stored = sql_repositories.time_entries.get(entry.id)
    assert stored is not None and stored.is_billable and stored.tag_ids == (research.id,)
    assert sql_repositories.tags.get_by_name("research") == research

    entry.tag_ids = ()
    sql_repositories.time_entries.save(entry)
    cleared = sql_repositories.time_entries.get(entry.id)
    assert cleared is not None and cleared.tag_ids == ()


def test_deleted_running_entry_is_not_the_running_timer(sql_repositories: Repositories) -> None:
    user = make_user(sql_repositories)
    deleted = make_entry(user, NOW, None)
    deleted.deleted_at = NOW
    sql_repositories.time_entries.add(deleted)
    assert sql_repositories.time_entries.get_running(user.id) is None

    running = make_entry(user, NOW, None)
    sql_repositories.time_entries.add(running)
    assert sql_repositories.time_entries.get_running(user.id) == running


def test_archived_projects_are_listed_only_on_request(sql_repositories: Repositories) -> None:
    active = make_project("Active", is_archived=False)
    archived = make_project("Old", is_archived=True)
    sql_repositories.projects.add(active)
    sql_repositories.projects.add(archived)

    assert [p.id for p in sql_repositories.projects.list_all(include_archived=False)] == [active.id]
    assert {p.id for p in sql_repositories.projects.list_all(include_archived=True)} == {
        active.id,
        archived.id,
    }


def make_project(name: str, is_archived: bool) -> Project:
    return Project(
        id=ProjectId(new_uuid()),
        name=name,
        color=HexColor("#7B4DE7"),
        client_id=None,
        is_billable=False,
        created_at=NOW,
        is_archived=is_archived,
    )


def test_timer_lock_blocks_a_concurrent_change_for_the_same_user(
    sql_repositories: Repositories, session: Session
) -> None:
    user = make_user(sql_repositories)
    session.commit()
    sql_repositories.time_entries.lock_user_entries(user.id)

    with Session(session.get_bind()) as other_session:
        other_session.execute(text("SET lock_timeout = '200ms'"))
        with pytest.raises(OperationalError, match="lock timeout"):
            build_sql_repositories(other_session).time_entries.lock_user_entries(user.id)


def test_list_overlapping_includes_entries_crossing_the_period_edges(
    sql_repositories: Repositories,
) -> None:
    user = make_user(sql_repositories)
    hour = timedelta(hours=1)
    period = DateRange(NOW, NOW + 8 * hour)
    started_before = make_entry(user, NOW - hour, NOW + hour)
    ends_after = make_entry(user, NOW + 7 * hour, NOW + 9 * hour)
    running = make_entry(user, NOW + 2 * hour, None)
    ended_at_start = make_entry(user, NOW - hour, NOW)
    starts_at_end = make_entry(user, NOW + 8 * hour, NOW + 9 * hour)
    for entry in (started_before, ends_after, running, ended_at_start, starts_at_end):
        sql_repositories.time_entries.add(entry)

    listed = sql_repositories.time_entries.list_overlapping(user.id, period)

    assert {entry.id for entry in listed} == {started_before.id, ends_after.id, running.id}


def test_report_query_applies_every_filter(sql_repositories: Repositories) -> None:
    user = make_user(sql_repositories)
    client = Client(id=ClientId(new_uuid()), name="BrainLogic", created_at=NOW)
    sql_repositories.clients.add(client)
    project = replace(make_project("Vision", is_archived=False), client_id=client.id)
    sql_repositories.projects.add(project)
    research = Tag(id=TagId(new_uuid()), name="Research", created_at=NOW)
    sql_repositories.tags.add(research)

    matching = make_entry(user, NOW, NOW + timedelta(hours=1))
    matching.project_id = project.id
    matching.is_billable = True
    matching.tag_ids = (research.id,)
    matching.description = "100% model training"
    unassigned = make_entry(user, NOW + timedelta(hours=2), NOW + timedelta(hours=3))
    running = make_entry(user, NOW + timedelta(hours=4), None)
    deleted = make_entry(user, NOW, NOW + timedelta(hours=1))
    deleted.deleted_at = NOW
    for entry in (matching, unassigned, running, deleted):
        sql_repositories.time_entries.add(entry)

    everything = ReportFilter(DateRange(NOW - timedelta(days=1), NOW + timedelta(days=1)))

    def ids(report_filter: ReportFilter) -> list[TimeEntryId]:
        return [e.id for e in sql_repositories.time_entries.list_for_report(report_filter)]

    assert ids(everything) == [unassigned.id, matching.id]
    mine_for_client = replace(everything, users=Choice((user.id,)), clients=Choice((client.id,)))
    assert ids(mine_for_client) == [matching.id]
    assert ids(replace(everything, clients=Choice(include_none=True))) == [unassigned.id]
    assert ids(replace(everything, clients=Choice((client.id,), negate=True))) == [unassigned.id]
    vision_or_none = Choice((project.id,), include_none=True)
    assert ids(replace(everything, projects=vision_or_none)) == [unassigned.id, matching.id]
    with_project = Choice[ProjectId](include_none=True, negate=True)
    assert ids(replace(everything, projects=with_project)) == [matching.id]
    assert ids(replace(everything, tags=Choice((research.id,)))) == [matching.id]
    assert ids(replace(everything, tags=Choice(include_none=True))) == [unassigned.id]
    assert ids(replace(everything, tags=Choice((research.id,), negate=True))) == [unassigned.id]
    assert ids(replace(everything, is_billable=False)) == [unassigned.id]
    assert ids(replace(everything, description="100%")) == [matching.id]
    assert ids(replace(everything, users=Choice((UserId(new_uuid()),)))) == []


def test_numeric_ids_keep_toggl_numbers_and_allocate_new_ones(
    sql_repositories: Repositories,
) -> None:
    numbers = sql_repositories.numeric_ids
    imported, created = new_uuid(), new_uuid()
    numbers.keep(NumberedEntity.TIME_ENTRY, imported, 4_542_321_181)

    first = numbers.numbers_for(NumberedEntity.TIME_ENTRY, {imported, created})

    assert first[imported] == 4_542_321_181
    assert first[created] >= FIRST_TEMPO_NUMBER
    assert numbers.numbers_for(NumberedEntity.TIME_ENTRY, {created}) == {created: first[created]}
    assert numbers.internal_id(NumberedEntity.TIME_ENTRY, first[created]) == created
    assert numbers.internal_id(NumberedEntity.PROJECT, first[created]) is None


def test_api_token_is_replaced_and_found_by_hash(sql_repositories: Repositories) -> None:
    user = make_user(sql_repositories)
    tokens = sql_repositories.api_tokens
    tokens.replace(ApiToken(user.id, "old-hash", NOW))
    tokens.replace(ApiToken(user.id, "new-hash", NOW))

    assert tokens.get_by_hash("old-hash") is None
    assert tokens.get_by_hash("new-hash") == ApiToken(user.id, "new-hash", NOW)
    tokens.delete_for_user(user.id)
    assert tokens.get_for_user(user.id) is None


def test_wal_archive_sees_writes_and_closes_segments(
    session: Session, sql_repositories: Repositories
) -> None:
    wal = PostgresWalArchive()
    assert not wal.has_written(session)
    session.rollback()

    make_user(sql_repositories)
    session.flush()
    assert wal.has_written(session)
    session.commit()

    segment = wal.close_segment(session)
    assert len(segment) == 24
    assert int(segment, 16) > 0


def test_splitting_a_running_entry_keeps_one_running_timer(
    sql_repositories: Repositories, session: Session
) -> None:
    user = make_user(sql_repositories)
    running = make_entry(user, NOW, None)
    sql_repositories.time_entries.add(running)
    clock = FakeClock(NOW + timedelta(hours=1))
    service = TimeEntryService(
        sql_repositories.time_entries, sql_repositories.projects, sql_repositories.tags, clock
    )

    split = service.split_entry(user, running.id, NOW + timedelta(minutes=30))
    session.flush()

    assert sql_repositories.time_entries.get_running(user.id) == split.later
    stored = sql_repositories.time_entries.get(split.earlier.id)
    assert stored is not None and stored.stop == NOW + timedelta(minutes=30)
