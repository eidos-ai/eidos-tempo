from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Base
from app.domain.ids import TagId, TimeEntryId, UserId, new_uuid
from app.domain.sessions import AuthSession
from app.domain.tags import Tag
from app.domain.time_entries import TimeEntry
from app.domain.users import Role, User
from app.domain.value_objects import DateRange, EmailAddress
from app.repositories.protocols import Repositories
from app.repositories.sql import build_sql_repositories


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
