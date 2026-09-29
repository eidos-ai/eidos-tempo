from dataclasses import dataclass, field
from datetime import datetime
from enum import IntEnum, StrEnum

from app.domain.ids import UserId
from app.domain.value_objects import EmailAddress


class Role(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class CalendarZoom(IntEnum):
    COMPACT = 1
    SMALL = 2
    NORMAL = 3
    LARGE = 4
    DETAILED = 5


class TimerView(StrEnum):
    CALENDAR = "calendar"
    LIST = "list"


class DaysShown(IntEnum):
    WORK_WEEK = 5
    FULL_WEEK = 7


class Theme(StrEnum):
    LIGHT = "light"
    DARK = "dark"


@dataclass(frozen=True)
class UserPreferences:
    calendar_zoom: CalendarZoom = CalendarZoom.NORMAL
    default_view: TimerView = TimerView.CALENDAR
    days_shown: DaysShown = DaysShown.WORK_WEEK
    theme: Theme = Theme.LIGHT


@dataclass
class User:
    id: UserId
    email: EmailAddress
    full_name: str
    role: Role
    password_hash: str
    created_at: datetime
    is_active: bool = True
    preferences: UserPreferences = field(default_factory=UserPreferences)

    @property
    def is_admin(self) -> bool:
        return self.role is Role.ADMIN
