import pytest

from app.domain.users import Role, User
from app.domain.value_objects import EmailAddress
from app.repositories.protocols import Repositories
from app.services.clients import ClientService
from app.services.projects import ProjectService
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
    return UserService(users=repositories.users, hasher=FakePasswordHasher(), clock=clock)


@pytest.fixture
def client_service(repositories: Repositories, clock: FakeClock) -> ClientService:
    return ClientService(clients=repositories.clients, clock=clock)


@pytest.fixture
def project_service(repositories: Repositories, clock: FakeClock) -> ProjectService:
    return ProjectService(projects=repositories.projects, clients=repositories.clients, clock=clock)


@pytest.fixture
def time_entry_service(repositories: Repositories, clock: FakeClock) -> TimeEntryService:
    return TimeEntryService(
        time_entries=repositories.time_entries, projects=repositories.projects, clock=clock
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
