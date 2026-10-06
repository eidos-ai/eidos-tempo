from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.domain.api_tokens import ApiToken
from app.domain.clients import Client
from app.domain.ids import ClientId, ProjectId, TagId, TimeEntryId, UserId
from app.domain.import_links import ImportedEntity, ImportLink, ImportSource
from app.domain.numeric_ids import FIRST_TEMPO_NUMBER, NumberedEntity
from app.domain.projects import Project
from app.domain.reports import ReportFilter
from app.domain.sessions import AuthSession
from app.domain.tags import Tag
from app.domain.time_entries import EntrySuggestion, TimeEntry
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

    def verify_dummy(self, password: str) -> None:
        pass


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

    def save(self, session: AuthSession) -> None:
        self.items[session.token_hash] = session

    def delete_expired(self, now: datetime) -> None:
        self.items = {k: s for k, s in self.items.items() if not s.is_expired(now)}

    def delete(self, token_hash: str) -> None:
        self.items.pop(token_hash, None)

    def delete_for_user(self, user_id: UserId) -> None:
        self.items = {k: s for k, s in self.items.items() if s.user_id != user_id}


class InMemoryApiTokenRepository:
    def __init__(self) -> None:
        self.items: dict[UserId, ApiToken] = {}

    def get_by_hash(self, token_hash: str) -> ApiToken | None:
        return next((t for t in self.items.values() if t.token_hash == token_hash), None)

    def get_for_user(self, user_id: UserId) -> ApiToken | None:
        return self.items.get(user_id)

    def replace(self, token: ApiToken) -> None:
        self.items[token.user_id] = token

    def delete_for_user(self, user_id: UserId) -> None:
        self.items.pop(user_id, None)


class InMemoryNumericIdRepository:
    def __init__(self) -> None:
        self.items: dict[tuple[NumberedEntity, UUID], int] = {}
        self._next = FIRST_TEMPO_NUMBER

    def numbers_for(self, entity: NumberedEntity, internal_ids: set[UUID]) -> dict[UUID, int]:
        for internal_id in sorted(internal_ids - {i for e, i in self.items if e is entity}):
            self.items[(entity, internal_id)] = self._next
            self._next += 1
        return {i: self.items[(entity, i)] for i in internal_ids}

    def internal_id(self, entity: NumberedEntity, number: int) -> UUID | None:
        return next((i for (e, i), n in self.items.items() if e is entity and n == number), None)

    def keep(self, entity: NumberedEntity, internal_id: UUID, number: int) -> None:
        self.items.setdefault((entity, internal_id), number)


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


class InMemoryTagRepository:
    def __init__(self) -> None:
        self.items: dict[TagId, Tag] = {}

    def get(self, tag_id: TagId) -> Tag | None:
        tag = self.items.get(tag_id)
        return replace(tag) if tag else None

    def get_by_name(self, name: str) -> Tag | None:
        return next(
            (replace(t) for t in self.items.values() if t.name.lower() == name.lower()), None
        )

    def list_all(self, include_archived: bool) -> list[Tag]:
        tags = [t for t in self.items.values() if include_archived or not t.is_archived]
        return sorted((replace(t) for t in tags), key=lambda t: t.name)

    def add(self, tag: Tag) -> None:
        self.items[tag.id] = replace(tag)

    def save(self, tag: Tag) -> None:
        self.items[tag.id] = replace(tag)


class InMemoryImportLinkRepository:
    def __init__(self) -> None:
        self.items: dict[tuple[ImportSource, ImportedEntity, str], ImportLink] = {}

    def find(
        self, source: ImportSource, entity: ImportedEntity, external_id: str
    ) -> ImportLink | None:
        return self.items.get((source, entity, external_id))

    def add(self, link: ImportLink) -> None:
        self.items[(link.source, link.entity, link.external_id)] = link


class InMemoryTimeEntryRepository:
    def __init__(self, projects: InMemoryProjectRepository) -> None:
        self.items: dict[TimeEntryId, TimeEntry] = {}
        self._projects = projects

    def get(self, entry_id: TimeEntryId) -> TimeEntry | None:
        entry = self.items.get(entry_id)
        return replace(entry) if entry else None

    def get_owner(self, entry_id: TimeEntryId) -> UserId | None:
        entry = self.items.get(entry_id)
        return entry.user_id if entry else None

    def get_running(self, user_id: UserId) -> TimeEntry | None:
        return next(
            (
                replace(e)
                for e in self.items.values()
                if e.user_id == user_id and e.is_running and not e.is_deleted
            ),
            None,
        )

    def lock_user_entries(self, user_id: UserId) -> None:
        pass

    def list_suggestions(self, user_id: UserId, limit: int) -> list[EntrySuggestion]:
        latest: dict[tuple[str, ProjectId | None], datetime] = {}
        for entry in self.items.values():
            if entry.user_id != user_id or entry.is_deleted or not entry.description:
                continue
            key = (entry.description, entry.project_id)
            latest[key] = max(latest.get(key, entry.start), entry.start)
        ranked = sorted(latest.items(), key=lambda item: item[1], reverse=True)[:limit]
        return [
            EntrySuggestion(description, project_id, used)
            for (description, project_id), used in ranked
        ]

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

    def list_for_report(self, report_filter: ReportFilter) -> list[TimeEntry]:
        entries = [
            replace(e)
            for e in self.items.values()
            if report_filter.matches(e, self._client_of(e.project_id))
        ]
        return sorted(entries, key=lambda e: e.start, reverse=True)

    def add(self, entry: TimeEntry) -> None:
        self.items[entry.id] = replace(entry)

    def save(self, entry: TimeEntry) -> None:
        self.items[entry.id] = replace(entry)

    def _client_of(self, project_id: ProjectId | None) -> ClientId | None:
        project = self._projects.get(project_id) if project_id else None
        return project.client_id if project else None


def build_in_memory_repositories() -> Repositories:
    projects = InMemoryProjectRepository()
    return Repositories(
        users=InMemoryUserRepository(),
        sessions=InMemorySessionRepository(),
        clients=InMemoryClientRepository(),
        projects=projects,
        tags=InMemoryTagRepository(),
        time_entries=InMemoryTimeEntryRepository(projects),
        import_links=InMemoryImportLinkRepository(),
        api_tokens=InMemoryApiTokenRepository(),
        numeric_ids=InMemoryNumericIdRepository(),
    )
