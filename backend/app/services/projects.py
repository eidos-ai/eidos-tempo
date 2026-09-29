from dataclasses import dataclass

from app.domain.clock import Clock
from app.domain.errors import NotFoundError
from app.domain.ids import ClientId, ProjectId, new_uuid
from app.domain.projects import Project
from app.domain.users import User
from app.domain.value_objects import HexColor, require_text
from app.repositories.protocols import ClientRepository, ProjectRepository
from app.services.permissions import require_admin

MAX_PROJECT_NAME_LENGTH = 120


@dataclass(frozen=True)
class ProjectDraft:
    name: str
    color: HexColor
    client_id: ClientId | None
    is_billable: bool
    is_archived: bool = False


class ProjectService:
    def __init__(
        self, projects: ProjectRepository, clients: ClientRepository, clock: Clock
    ) -> None:
        self._projects = projects
        self._clients = clients
        self._clock = clock

    def list_projects(self, include_archived: bool) -> list[Project]:
        return self._projects.list_all(include_archived)

    def create_project(self, actor: User, draft: ProjectDraft) -> Project:
        require_admin(actor)
        self._ensure_client_exists(draft.client_id)
        project = Project(
            id=ProjectId(new_uuid()),
            name=require_text(draft.name, "Project name", MAX_PROJECT_NAME_LENGTH),
            color=draft.color,
            client_id=draft.client_id,
            is_billable=draft.is_billable,
            created_at=self._clock.now(),
            is_archived=draft.is_archived,
        )
        self._projects.add(project)
        return project

    def update_project(self, actor: User, project_id: ProjectId, draft: ProjectDraft) -> Project:
        require_admin(actor)
        project = self._projects.get(project_id)
        if project is None:
            raise NotFoundError("Project", project_id)
        self._ensure_client_exists(draft.client_id)
        project.name = require_text(draft.name, "Project name", MAX_PROJECT_NAME_LENGTH)
        project.color = draft.color
        project.client_id = draft.client_id
        project.is_billable = draft.is_billable
        project.is_archived = draft.is_archived
        self._projects.save(project)
        return project

    def _ensure_client_exists(self, client_id: ClientId | None) -> None:
        if client_id is not None and self._clients.get(client_id) is None:
            raise NotFoundError("Client", client_id)
