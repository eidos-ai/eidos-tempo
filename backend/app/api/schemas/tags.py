from uuid import UUID

from pydantic import BaseModel

from app.domain.tags import Tag
from app.services.tags import TagDraft


class TagOut(BaseModel):
    id: UUID
    name: str
    is_archived: bool

    @classmethod
    def from_domain(cls, tag: Tag) -> "TagOut":
        return cls(id=tag.id, name=tag.name, is_archived=tag.is_archived)


class TagIn(BaseModel):
    name: str
    is_archived: bool = False

    def to_draft(self) -> TagDraft:
        return TagDraft(name=self.name, is_archived=self.is_archived)
