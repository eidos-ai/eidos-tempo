from fastapi import APIRouter, Request, Response, status

from app.api.deps import AuthServiceDep, SettingsDep
from app.api.schemas.users import LoginIn, UserOut
from app.domain.value_objects import EmailAddress

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(
    body: LoginIn, response: Response, auth: AuthServiceDep, settings: SettingsDep
) -> UserOut:
    result = auth.login(EmailAddress(body.email), body.password)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=result.token,
        expires=result.expires_at,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    return UserOut.from_domain(result.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request, response: Response, auth: AuthServiceDep, settings: SettingsDep
) -> None:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        auth.logout(token)
    response.delete_cookie(settings.session_cookie_name)
