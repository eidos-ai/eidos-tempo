from dataclasses import dataclass
from datetime import datetime

from app.domain.ids import UserId


@dataclass(frozen=True)
class ApiToken:
    user_id: UserId
    token_hash: str
    created_at: datetime
