from collections.abc import Iterator
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session, sessionmaker

from app.api.session_cookie import set_session_cookie
from app.auth.passwords import Argon2PasswordHasher, PasswordHasher
from app.config import Settings
from app.domain.clock import Clock, SystemClock
from app.domain.errors import AuthenticationError
from app.domain.users import User
from app.repositories.protocols import Repositories
from app.repositories.sql import build_sql_repositories
from app.services.auth import AuthService
from app.services.clients import ClientService
from app.services.projects import ProjectService
from app.services.reports import ReportService
from app.services.tags import TagService
from app.services.time_entries import TimeEntryService
from app.services.users import UserService

_password_hasher = Argon2PasswordHasher()
_clock = SystemClock()


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_repositories(request: Request) -> Iterator[Repositories]:
    session_factory: sessionmaker[Session] = request.app.state.session_factory
    with session_factory() as session:
        try:
            yield build_sql_repositories(session)
            session.commit()
        except Exception:
            session.rollback()
            raise


def get_clock() -> Clock:
    return _clock


def get_password_hasher() -> PasswordHasher:
    return _password_hasher


SettingsDep = Annotated[Settings, Depends(get_settings)]
# scope="function" commits before responding, so a failed commit is never reported as saved.
RepositoriesDep = Annotated[Repositories, Depends(get_repositories, scope="function")]
ClockDep = Annotated[Clock, Depends(get_clock)]
HasherDep = Annotated[PasswordHasher, Depends(get_password_hasher)]


def get_auth_service(
    repositories: RepositoriesDep, hasher: HasherDep, clock: ClockDep, settings: SettingsDep
) -> AuthService:
    return AuthService(
        users=repositories.users,
        sessions=repositories.sessions,
        hasher=hasher,
        clock=clock,
        idle_timeout=timedelta(days=settings.session_idle_days),
    )


def get_user_service(
    repositories: RepositoriesDep, hasher: HasherDep, clock: ClockDep
) -> UserService:
    return UserService(
        users=repositories.users, sessions=repositories.sessions, hasher=hasher, clock=clock
    )


def get_client_service(repositories: RepositoriesDep, clock: ClockDep) -> ClientService:
    return ClientService(clients=repositories.clients, clock=clock)


def get_project_service(repositories: RepositoriesDep, clock: ClockDep) -> ProjectService:
    return ProjectService(projects=repositories.projects, clients=repositories.clients, clock=clock)


def get_tag_service(repositories: RepositoriesDep, clock: ClockDep) -> TagService:
    return TagService(tags=repositories.tags, clock=clock)


def get_time_entry_service(repositories: RepositoriesDep, clock: ClockDep) -> TimeEntryService:
    return TimeEntryService(
        time_entries=repositories.time_entries,
        projects=repositories.projects,
        tags=repositories.tags,
        clock=clock,
    )


def get_report_service(repositories: RepositoriesDep) -> ReportService:
    return ReportService(
        time_entries=repositories.time_entries,
        users=repositories.users,
        projects=repositories.projects,
        clients=repositories.clients,
        tags=repositories.tags,
    )


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
ClientServiceDep = Annotated[ClientService, Depends(get_client_service)]
ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
TagServiceDep = Annotated[TagService, Depends(get_tag_service)]
TimeEntryServiceDep = Annotated[TimeEntryService, Depends(get_time_entry_service)]
ReportServiceDep = Annotated[ReportService, Depends(get_report_service)]


def get_current_user(
    request: Request, response: Response, auth: AuthServiceDep, settings: SettingsDep
) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise AuthenticationError("Not logged in")
    authenticated = auth.authenticate(token)
    if authenticated.was_refreshed:
        set_session_cookie(response, token, authenticated.expires_at, settings)
    return authenticated.user


CurrentUser = Annotated[User, Depends(get_current_user)]
