import pytest

from app.domain.errors import AuthenticationError
from app.domain.users import User
from app.repositories.protocols import Repositories
from app.services.api_tokens import ApiTokenService
from app.services.users import UserService, UserUpdate
from tests.fakes import FakeClock


@pytest.fixture
def api_tokens(repositories: Repositories, clock: FakeClock) -> ApiTokenService:
    return ApiTokenService(repositories.api_tokens, repositories.users, clock)


def test_issued_token_authenticates_its_user(api_tokens: ApiTokenService, member: User) -> None:
    issued = api_tokens.issue(member)

    assert api_tokens.authenticate(issued.token).id == member.id
    assert api_tokens.get(member) is not None


def test_regenerating_invalidates_the_previous_token(
    api_tokens: ApiTokenService, member: User
) -> None:
    old = api_tokens.issue(member)
    api_tokens.issue(member)

    with pytest.raises(AuthenticationError):
        api_tokens.authenticate(old.token)


def test_revoked_token_is_rejected(api_tokens: ApiTokenService, member: User) -> None:
    issued = api_tokens.issue(member)
    api_tokens.revoke(member)

    with pytest.raises(AuthenticationError):
        api_tokens.authenticate(issued.token)


def test_password_reset_and_deactivation_revoke_the_token(
    api_tokens: ApiTokenService, user_service: UserService, admin: User, member: User
) -> None:
    api_tokens.issue(member)
    user_service.reset_password(admin, member.id, "another-password")
    assert api_tokens.get(member) is None

    issued = api_tokens.issue(member)
    user_service.update_user(admin, member.id, UserUpdate(member.full_name, member.role, False))
    with pytest.raises(AuthenticationError):
        api_tokens.authenticate(issued.token)
