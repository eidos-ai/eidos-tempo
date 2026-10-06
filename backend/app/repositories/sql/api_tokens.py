from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import ApiTokenRow
from app.domain.api_tokens import ApiToken
from app.domain.ids import UserId


class SqlApiTokenRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_hash(self, token_hash: str) -> ApiToken | None:
        row = self._session.scalar(select(ApiTokenRow).where(ApiTokenRow.token_hash == token_hash))
        return to_api_token(row) if row else None

    def get_for_user(self, user_id: UserId) -> ApiToken | None:
        row = self._session.get(ApiTokenRow, user_id)
        return to_api_token(row) if row else None

    def replace(self, token: ApiToken) -> None:
        self.delete_for_user(token.user_id)
        self._session.add(
            ApiTokenRow(
                user_id=token.user_id, token_hash=token.token_hash, created_at=token.created_at
            )
        )
        self._session.flush()

    def delete_for_user(self, user_id: UserId) -> None:
        self._session.execute(delete(ApiTokenRow).where(ApiTokenRow.user_id == user_id))


def to_api_token(row: ApiTokenRow) -> ApiToken:
    return ApiToken(
        user_id=UserId(row.user_id), token_hash=row.token_hash, created_at=row.created_at
    )
