from uuid import UUID


class DomainError(Exception):
    pass


class NotFoundError(DomainError):
    def __init__(self, entity: str, entity_id: UUID | int | str) -> None:
        super().__init__(f"{entity} {entity_id} not found")
        self.entity = entity
        self.entity_id = entity_id


class PermissionDeniedError(DomainError):
    pass


class AuthenticationError(DomainError):
    pass


class ConflictError(DomainError):
    pass


class InvalidValueError(DomainError):
    pass
