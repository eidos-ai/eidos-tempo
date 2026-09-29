from typing import NewType
from uuid import UUID, uuid4

UserId = NewType("UserId", UUID)
ClientId = NewType("ClientId", UUID)
ProjectId = NewType("ProjectId", UUID)
TimeEntryId = NewType("TimeEntryId", UUID)


def new_uuid() -> UUID:
    return uuid4()
