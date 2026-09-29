from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import UserRow
from app.domain.errors import NotFoundError
from app.domain.ids import UserId
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


class SqlUserRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, user_id: UserId) -> User | None:
        row = self._session.get(UserRow, user_id)
        return to_user(row) if row else None

    def get_by_email(self, email: EmailAddress) -> User | None:
        row = self._session.scalar(select(UserRow).where(UserRow.email == email.value))
        return to_user(row) if row else None

    def list_all(self) -> list[User]:
        rows = self._session.scalars(select(UserRow).order_by(UserRow.full_name))
        return [to_user(row) for row in rows]

    def add(self, user: User) -> None:
        row = UserRow(id=user.id)
        apply_user(row, user)
        self._session.add(row)
        self._session.flush()

    def save(self, user: User) -> None:
        row = self._session.get(UserRow, user.id)
        if row is None:
            raise NotFoundError("User", user.id)
        apply_user(row, user)
        self._session.flush()


def to_user(row: UserRow) -> User:
    return User(
        id=UserId(row.id),
        email=EmailAddress(row.email),
        full_name=row.full_name,
        role=Role(row.role),
        password_hash=row.password_hash,
        created_at=row.created_at,
        is_active=row.is_active,
        preferences=UserPreferences(
            calendar_zoom=CalendarZoom(row.calendar_zoom),
            default_view=TimerView(row.default_view),
            days_shown=DaysShown(row.days_shown),
            theme=Theme(row.theme),
        ),
    )


def apply_user(row: UserRow, user: User) -> None:
    row.email = user.email.value
    row.full_name = user.full_name
    row.role = user.role.value
    row.password_hash = user.password_hash
    row.is_active = user.is_active
    row.calendar_zoom = user.preferences.calendar_zoom.value
    row.default_view = user.preferences.default_view.value
    row.days_shown = user.preferences.days_shown.value
    row.theme = user.preferences.theme.value
    row.created_at = user.created_at
