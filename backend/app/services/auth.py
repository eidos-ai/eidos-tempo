import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.auth.passwords import PasswordHasher
from app.auth.tokens import generate_session_token, hash_token
from app.domain.clock import Clock
from app.domain.errors import AuthenticationError
from app.domain.sessions import AuthSession
from app.domain.users import User
from app.domain.value_objects import EmailAddress
from app.repositories.protocols import SessionRepository, UserRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LoginResult:
    user: User
    token: str
    expires_at: datetime


class AuthService:
    def __init__(
        self,
        users: UserRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        clock: Clock,
        session_ttl: timedelta,
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._hasher = hasher
        self._clock = clock
        self._session_ttl = session_ttl

    def login(self, email: EmailAddress, password: str) -> LoginResult:
        user = self._users.get_by_email(email)
        if user is None or not user.is_active:
            logger.info("Rejected login for %s: unknown or inactive user", email)
            raise AuthenticationError("Invalid email or password")
        if not self._hasher.verify(user.password_hash, password):
            logger.info("Rejected login for %s: wrong password", email)
            raise AuthenticationError("Invalid email or password")

        token = generate_session_token()
        now = self._clock.now()
        session = AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + self._session_ttl,
        )
        self._sessions.add(session)
        logger.info("User %s logged in", user.email)
        return LoginResult(user=user, token=token, expires_at=session.expires_at)

    def authenticate(self, token: str) -> User:
        session = self._sessions.get(hash_token(token))
        if session is None or session.is_expired(self._clock.now()):
            raise AuthenticationError("Session is invalid or expired")
        user = self._users.get(session.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("User is inactive")
        return user

    def logout(self, token: str) -> None:
        self._sessions.delete(hash_token(token))
