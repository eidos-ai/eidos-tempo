from uuid import UUID

from pydantic import BaseModel

from app.domain.clients import Client
from app.services.clients import ClientDraft


class ClientOut(BaseModel):
    id: UUID
    name: str
    is_archived: bool

    @classmethod
    def from_domain(cls, client: Client) -> "ClientOut":
        return cls(id=client.id, name=client.name, is_archived=client.is_archived)


class ClientIn(BaseModel):
    name: str
    is_archived: bool = False

    def to_draft(self) -> ClientDraft:
        return ClientDraft(name=self.name, is_archived=self.is_archived)
