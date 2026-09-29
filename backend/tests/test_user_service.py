from datetime import timedelta

import pytest

from app.domain.errors import (
    AuthenticationError,
    ConflictError,
    InvalidValueError,
    PermissionDeniedError,
)
from app.domain.users import (
    CalendarZoom,
    DaysShown,
    Role,
    Theme,
    TimerView,
    User,
    UserPreferences,
)
from app.domain.value_objects import EmailAddress
from app.repositories.protocols import Repositories
from app.services.auth import AuthService
from app.services.users import NewUser, UserService, UserUpdate
from tests.fakes import FakeClock, FakePasswordHasher


def new_user(email: str, role: Role = Role.MEMBER, password: str = "long-password") -> NewUser:
    return NewUser(email=EmailAddress(email), full_name="Someone", password=password, role=role)


def test_only_admins_create_users(user_service: UserService, member: User) -> None:
    with pytest.raises(PermissionDeniedError):
        user_service.create_user(member, new_user("other@eidos.ai"))


def test_email_must_be_unique_ignoring_case(user_service: UserService, admin: User) -> None:
    with pytest.raises(ConflictError):
        user_service.create_user(admin, new_user("ADMIN@eidos.ai"))


def test_password_minimum_length(user_service: UserService, admin: User) -> None:
    with pytest.raises(InvalidValueError):
        user_service.create_user(admin, new_user("short@eidos.ai", password="short"))


def test_admin_cannot_demote_themselves(user_service: UserService, admin: User) -> None:
    with pytest.raises(ConflictError):
        user_service.update_user(admin, admin.id, UserUpdate("Admin", Role.MEMBER, True))


def test_change_own_password_checks_current(user_service: UserService, member: User) -> None:
    with pytest.raises(AuthenticationError):
        user_service.change_own_password(member, "wrong-password", "new-password-123")


def test_update_preferences(user_service: UserService, member: User) -> None:
    preferences = UserPreferences(
        CalendarZoom.DETAILED, TimerView.LIST, DaysShown.FULL_WEEK, Theme.DARK
    )

    updated = user_service.update_preferences(member, preferences)

    assert updated.preferences == preferences


def test_deactivation_and_password_reset_revoke_sessions(
    user_service: UserService,
    repositories: Repositories,
    admin: User,
    member: User,
    clock: FakeClock,
) -> None:
    auth = AuthService(
        repositories.users, repositories.sessions, FakePasswordHasher(), clock, timedelta(days=1)
    )
    token = auth.login(member.email, "member-password").token

    user_service.reset_password(admin, member.id, "brand-new-password")
    with pytest.raises(AuthenticationError):
        auth.authenticate(token)

    token = auth.login(member.email, "brand-new-password").token
    user_service.update_user(admin, member.id, UserUpdate("Member", Role.MEMBER, is_active=False))
    user_service.update_user(admin, member.id, UserUpdate("Member", Role.MEMBER, is_active=True))
    with pytest.raises(AuthenticationError):
        auth.authenticate(token)
