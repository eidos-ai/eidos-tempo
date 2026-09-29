from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, ProjectServiceDep
from app.api.schemas.projects import ProjectIn, ProjectOut
from app.domain.ids import ProjectId

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects(
    actor: CurrentUser, projects: ProjectServiceDep, include_archived: bool = False
) -> list[ProjectOut]:
    return [ProjectOut.from_domain(project) for project in projects.list_projects(include_archived)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectIn, actor: CurrentUser, projects: ProjectServiceDep) -> ProjectOut:
    return ProjectOut.from_domain(projects.create_project(actor, body.to_draft()))


@router.put("/{project_id}")
def update_project(
    project_id: UUID, body: ProjectIn, actor: CurrentUser, projects: ProjectServiceDep
) -> ProjectOut:
    project = projects.update_project(actor, ProjectId(project_id), body.to_draft())
    return ProjectOut.from_domain(project)
