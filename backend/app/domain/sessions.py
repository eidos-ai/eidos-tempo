from dataclasses import dataclass
from datetime import datetime

from app.domain.ids import UserId


@dataclass(frozen=True)
class AuthSession:
    token_hash: str
    user_id: UserId
    created_at: datetime
    expires_at: datetime

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at
