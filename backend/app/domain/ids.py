from typing import NewType
from uuid import UUID, uuid4

UserId = NewType("UserId", UUID)
ClientId = NewType("ClientId", UUID)
ProjectId = NewType("ProjectId", UUID)
TimeEntryId = NewType("TimeEntryId", UUID)
TagId = NewType("TagId", UUID)


def new_uuid() -> UUID:
    return uuid4()
