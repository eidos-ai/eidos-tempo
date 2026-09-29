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


@dataclass(frozen=True)
class AuthenticatedSession:
    user: User
    expires_at: datetime
    was_refreshed: bool


class AuthService:
    def __init__(
        self,
        users: UserRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        clock: Clock,
        idle_timeout: timedelta,
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._hasher = hasher
        self._clock = clock
        self._idle_timeout = idle_timeout

    def login(self, email: EmailAddress, password: str) -> LoginResult:
        user = self._users.get_by_email(email)
        if user is None or not user.is_active:
            self._hasher.verify_dummy(password)
            logger.info("Rejected login for %s: unknown or inactive user", email)
            raise AuthenticationError("Invalid email or password")
        if not self._hasher.verify(user.password_hash, password):
            logger.info("Rejected login for %s: wrong password", email)
            raise AuthenticationError("Invalid email or password")

        token = generate_session_token()
        now = self._clock.now()
        self._sessions.delete_expired(now)
        session = AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + self._idle_timeout,
        )
        self._sessions.add(session)
        logger.info("User %s logged in", user.email)
        return LoginResult(user=user, token=token, expires_at=session.expires_at)

    def authenticate(self, token: str) -> AuthenticatedSession:
        now = self._clock.now()
        session = self._sessions.get(hash_token(token))
        if session is None or session.is_expired(now):
            raise AuthenticationError("Session is invalid or expired")
        user = self._users.get(session.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("User is inactive")

        was_refreshed = session.needs_refresh(now, self._idle_timeout)
        if was_refreshed:
            session = session.refreshed(now, self._idle_timeout)
            self._sessions.save(session)
        return AuthenticatedSession(
            user=user, expires_at=session.expires_at, was_refreshed=was_refreshed
        )

    def logout(self, token: str) -> None:
        self._sessions.delete(hash_token(token))
