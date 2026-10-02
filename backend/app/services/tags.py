import logging
from dataclasses import dataclass

from app.domain.clock import Clock
from app.domain.errors import ConflictError, NotFoundError
from app.domain.ids import TagId, new_uuid
from app.domain.tags import Tag
from app.domain.users import User
from app.domain.value_objects import require_text
from app.repositories.protocols import TagRepository
from app.services.permissions import require_admin

logger = logging.getLogger(__name__)

MAX_TAG_NAME_LENGTH = 60


@dataclass(frozen=True)
class TagDraft:
    name: str
    is_archived: bool = False


class TagService:
    def __init__(self, tags: TagRepository, clock: Clock) -> None:
        self._tags = tags
        self._clock = clock

    def list_tags(self, include_archived: bool) -> list[Tag]:
        return self._tags.list_all(include_archived)

    def create_tag(self, actor: User, draft: TagDraft) -> Tag:
        tag = Tag(
            id=TagId(new_uuid()),
            name=self._unique_name(draft.name, current=None),
            created_at=self._clock.now(),
            is_archived=draft.is_archived,
        )
        self._tags.add(tag)
        logger.info("Tag %r created by %s", tag.name, actor.email)
        return tag

    def update_tag(self, actor: User, tag_id: TagId, draft: TagDraft) -> Tag:
        require_admin(actor)
        tag = self._tags.get(tag_id)
        if tag is None:
            raise NotFoundError("Tag", tag_id)
        tag.name = self._unique_name(draft.name, current=tag)
        tag.is_archived = draft.is_archived
        self._tags.save(tag)
        return tag

    def _unique_name(self, raw_name: str, current: Tag | None) -> str:
        name = require_text(raw_name, "Tag name", MAX_TAG_NAME_LENGTH)
        existing = self._tags.get_by_name(name)
        if existing is not None and (current is None or existing.id != current.id):
            raise ConflictError(f"A tag named {name!r} already exists")
        return name
