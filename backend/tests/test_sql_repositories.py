import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Base
from app.domain.ids import TimeEntryId, UserId, new_uuid
from app.domain.time_entries import TimeEntry
from app.domain.users import Role, User
from app.domain.value_objects import DateRange, EmailAddress
from app.repositories.protocols import Repositories
from app.repositories.sql import build_sql_repositories

TEST_DATABASE_URL = os.environ.get("TEMPO_TEST_DATABASE_URL")
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
