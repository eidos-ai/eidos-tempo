from sqlalchemy.orm import Session

from app.repositories.protocols import Repositories
from app.repositories.sql.api_tokens import SqlApiTokenRepository
from app.repositories.sql.clients import SqlClientRepository
from app.repositories.sql.import_links import SqlImportLinkRepository
from app.repositories.sql.numeric_ids import SqlNumericIdRepository
from app.repositories.sql.projects import SqlProjectRepository
from app.repositories.sql.sessions import SqlSessionRepository
from app.repositories.sql.tags import SqlTagRepository
from app.repositories.sql.time_entries import SqlTimeEntryRepository
from app.repositories.sql.users import SqlUserRepository


def build_sql_repositories(session: Session) -> Repositories:
    return Repositories(
        users=SqlUserRepository(session),
        sessions=SqlSessionRepository(session),
        clients=SqlClientRepository(session),
        projects=SqlProjectRepository(session),
        tags=SqlTagRepository(session),
        time_entries=SqlTimeEntryRepository(session),
        import_links=SqlImportLinkRepository(session),
        api_tokens=SqlApiTokenRepository(session),
        numeric_ids=SqlNumericIdRepository(session),
    )
