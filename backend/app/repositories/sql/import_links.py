from sqlalchemy.orm import Session

from app.db.models import ImportLinkRow
from app.domain.import_links import ImportedEntity, ImportLink, ImportSource


class SqlImportLinkRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def find(
        self, source: ImportSource, entity: ImportedEntity, external_id: str
    ) -> ImportLink | None:
        row = self._session.get(ImportLinkRow, (source.value, entity.value, external_id))
        if row is None:
            return None
        return ImportLink(
            source=source,
            entity=entity,
            external_id=external_id,
            internal_id=row.internal_id,
        )

    def add(self, link: ImportLink) -> None:
        self._session.add(
            ImportLinkRow(
                source=link.source.value,
                entity=link.entity.value,
                external_id=link.external_id,
                internal_id=link.internal_id,
            )
        )
        self._session.flush()
