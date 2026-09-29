from datetime import datetime

from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.db.models import AuthSessionRow
from app.domain.ids import UserId
from app.domain.sessions import AuthSession


class SqlSessionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, token_hash: str) -> AuthSession | None:
        row = self._session.get(AuthSessionRow, token_hash)
        if row is None:
            return None
        return AuthSession(
            token_hash=row.token_hash,
            user_id=UserId(row.user_id),
            created_at=row.created_at,
            expires_at=row.expires_at,
        )

    def add(self, auth_session: AuthSession) -> None:
        self._session.add(
            AuthSessionRow(
                token_hash=auth_session.token_hash,
                user_id=auth_session.user_id,
                created_at=auth_session.created_at,
                expires_at=auth_session.expires_at,
            )
        )
        self._session.flush()

    def save(self, auth_session: AuthSession) -> None:
        self._session.execute(
            update(AuthSessionRow)
            .where(AuthSessionRow.token_hash == auth_session.token_hash)
            .values(expires_at=auth_session.expires_at)
        )

    def delete_expired(self, now: datetime) -> None:
        self._session.execute(delete(AuthSessionRow).where(AuthSessionRow.expires_at <= now))

    def delete(self, token_hash: str) -> None:
        self._session.execute(delete(AuthSessionRow).where(AuthSessionRow.token_hash == token_hash))

    def delete_for_user(self, user_id: UserId) -> None:
        self._session.execute(delete(AuthSessionRow).where(AuthSessionRow.user_id == user_id))
