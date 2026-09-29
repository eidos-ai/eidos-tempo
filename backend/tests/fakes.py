from dataclasses import replace
from datetime import UTC, datetime, timedelta

from app.domain.clients import Client
from app.domain.ids import ClientId, ProjectId, TimeEntryId, UserId
from app.domain.projects import Project
from app.domain.sessions import AuthSession
from app.domain.time_entries import TimeEntry
from app.domain.users import User
from app.domain.value_objects import DateRange, EmailAddress
from app.repositories.protocols import Repositories


class FakeClock:
    def __init__(self, now: datetime = datetime(2026, 9, 28, 9, 0, tzinfo=UTC)) -> None:
        self.current = now

    def now(self) -> datetime:
        return self.current

    def advance(self, delta: timedelta) -> None:
        self.current += delta


class FakePasswordHasher:
    def hash(self, password: str) -> str:
        return f"hashed:{password}"

    def verify(self, password_hash: str, password: str) -> bool:
        return password_hash == f"hashed:{password}"


class InMemoryUserRepository:
    def __init__(self) -> None:
        self.items: dict[UserId, User] = {}

    def get(self, user_id: UserId) -> User | None:
        user = self.items.get(user_id)
        return replace(user) if user else None

    def get_by_email(self, email: EmailAddress) -> User | None:
        return next((replace(u) for u in self.items.values() if u.email == email), None)

    def list_all(self) -> list[User]:
        return sorted((replace(u) for u in self.items.values()), key=lambda u: u.full_name)

    def add(self, user: User) -> None:
        self.items[user.id] = replace(user)

    def save(self, user: User) -> None:
        self.items[user.id] = replace(user)


class InMemorySessionRepository:
    def __init__(self) -> None:
        self.items: dict[str, AuthSession] = {}

    def get(self, token_hash: str) -> AuthSession | None:
        return self.items.get(token_hash)

    def add(self, session: AuthSession) -> None:
        self.items[session.token_hash] = session

    def delete(self, token_hash: str) -> None:
        self.items.pop(token_hash, None)


class InMemoryClientRepository:
    def __init__(self) -> None:
        self.items: dict[ClientId, Client] = {}

    def get(self, client_id: ClientId) -> Client | None:
        client = self.items.get(client_id)
        return replace(client) if client else None

    def get_by_name(self, name: str) -> Client | None:
        return next(
            (replace(c) for c in self.items.values() if c.name.lower() == name.lower()), None
        )

    def list_all(self, include_archived: bool) -> list[Client]:
        clients = [c for c in self.items.values() if include_archived or not c.is_archived]
        return sorted((replace(c) for c in clients), key=lambda c: c.name)

    def add(self, client: Client) -> None:
        self.items[client.id] = replace(client)

    def save(self, client: Client) -> None:
        self.items[client.id] = replace(client)


class InMemoryProjectRepository:
    def __init__(self) -> None:
        self.items: dict[ProjectId, Project] = {}

    def get(self, project_id: ProjectId) -> Project | None:
        project = self.items.get(project_id)
        return replace(project) if project else None

    def list_all(self, include_archived: bool) -> list[Project]:
        projects = [p for p in self.items.values() if include_archived or not p.is_archived]
        return sorted((replace(p) for p in projects), key=lambda p: p.name)

    def add(self, project: Project) -> None:
        self.items[project.id] = replace(project)

    def save(self, project: Project) -> None:
        self.items[project.id] = replace(project)


class InMemoryTimeEntryRepository:
    def __init__(self) -> None:
        self.items: dict[TimeEntryId, TimeEntry] = {}

    def get(self, entry_id: TimeEntryId) -> TimeEntry | None:
        entry = self.items.get(entry_id)
        return replace(entry) if entry else None

    def get_running(self, user_id: UserId) -> TimeEntry | None:
        return next(
            (
                replace(e)
                for e in self.items.values()
                if e.user_id == user_id and e.is_running and not e.is_deleted
            ),
            None,
        )

    def list_overlapping(self, user_id: UserId, period: DateRange) -> list[TimeEntry]:
        entries = [
            replace(e)
            for e in self.items.values()
            if e.user_id == user_id
            and not e.is_deleted
            and e.start < period.end
            and (e.stop is None or e.stop > period.start)
        ]
        return sorted(entries, key=lambda e: e.start, reverse=True)

    def add(self, entry: TimeEntry) -> None:
        self.items[entry.id] = replace(entry)

    def save(self, entry: TimeEntry) -> None:
        self.items[entry.id] = replace(entry)


def build_in_memory_repositories() -> Repositories:
    return Repositories(
        users=InMemoryUserRepository(),
        sessions=InMemorySessionRepository(),
        clients=InMemoryClientRepository(),
        projects=InMemoryProjectRepository(),
        time_entries=InMemoryTimeEntryRepository(),
    )
