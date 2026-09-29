from uuid import UUID

from pydantic import BaseModel

from app.domain.ids import ClientId
from app.domain.projects import Project
from app.domain.value_objects import HexColor
from app.services.projects import ProjectDraft


class ProjectOut(BaseModel):
    id: UUID
    name: str
    color: str
    client_id: UUID | None
    is_billable: bool
    is_archived: bool

    @classmethod
    def from_domain(cls, project: Project) -> "ProjectOut":
        return cls(
            id=project.id,
            name=project.name,
            color=project.color.value,
            client_id=project.client_id,
            is_billable=project.is_billable,
            is_archived=project.is_archived,
        )


class ProjectIn(BaseModel):
    name: str
    color: str
    client_id: UUID | None = None
    is_billable: bool = False
    is_archived: bool = False

    def to_draft(self) -> ProjectDraft:
        return ProjectDraft(
            name=self.name,
            color=HexColor(self.color),
            client_id=ClientId(self.client_id) if self.client_id else None,
            is_billable=self.is_billable,
            is_archived=self.is_archived,
        )
