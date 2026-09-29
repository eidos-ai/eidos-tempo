from dataclasses import dataclass
from datetime import datetime

from app.domain.ids import ClientId


@dataclass
class Client:
    id: ClientId
    name: str
    created_at: datetime
    is_archived: bool = False
