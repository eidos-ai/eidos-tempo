import logging
from dataclasses import dataclass, replace

from app.auth.passwords import PasswordHasher
from app.domain.clock import Clock
from app.domain.errors import AuthenticationError, ConflictError, InvalidValueError, NotFoundError
from app.domain.ids import UserId, new_uuid
from app.domain.users import Role, User, UserPreferences
from app.domain.value_objects import EmailAddress, require_text
from app.repositories.protocols import SessionRepository, UserRepository
from app.services.permissions import require_admin

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8
MAX_NAME_LENGTH = 120


@dataclass(frozen=True)
class NewUser:
    email: EmailAddress
    full_name: str
    password: str
    role: Role


@dataclass(frozen=True)
class UserUpdate:
    full_name: str
    role: Role
    is_active: bool


class UserService:
    def __init__(
        self,
        users: UserRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        clock: Clock,
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._hasher = hasher
        self._clock = clock

    def list_users(self, actor: User) -> list[User]:
        require_admin(actor)
        return self._users.list_all()

    def create_user(self, actor: User, new_user: NewUser) -> User:
        require_admin(actor)
        user = self._create(new_user)
        logger.info("User %s created by %s", user.email, actor.email)
        return user

    def bootstrap_admin(self, new_user: NewUser) -> User:
        user = self._create(replace(new_user, role=Role.ADMIN))
        logger.info("Bootstrap admin %s created", user.email)
        return user

    def update_user(self, actor: User, user_id: UserId, update: UserUpdate) -> User:
        require_admin(actor)
        user = self._get(user_id)
        if user.id == actor.id and (update.role is not Role.ADMIN or not update.is_active):
            raise ConflictError("Admins cannot demote or deactivate themselves")
        user.full_name = require_text(update.full_name, "Full name", MAX_NAME_LENGTH)
        user.role = update.role
        user.is_active = update.is_active
        self._users.save(user)
        if not user.is_active:
            self._sessions.delete_for_user(user.id)
            logger.info("User %s deactivated by %s", user.email, actor.email)
        return user

    def reset_password(self, actor: User, user_id: UserId, new_password: str) -> None:
        require_admin(actor)
        user = self._get(user_id)
        user.password_hash = self._hash_password(new_password)
        self._users.save(user)
        self._sessions.delete_for_user(user.id)
        logger.info("Password of %s reset by %s", user.email, actor.email)

    def change_own_password(self, actor: User, current_password: str, new_password: str) -> None:
        if not self._hasher.verify(actor.password_hash, current_password):
            raise AuthenticationError("Current password is incorrect")
        actor.password_hash = self._hash_password(new_password)
        self._users.save(actor)

    def update_preferences(self, actor: User, preferences: UserPreferences) -> User:
        actor.preferences = preferences
        self._users.save(actor)
        return actor

    def _create(self, new_user: NewUser) -> User:
        if self._users.get_by_email(new_user.email) is not None:
            raise ConflictError(f"A user with email {new_user.email} already exists")
        user = User(
            id=UserId(new_uuid()),
            email=new_user.email,
            full_name=require_text(new_user.full_name, "Full name", MAX_NAME_LENGTH),
            role=new_user.role,
            password_hash=self._hash_password(new_user.password),
            created_at=self._clock.now(),
        )
        self._users.add(user)
        return user

    def _get(self, user_id: UserId) -> User:
        user = self._users.get(user_id)
        if user is None:
            raise NotFoundError("User", user_id)
        return user

    def _hash_password(self, password: str) -> str:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise InvalidValueError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters long"
            )
        return self._hasher.hash(password)
