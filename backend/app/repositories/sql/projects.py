from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ProjectRow
from app.domain.errors import NotFoundError
from app.domain.ids import ClientId, ProjectId
from app.domain.projects import Project
from app.domain.value_objects import HexColor


class SqlProjectRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, project_id: ProjectId) -> Project | None:
        row = self._session.get(ProjectRow, project_id)
        return to_project(row) if row else None

    def list_all(self, include_archived: bool) -> list[Project]:
        query = select(ProjectRow).order_by(ProjectRow.name)
        if not include_archived:
            query = query.where(ProjectRow.is_archived.is_(False))
        return [to_project(row) for row in self._session.scalars(query)]

    def add(self, project: Project) -> None:
        row = ProjectRow(id=project.id)
        apply_project(row, project)
        self._session.add(row)
        self._session.flush()

    def save(self, project: Project) -> None:
        row = self._session.get(ProjectRow, project.id)
        if row is None:
            raise NotFoundError("Project", project.id)
        apply_project(row, project)
        self._session.flush()


def to_project(row: ProjectRow) -> Project:
    return Project(
        id=ProjectId(row.id),
        name=row.name,
        color=HexColor(row.color),
        client_id=ClientId(row.client_id) if row.client_id else None,
        is_billable=row.is_billable,
        created_at=row.created_at,
        is_archived=row.is_archived,
    )


def apply_project(row: ProjectRow, project: Project) -> None:
    row.name = project.name
    row.color = project.color.value
    row.client_id = project.client_id
    row.is_billable = project.is_billable
    row.is_archived = project.is_archived
    row.created_at = project.created_at
