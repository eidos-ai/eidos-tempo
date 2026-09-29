from datetime import timedelta

import pytest

from app.domain.errors import AuthenticationError
from app.domain.users import User
from app.repositories.protocols import Repositories
from app.services.auth import AuthService
from tests.fakes import FakeClock, FakePasswordHasher, InMemorySessionRepository

IDLE_TIMEOUT = timedelta(days=90)


@pytest.fixture
def auth(repositories: Repositories, clock: FakeClock) -> AuthService:
    return AuthService(
        repositories.users, repositories.sessions, FakePasswordHasher(), clock, IDLE_TIMEOUT
    )


def test_regular_use_keeps_the_session_alive_indefinitely(
    auth: AuthService, member: User, clock: FakeClock
) -> None:
    token = auth.login(member.email, "member-password").token

    for _ in range(12):
        clock.advance(timedelta(days=60))
        assert auth.authenticate(token).user.id == member.id


def test_session_expires_after_idle_timeout(
    auth: AuthService, member: User, clock: FakeClock
) -> None:
    token = auth.login(member.email, "member-password").token

    clock.advance(IDLE_TIMEOUT)

    with pytest.raises(AuthenticationError):
        auth.authenticate(token)


def test_session_is_refreshed_at_most_once_a_day(
    auth: AuthService, member: User, clock: FakeClock
) -> None:
    token = auth.login(member.email, "member-password").token

    clock.advance(timedelta(hours=23))
    assert not auth.authenticate(token).was_refreshed

    clock.advance(timedelta(hours=2))
    refreshed = auth.authenticate(token)
    assert refreshed.was_refreshed
    assert refreshed.expires_at == clock.now() + IDLE_TIMEOUT
    assert not auth.authenticate(token).was_refreshed


def test_login_removes_expired_sessions(
    auth: AuthService, repositories: Repositories, member: User, clock: FakeClock
) -> None:
    auth.login(member.email, "member-password")
    clock.advance(IDLE_TIMEOUT + timedelta(days=1))

    auth.login(member.email, "member-password")

    sessions = repositories.sessions
    assert isinstance(sessions, InMemorySessionRepository)
    assert len(sessions.items) == 1
