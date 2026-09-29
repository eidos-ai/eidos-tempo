from dataclasses import dataclass, replace
from datetime import datetime, timedelta

from app.domain.ids import UserId

REFRESH_INTERVAL = timedelta(days=1)


@dataclass(frozen=True)
class AuthSession:
    token_hash: str
    user_id: UserId
    created_at: datetime
    expires_at: datetime

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at

    def needs_refresh(self, now: datetime, idle_timeout: timedelta) -> bool:
        return self.expires_at - now < idle_timeout - REFRESH_INTERVAL

    def refreshed(self, now: datetime, idle_timeout: timedelta) -> "AuthSession":
        return replace(self, expires_at=now + idle_timeout)
