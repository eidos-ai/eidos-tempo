from typing import Protocol

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.domain.errors import AuthenticationError


class CallerVerifier(Protocol):
    def verify(self, authorization: str) -> None: ...


class GoogleIdTokenVerifier:
    """Accepts only Google-signed ID tokens for one audience and one service account."""

    def __init__(self, audience: str, service_account_email: str) -> None:
        self._audience = audience
        self._email = service_account_email
        self._request = google_requests.Request()

    def verify(self, authorization: str) -> None:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise AuthenticationError("Send a Google ID token as a Bearer token")
        try:
            claims = id_token.verify_oauth2_token(token, self._request, audience=self._audience)
        except ValueError as error:
            raise AuthenticationError("Invalid Google ID token") from error
        if claims.get("email") != self._email or not claims.get("email_verified"):
            raise AuthenticationError("This caller may not run backups")
