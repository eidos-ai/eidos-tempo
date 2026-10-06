from fastapi import APIRouter, status

from app.api.deps import ApiTokenServiceDep, CurrentUser, UserServiceDep
from app.api.schemas.users import (
    ApiTokenOut,
    IssuedApiTokenOut,
    PasswordChangeIn,
    PreferencesSchema,
    UserOut,
)

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


@router.get("/api-token")
def get_api_token(actor: CurrentUser, api_tokens: ApiTokenServiceDep) -> ApiTokenOut | None:
    token = api_tokens.get(actor)
    return ApiTokenOut.from_domain(token) if token else None


@router.post("/api-token")
def issue_api_token(actor: CurrentUser, api_tokens: ApiTokenServiceDep) -> IssuedApiTokenOut:
    return IssuedApiTokenOut.from_domain(api_tokens.issue(actor))


@router.delete("/api-token", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_token(actor: CurrentUser, api_tokens: ApiTokenServiceDep) -> None:
    api_tokens.revoke(actor)
