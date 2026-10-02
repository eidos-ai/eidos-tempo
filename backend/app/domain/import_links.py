from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID


class ImportSource(StrEnum):
    TOGGL = "toggl"


class ImportedEntity(StrEnum):
    USER = "user"
    CLIENT = "client"
    PROJECT = "project"
    TAG = "tag"
    TIME_ENTRY = "time_entry"


@dataclass(frozen=True)
class ImportLink:
    source: ImportSource
    entity: ImportedEntity
    external_id: str
    internal_id: UUID
