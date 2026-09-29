from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import ClientServiceDep, CurrentUser
from app.api.schemas.clients import ClientIn, ClientOut
from app.domain.ids import ClientId

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("")
def list_clients(
    actor: CurrentUser, clients: ClientServiceDep, include_archived: bool = False
) -> list[ClientOut]:
    return [ClientOut.from_domain(client) for client in clients.list_clients(include_archived)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_client(body: ClientIn, actor: CurrentUser, clients: ClientServiceDep) -> ClientOut:
    return ClientOut.from_domain(clients.create_client(actor, body.to_draft()))


@router.put("/{client_id}")
def update_client(
    client_id: UUID, body: ClientIn, actor: CurrentUser, clients: ClientServiceDep
) -> ClientOut:
    return ClientOut.from_domain(clients.update_client(actor, ClientId(client_id), body.to_draft()))
