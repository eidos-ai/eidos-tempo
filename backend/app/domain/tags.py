from dataclasses import dataclass
from datetime import datetime

from app.domain.ids import TagId


@dataclass
class Tag:
    id: TagId
    name: str
    created_at: datetime
    is_archived: bool = False
