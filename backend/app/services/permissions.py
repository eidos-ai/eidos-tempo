from app.domain.errors import PermissionDeniedError
from app.domain.users import User


def require_admin(actor: User) -> None:
    if not actor.is_admin:
        raise PermissionDeniedError("This action requires the admin role")
