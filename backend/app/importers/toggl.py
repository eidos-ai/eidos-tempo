import logging
import secrets
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import timedelta
from uuid import UUID

from app.auth.passwords import PasswordHasher
from app.domain.clock import Clock
from app.domain.errors import InvalidValueError
from app.domain.ids import ClientId, ProjectId, TagId, TimeEntryId, UserId
from app.domain.import_links import ImportedEntity, ImportLink, ImportSource
from app.domain.users import Role, User
from app.domain.value_objects import EmailAddress, HexColor
from app.importers.toggl_api import TogglSnapshot, TogglTimeEntry, TogglUser
from app.repositories.protocols import Repositories
from app.services.clients import ClientDraft, ClientService
from app.services.projects import ProjectDraft, ProjectService
from app.services.tags import TagDraft, TagService
from app.services.time_entries import (
    MAX_DESCRIPTION_LENGTH,
    TimeEntryDraft,
    TimeEntryService,
)
from app.services.users import NewUser, UserService, UserUpdate

logger = logging.getLogger(__name__)

SOURCE = ImportSource.TOGGL
FALLBACK_COLOR = HexColor("#9D9AC8")
SECONDS_PER_HOUR = 3600


@dataclass
class EntityCounts:
    created: int = 0
    linked: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0


@dataclass
class ImportReport:
    users: EntityCounts = field(default_factory=EntityCounts)
    clients: EntityCounts = field(default_factory=EntityCounts)
    projects: EntityCounts = field(default_factory=EntityCounts)
    tags: EntityCounts = field(default_factory=EntityCounts)
    time_entries: EntityCounts = field(default_factory=EntityCounts)
    warnings: Counter[str] = field(default_factory=Counter)
    hours_by_year: defaultdict[int, float] = field(default_factory=lambda: defaultdict(float))


class TogglImporter:
    def __init__(
        self,
        repositories: Repositories,
        hasher: PasswordHasher,
        clock: Clock,
        admin_emails: list[EmailAddress],
    ) -> None:
        if not admin_emails:
            raise InvalidValueError("At least one admin email is required")
        self._repositories = repositories
        self._clock = clock
        self._admin_emails = admin_emails
        self._users = UserService(repositories.users, repositories.sessions, hasher, clock)
        self._clients = ClientService(repositories.clients, clock)
        self._projects = ProjectService(repositories.projects, repositories.clients, clock)
        self._tags = TagService(repositories.tags, clock)
        self._entries = TimeEntryService(
            repositories.time_entries, repositories.projects, repositories.tags, clock
        )
        self._report = ImportReport()

    def run(self, snapshot: TogglSnapshot) -> ImportReport:
        users = self._import_users(snapshot.users)
        actor = self._acting_admin()
        clients = self._import_clients(snapshot, actor)
        projects = self._import_projects(snapshot, clients, actor)
        tags = self._import_tags(snapshot, actor)
        self._import_time_entries(snapshot.time_entries, users, projects, tags)
        self._archive_inactive_projects(snapshot, projects, actor)
        return self._report

    def _import_users(self, toggl_users: list[TogglUser]) -> dict[int, User]:
        ordered = sorted(toggl_users, key=lambda u: EmailAddress(u.email) not in self._admin_emails)
        users: dict[int, User] = {}
        for toggl_user in ordered:
            users[toggl_user.uid] = self._import_user(toggl_user)
        return users

    def _import_user(self, toggl_user: TogglUser) -> User:
        email = EmailAddress(toggl_user.email)
        wants_admin = email in self._admin_emails
        linked = self._linked(ImportedEntity.USER, toggl_user.uid)
        existing = self._repositories.users.get(UserId(linked)) if linked else None
        existing = existing or self._repositories.users.get_by_email(email)
        if existing is not None:
            if not linked:
                self._link(ImportedEntity.USER, toggl_user.uid, existing.id)
            counts = self._report.users
            if wants_admin and existing.role is not Role.ADMIN:
                existing = self._users.update_user(
                    self._acting_admin(),
                    existing.id,
                    UserUpdate(existing.full_name, Role.ADMIN, existing.is_active),
                )
                counts.updated += 1
            elif linked:
                counts.unchanged += 1
            else:
                counts.linked += 1
            return existing

        new_user = NewUser(
            email=email,
            full_name=toggl_user.name or str(email),
            password=secrets.token_urlsafe(32),
            role=Role.ADMIN if wants_admin else Role.MEMBER,
        )
        user = (
            self._users.bootstrap_admin(new_user)
            if wants_admin
            else self._users.create_user(self._acting_admin(), new_user)
        )
        if toggl_user.inactive and not wants_admin:
            user = self._users.update_user(
                self._acting_admin(), user.id, UserUpdate(user.full_name, user.role, False)
            )
        self._link(ImportedEntity.USER, toggl_user.uid, user.id)
        self._report.users.created += 1
        return user

    def _acting_admin(self) -> User:
        candidates = [self._repositories.users.get_by_email(email) for email in self._admin_emails]
        candidates.extend(self._repositories.users.list_all())
        for user in candidates:
            if user is not None and user.role is Role.ADMIN and user.is_active:
                return user
        raise InvalidValueError("There is no active admin to run the import as")

    def _import_clients(self, snapshot: TogglSnapshot, actor: User) -> dict[int, ClientId]:
        clients: dict[int, ClientId] = {}
        for toggl_client in snapshot.clients:
            linked = self._linked(ImportedEntity.CLIENT, toggl_client.id)
            if linked:
                clients[toggl_client.id] = ClientId(linked)
                self._report.clients.unchanged += 1
                continue
            existing = self._repositories.clients.get_by_name(toggl_client.name.strip())
            if existing is not None:
                client_id = existing.id
                self._report.clients.linked += 1
            else:
                client_id = self._clients.create_client(
                    actor, ClientDraft(toggl_client.name, toggl_client.archived)
                ).id
                self._report.clients.created += 1
            self._link(ImportedEntity.CLIENT, toggl_client.id, client_id)
            clients[toggl_client.id] = client_id
        return clients

    def _import_projects(
        self, snapshot: TogglSnapshot, clients: dict[int, ClientId], actor: User
    ) -> dict[int, ProjectId]:
        existing_projects = self._repositories.projects.list_all(include_archived=True)
        projects: dict[int, ProjectId] = {}
        for toggl_project in snapshot.projects:
            linked = self._linked(ImportedEntity.PROJECT, toggl_project.id)
            if linked:
                projects[toggl_project.id] = ProjectId(linked)
                self._report.projects.unchanged += 1
                continue
            client_id = clients.get(toggl_project.client_id) if toggl_project.client_id else None
            name = toggl_project.name.strip()
            match = next(
                (
                    p
                    for p in existing_projects
                    if p.name.lower() == name.lower() and p.client_id == client_id
                ),
                None,
            )
            if match is not None:
                project_id = match.id
                self._report.projects.linked += 1
            else:
                project_id = self._projects.create_project(
                    actor,
                    ProjectDraft(
                        name,
                        self._color(toggl_project.color),
                        client_id,
                        bool(toggl_project.billable),
                    ),
                ).id
                self._report.projects.created += 1
            self._link(ImportedEntity.PROJECT, toggl_project.id, project_id)
            projects[toggl_project.id] = project_id
        return projects

    def _import_tags(self, snapshot: TogglSnapshot, actor: User) -> dict[int, TagId]:
        tags: dict[int, TagId] = {}
        for toggl_tag in snapshot.tags:
            linked = self._linked(ImportedEntity.TAG, toggl_tag.id)
            if linked:
                tags[toggl_tag.id] = TagId(linked)
                self._report.tags.unchanged += 1
                continue
            existing = self._repositories.tags.get_by_name(toggl_tag.name.strip())
            if existing is not None:
                tag_id = existing.id
                self._report.tags.linked += 1
            else:
                tag_id = self._tags.create_tag(actor, TagDraft(toggl_tag.name)).id
                self._report.tags.created += 1
            self._link(ImportedEntity.TAG, toggl_tag.id, tag_id)
            tags[toggl_tag.id] = tag_id
        return tags

    def _import_time_entries(
        self,
        toggl_entries: list[TogglTimeEntry],
        users: dict[int, User],
        projects: dict[int, ProjectId],
        tags: dict[int, TagId],
    ) -> None:
        counts = self._report.time_entries
        for toggl_entry in toggl_entries:
            owner = users.get(toggl_entry.user_id)
            if owner is None:
                self._skip_entry("owner is not a workspace member")
                continue
            if toggl_entry.stop is None:
                self._skip_entry("still running in Toggl")
                continue
            draft = self._draft(toggl_entry, projects, tags)
            linked = self._linked(ImportedEntity.TIME_ENTRY, toggl_entry.id)
            if linked:
                current = self._repositories.time_entries.get(TimeEntryId(linked))
                if current is None or current.is_deleted:
                    self._skip_entry("deleted in Eidos Tempo after an earlier import")
                    continue
                if (
                    current.description,
                    current.project_id,
                    current.is_billable,
                    set(current.tag_ids),
                    current.start,
                    current.stop,
                ) == (
                    draft.description,
                    draft.project_id,
                    draft.is_billable,
                    set(draft.tag_ids),
                    draft.start,
                    draft.stop,
                ):
                    counts.unchanged += 1
                else:
                    self._entries.update_entry(owner, current.id, draft)
                    counts.updated += 1
            else:
                entry = self._entries.create_entry(owner, draft)
                self._link(ImportedEntity.TIME_ENTRY, toggl_entry.id, entry.id)
                counts.created += 1
            duration = toggl_entry.stop - toggl_entry.start
            self._report.hours_by_year[toggl_entry.start.year] += duration / timedelta(
                seconds=SECONDS_PER_HOUR
            )

    def _draft(
        self,
        toggl_entry: TogglTimeEntry,
        projects: dict[int, ProjectId],
        tags: dict[int, TagId],
    ) -> TimeEntryDraft:
        description = toggl_entry.description.strip()
        if len(description) > MAX_DESCRIPTION_LENGTH:
            self._report.warnings["description shortened to 500 characters"] += 1
            description = description[:MAX_DESCRIPTION_LENGTH].rstrip()
        project_id = projects.get(toggl_entry.project_id) if toggl_entry.project_id else None
        if toggl_entry.project_id and project_id is None:
            self._report.warnings["project no longer exists in Toggl; imported without one"] += 1
        tag_ids = tuple(tags[tag_id] for tag_id in toggl_entry.tag_ids if tag_id in tags)
        if len(tag_ids) != len(toggl_entry.tag_ids):
            self._report.warnings["tag no longer exists in Toggl; dropped"] += 1
        return TimeEntryDraft(
            description=description,
            project_id=project_id,
            start=toggl_entry.start,
            stop=toggl_entry.stop,
            is_billable=toggl_entry.billable,
            tag_ids=tag_ids,
        )

    def _archive_inactive_projects(
        self, snapshot: TogglSnapshot, projects: dict[int, ProjectId], actor: User
    ) -> None:
        for toggl_project in snapshot.projects:
            if toggl_project.active:
                continue
            project = self._repositories.projects.get(projects[toggl_project.id])
            if project is None or project.is_archived:
                continue
            self._projects.update_project(
                actor,
                project.id,
                ProjectDraft(
                    project.name, project.color, project.client_id, project.is_billable, True
                ),
            )

    def _skip_entry(self, reason: str) -> None:
        self._report.time_entries.skipped += 1
        self._report.warnings[f"time entry skipped: {reason}"] += 1

    def _color(self, color: str) -> HexColor:
        try:
            return HexColor(color)
        except InvalidValueError:
            self._report.warnings["project color is not a hex color; used the default"] += 1
            return FALLBACK_COLOR

    def _linked(self, entity: ImportedEntity, external_id: int) -> UUID | None:
        link = self._repositories.import_links.find(SOURCE, entity, str(external_id))
        return link.internal_id if link else None

    def _link(self, entity: ImportedEntity, external_id: int, internal_id: UUID) -> None:
        self._repositories.import_links.add(
            ImportLink(
                source=SOURCE, entity=entity, external_id=str(external_id), internal_id=internal_id
            )
        )
