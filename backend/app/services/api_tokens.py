import logging
from dataclasses import dataclass
from datetime import datetime

from app.auth.tokens import generate_session_token, hash_token
from app.domain.api_tokens import ApiToken
from app.domain.clock import Clock
from app.domain.errors import AuthenticationError
from app.domain.users import User
from app.repositories.protocols import ApiTokenRepository, UserRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IssuedApiToken:
    token: str
    created_at: datetime


class ApiTokenService:
    def __init__(self, api_tokens: ApiTokenRepository, users: UserRepository, clock: Clock) -> None:
        self._tokens = api_tokens
        self._users = users
        self._clock = clock

    def get(self, actor: User) -> ApiToken | None:
        return self._tokens.get_for_user(actor.id)

    def issue(self, actor: User) -> IssuedApiToken:
        token = generate_session_token()
        created_at = self._clock.now()
        self._tokens.replace(ApiToken(actor.id, hash_token(token), created_at))
        logger.info("API token issued for %s", actor.email)
        return IssuedApiToken(token=token, created_at=created_at)

    def revoke(self, actor: User) -> None:
        self._tokens.delete_for_user(actor.id)
        logger.info("API token revoked for %s", actor.email)

    def authenticate(self, token: str) -> User:
        api_token = self._tokens.get_by_hash(hash_token(token))
        user = self._users.get(api_token.user_id) if api_token else None
        if user is None or not user.is_active:
            raise AuthenticationError("Invalid API token")
        return user
