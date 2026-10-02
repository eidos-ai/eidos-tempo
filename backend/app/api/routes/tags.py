from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, TagServiceDep
from app.api.schemas.tags import TagIn, TagOut
from app.domain.ids import TagId

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("")
def list_tags(
    actor: CurrentUser, tags: TagServiceDep, include_archived: bool = False
) -> list[TagOut]:
    return [TagOut.from_domain(tag) for tag in tags.list_tags(include_archived)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tag(body: TagIn, actor: CurrentUser, tags: TagServiceDep) -> TagOut:
    return TagOut.from_domain(tags.create_tag(actor, body.to_draft()))


@router.put("/{tag_id}")
def update_tag(tag_id: UUID, body: TagIn, actor: CurrentUser, tags: TagServiceDep) -> TagOut:
    return TagOut.from_domain(tags.update_tag(actor, TagId(tag_id), body.to_draft()))
