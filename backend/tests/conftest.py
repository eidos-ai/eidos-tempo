from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_clock, get_password_hasher, get_repositories
from app.config import Settings
from app.domain.users import Role, User
from app.domain.value_objects import EmailAddress
from app.main import create_app
from app.repositories.protocols import Repositories
from app.services.clients import ClientService
from app.services.projects import ProjectService
from app.services.reports import ReportService
from app.services.tags import TagService
from app.services.time_entries import TimeEntryService
from app.services.users import NewUser, UserService
from tests.fakes import FakeClock, FakePasswordHasher, build_in_memory_repositories


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def repositories() -> Repositories:
    return build_in_memory_repositories()


@pytest.fixture
def user_service(repositories: Repositories, clock: FakeClock) -> UserService:
    return UserService(
        users=repositories.users,
        sessions=repositories.sessions,
        hasher=FakePasswordHasher(),
        clock=clock,
    )


@pytest.fixture
def client_service(repositories: Repositories, clock: FakeClock) -> ClientService:
    return ClientService(clients=repositories.clients, clock=clock)


@pytest.fixture
def project_service(repositories: Repositories, clock: FakeClock) -> ProjectService:
    return ProjectService(projects=repositories.projects, clients=repositories.clients, clock=clock)


@pytest.fixture
def tag_service(repositories: Repositories, clock: FakeClock) -> TagService:
    return TagService(tags=repositories.tags, clock=clock)


@pytest.fixture
def time_entry_service(repositories: Repositories, clock: FakeClock) -> TimeEntryService:
    return TimeEntryService(
        time_entries=repositories.time_entries,
        projects=repositories.projects,
        tags=repositories.tags,
        clock=clock,
    )


@pytest.fixture
def admin(user_service: UserService) -> User:
    return user_service.bootstrap_admin(
        NewUser(
            email=EmailAddress("admin@eidos.ai"),
            full_name="Admin",
            password="admin-password",
            role=Role.ADMIN,
        )
    )


@pytest.fixture
def member(user_service: UserService, admin: User) -> User:
    return user_service.create_user(
        admin,
        NewUser(
            email=EmailAddress("member@eidos.ai"),
            full_name="Member",
            password="member-password",
            role=Role.MEMBER,
        ),
    )


def build_test_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://unused:unused@localhost/unused",
        cookie_secure=False,
    )


@pytest.fixture
def api_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def api_client(api_clock: FakeClock) -> Iterator[TestClient]:
    app = create_app(build_test_settings())
    repositories = build_in_memory_repositories()
    clock = api_clock
    hasher = FakePasswordHasher()
    UserService(repositories.users, repositories.sessions, hasher, clock).bootstrap_admin(
        NewUser(EmailAddress("admin@eidos.ai"), "Admin", "admin-password", Role.ADMIN)
    )
    app.dependency_overrides[get_repositories] = lambda: repositories
    app.dependency_overrides[get_clock] = lambda: clock
    app.dependency_overrides[get_password_hasher] = lambda: hasher
    with TestClient(app) as client:
        yield client


@pytest.fixture
def report_service(repositories: Repositories) -> ReportService:
    return ReportService(
        time_entries=repositories.time_entries,
        users=repositories.users,
        projects=repositories.projects,
        clients=repositories.clients,
        tags=repositories.tags,
    )
