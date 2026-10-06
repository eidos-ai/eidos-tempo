from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import NumericIdRow
from app.domain.numeric_ids import NumberedEntity


class SqlNumericIdRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def numbers_for(self, entity: NumberedEntity, internal_ids: set[UUID]) -> dict[UUID, int]:
        if not internal_ids:
            return {}
        known = self._known(entity, internal_ids)
        missing = internal_ids - known.keys()
        if missing:
            self._session.execute(
                insert(NumericIdRow)
                .values([{"entity": entity.value, "internal_id": i} for i in missing])
                .on_conflict_do_nothing(index_elements=["entity", "internal_id"])
            )
            known |= self._known(entity, missing)
        return known

    def internal_id(self, entity: NumberedEntity, number: int) -> UUID | None:
        row = self._session.get(NumericIdRow, (entity.value, number))
        return row.internal_id if row else None

    def keep(self, entity: NumberedEntity, internal_id: UUID, number: int) -> None:
        self._session.execute(
            insert(NumericIdRow)
            .values(entity=entity.value, number=number, internal_id=internal_id)
            .on_conflict_do_nothing()
        )

    def _known(self, entity: NumberedEntity, internal_ids: set[UUID]) -> dict[UUID, int]:
        rows = self._session.execute(
            select(NumericIdRow.internal_id, NumericIdRow.number).where(
                NumericIdRow.entity == entity.value, NumericIdRow.internal_id.in_(internal_ids)
            )
        )
        return {internal_id: number for internal_id, number in rows}
