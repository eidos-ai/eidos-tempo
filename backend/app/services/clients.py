from dataclasses import dataclass

from app.domain.clients import Client
from app.domain.clock import Clock
from app.domain.errors import ConflictError, NotFoundError
from app.domain.ids import ClientId, new_uuid
from app.domain.users import User
from app.domain.value_objects import require_text
from app.repositories.protocols import ClientRepository
from app.services.permissions import require_admin

MAX_CLIENT_NAME_LENGTH = 120


@dataclass(frozen=True)
class ClientDraft:
    name: str
    is_archived: bool = False


class ClientService:
    def __init__(self, clients: ClientRepository, clock: Clock) -> None:
        self._clients = clients
        self._clock = clock

    def list_clients(self, include_archived: bool) -> list[Client]:
        return self._clients.list_all(include_archived)

    def create_client(self, actor: User, draft: ClientDraft) -> Client:
        require_admin(actor)
        name = self._unique_name(draft.name, current=None)
        client = Client(
            id=ClientId(new_uuid()),
            name=name,
            created_at=self._clock.now(),
            is_archived=draft.is_archived,
        )
        self._clients.add(client)
        return client

    def update_client(self, actor: User, client_id: ClientId, draft: ClientDraft) -> Client:
        require_admin(actor)
        client = self._clients.get(client_id)
        if client is None:
            raise NotFoundError("Client", client_id)
        client.name = self._unique_name(draft.name, current=client)
        client.is_archived = draft.is_archived
        self._clients.save(client)
        return client

    def _unique_name(self, raw_name: str, current: Client | None) -> str:
        name = require_text(raw_name, "Client name", MAX_CLIENT_NAME_LENGTH)
        existing = self._clients.get_by_name(name)
        if existing is not None and (current is None or existing.id != current.id):
            raise ConflictError(f"A client named {name!r} already exists")
        return name
