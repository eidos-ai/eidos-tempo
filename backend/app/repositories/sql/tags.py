from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import TagRow
from app.domain.errors import NotFoundError
from app.domain.ids import TagId
from app.domain.tags import Tag


class SqlTagRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, tag_id: TagId) -> Tag | None:
        row = self._session.get(TagRow, tag_id)
        return to_tag(row) if row else None

    def get_by_name(self, name: str) -> Tag | None:
        row = self._session.scalar(select(TagRow).where(func.lower(TagRow.name) == name.lower()))
        return to_tag(row) if row else None

    def list_all(self, include_archived: bool) -> list[Tag]:
        query = select(TagRow).order_by(TagRow.name)
        if not include_archived:
            query = query.where(TagRow.is_archived.is_(False))
        return [to_tag(row) for row in self._session.scalars(query)]

    def add(self, tag: Tag) -> None:
        row = TagRow(id=tag.id)
        apply_tag(row, tag)
        self._session.add(row)
        self._session.flush()

    def save(self, tag: Tag) -> None:
        row = self._session.get(TagRow, tag.id)
        if row is None:
            raise NotFoundError("Tag", tag.id)
        apply_tag(row, tag)
        self._session.flush()


def to_tag(row: TagRow) -> Tag:
    return Tag(
        id=TagId(row.id), name=row.name, created_at=row.created_at, is_archived=row.is_archived
    )


def apply_tag(row: TagRow, tag: Tag) -> None:
    row.name = tag.name
    row.is_archived = tag.is_archived
    row.created_at = tag.created_at
