from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, UserServiceDep
from app.api.schemas.users import PasswordResetIn, UserCreateIn, UserOut, UserUpdateIn
from app.domain.ids import UserId
from app.domain.value_objects import EmailAddress
from app.services.users import NewUser, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(actor: CurrentUser, users: UserServiceDep) -> list[UserOut]:
    return [UserOut.from_domain(user) for user in users.list_users(actor)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreateIn, actor: CurrentUser, users: UserServiceDep) -> UserOut:
    new_user = NewUser(
        email=EmailAddress(body.email),
        full_name=body.full_name,
        password=body.password,
        role=body.role,
    )
    return UserOut.from_domain(users.create_user(actor, new_user))


@router.put("/{user_id}")
def update_user(
    user_id: UUID, body: UserUpdateIn, actor: CurrentUser, users: UserServiceDep
) -> UserOut:
    update = UserUpdate(full_name=body.full_name, role=body.role, is_active=body.is_active)
    return UserOut.from_domain(users.update_user(actor, UserId(user_id), update))


@router.put("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: UUID, body: PasswordResetIn, actor: CurrentUser, users: UserServiceDep
) -> None:
    users.reset_password(actor, UserId(user_id), body.new_password)
