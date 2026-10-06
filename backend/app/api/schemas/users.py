from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.domain.api_tokens import ApiToken
from app.domain.users import (
    CalendarZoom,
    DaysShown,
    Role,
    Theme,
    TimerView,
    User,
    UserPreferences,
)
from app.services.api_tokens import IssuedApiToken


class PreferencesSchema(BaseModel):
    calendar_zoom: CalendarZoom
    default_view: TimerView
    days_shown: DaysShown
    theme: Theme

    @classmethod
    def from_domain(cls, preferences: UserPreferences) -> "PreferencesSchema":
        return cls(
            calendar_zoom=preferences.calendar_zoom,
            default_view=preferences.default_view,
            days_shown=preferences.days_shown,
            theme=preferences.theme,
        )

    def to_domain(self) -> UserPreferences:
        return UserPreferences(
            calendar_zoom=self.calendar_zoom,
            default_view=self.default_view,
            days_shown=self.days_shown,
            theme=self.theme,
        )


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: Role
    is_active: bool
    preferences: PreferencesSchema
    created_at: datetime

    @classmethod
    def from_domain(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email.value,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            preferences=PreferencesSchema.from_domain(user.preferences),
            created_at=user.created_at,
        )


class LoginIn(BaseModel):
    email: str
    password: str


class UserCreateIn(BaseModel):
    email: str
    full_name: str
    password: str
    role: Role


class UserUpdateIn(BaseModel):
    full_name: str
    role: Role
    is_active: bool


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


class PasswordResetIn(BaseModel):
    new_password: str


class ApiTokenOut(BaseModel):
    created_at: datetime

    @classmethod
    def from_domain(cls, token: ApiToken) -> "ApiTokenOut":
        return cls(created_at=token.created_at)


class IssuedApiTokenOut(BaseModel):
    token: str
    created_at: datetime

    @classmethod
    def from_domain(cls, issued: IssuedApiToken) -> "IssuedApiTokenOut":
        return cls(token=issued.token, created_at=issued.created_at)
