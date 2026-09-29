from dataclasses import dataclass
from datetime import datetime

from app.domain.ids import ClientId, ProjectId
from app.domain.value_objects import HexColor


@dataclass
class Project:
    id: ProjectId
    name: str
    color: HexColor
    client_id: ClientId | None
    is_billable: bool
    created_at: datetime
    is_archived: bool = False
