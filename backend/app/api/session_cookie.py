from datetime import datetime

from fastapi import Response

from app.config import Settings


def set_session_cookie(
    response: Response, token: str, expires_at: datetime, settings: Settings
) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        expires=expires_at,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
