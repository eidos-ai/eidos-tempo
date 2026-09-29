from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import ClientRow
from app.domain.clients import Client
from app.domain.errors import NotFoundError
from app.domain.ids import ClientId


class SqlClientRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, client_id: ClientId) -> Client | None:
        row = self._session.get(ClientRow, client_id)
        return to_client(row) if row else None

    def get_by_name(self, name: str) -> Client | None:
        row = self._session.scalar(
            select(ClientRow).where(func.lower(ClientRow.name) == name.lower())
        )
        return to_client(row) if row else None

    def list_all(self, include_archived: bool) -> list[Client]:
        query = select(ClientRow).order_by(ClientRow.name)
        if not include_archived:
            query = query.where(ClientRow.is_archived.is_(False))
        return [to_client(row) for row in self._session.scalars(query)]

    def add(self, client: Client) -> None:
        row = ClientRow(id=client.id)
        apply_client(row, client)
        self._session.add(row)
        self._session.flush()

    def save(self, client: Client) -> None:
        row = self._session.get(ClientRow, client.id)
        if row is None:
            raise NotFoundError("Client", client.id)
        apply_client(row, client)
        self._session.flush()


def to_client(row: ClientRow) -> Client:
    return Client(
        id=ClientId(row.id),
        name=row.name,
        created_at=row.created_at,
        is_archived=row.is_archived,
    )


def apply_client(row: ClientRow, client: Client) -> None:
    row.name = client.name
    row.is_archived = client.is_archived
    row.created_at = client.created_at
