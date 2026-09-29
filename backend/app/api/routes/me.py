from fastapi import APIRouter, status

from app.api.deps import CurrentUser, UserServiceDep
from app.api.schemas.users import PasswordChangeIn, PreferencesSchema, UserOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
def get_me(actor: CurrentUser) -> UserOut:
    return UserOut.from_domain(actor)


@router.put("/preferences")
def update_preferences(
    body: PreferencesSchema, actor: CurrentUser, users: UserServiceDep
) -> UserOut:
    return UserOut.from_domain(users.update_preferences(actor, body.to_domain()))


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: PasswordChangeIn, actor: CurrentUser, users: UserServiceDep) -> None:
    users.change_own_password(actor, body.current_password, body.new_password)
