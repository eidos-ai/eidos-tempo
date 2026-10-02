"""Seed a local development database. Never run against production."""

import logging
from datetime import datetime, timedelta

from app.auth.passwords import Argon2PasswordHasher
from app.config import get_settings
from app.db.session import create_session_factory
from app.domain.clock import SystemClock
from app.domain.ids import ProjectId
from app.domain.users import Role, User
from app.domain.value_objects import EmailAddress, HexColor
from app.logging_config import configure_logging
from app.repositories.sql import build_sql_repositories
from app.services.clients import ClientDraft, ClientService
from app.services.projects import ProjectDraft, ProjectService
from app.services.time_entries import TimeEntryDraft, TimeEntryService
from app.services.users import NewUser, UserService

logger = logging.getLogger(__name__)

DEV_ADMIN_EMAIL = "admin@eidos.local"
DEV_ADMIN_PASSWORD = "tempo-dev-admin"
DEV_MEMBER_EMAIL = "member@eidos.local"
DEV_MEMBER_NAME = "Dev Member"
DEV_MEMBER_PASSWORD = "tempo-dev-member"

CLIENT_PROJECTS: tuple[tuple[str, tuple[tuple[str, str, bool], ...]], ...] = (
    ("BrainLogic", (("Vision Platform", "#7B4DE7", True),)),
    ("PhotoShelter", (("Image Tagging", "#3F8F87", True), ("Search Relevance", "#2F6FDB", True))),
    ("Eidos", (("Internal", "#B9737C", False), ("Hiring", "#B8925F", False))),
)


def seed() -> None:
    clock = SystemClock()
    session_factory = create_session_factory(get_settings().database_url)
    with session_factory.begin() as session:
        repositories = build_sql_repositories(session)
        if repositories.users.get_by_email(EmailAddress(DEV_ADMIN_EMAIL)) is not None:
            logger.info("Dev data already seeded; nothing to do")
            return
        users = UserService(
            repositories.users, repositories.sessions, Argon2PasswordHasher(), clock
        )
        admin = users.bootstrap_admin(
            NewUser(EmailAddress(DEV_ADMIN_EMAIL), "Dev Admin", DEV_ADMIN_PASSWORD, Role.ADMIN)
        )
        users.create_user(
            admin,
            NewUser(
                EmailAddress(DEV_MEMBER_EMAIL), DEV_MEMBER_NAME, DEV_MEMBER_PASSWORD, Role.MEMBER
            ),
        )
        clients = ClientService(repositories.clients, clock)
        projects = ProjectService(repositories.projects, repositories.clients, clock)
        entries = TimeEntryService(
            repositories.time_entries, repositories.projects, repositories.tags, clock
        )

        project_ids: list[ProjectId] = []
        for client_name, client_projects in CLIENT_PROJECTS:
            client = clients.create_client(admin, ClientDraft(client_name))
            for name, color, billable in client_projects:
                project = projects.create_project(
                    admin, ProjectDraft(name, HexColor(color), client.id, billable)
                )
                project_ids.append(project.id)

        today = clock.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
        monday = today - timedelta(days=today.weekday())
        for day_offset in range(today.weekday()):
            day = monday + timedelta(days=day_offset)
            add_entry(entries, admin, day, 9, 12.5, "Model training", project_ids[0])
            add_entry(entries, admin, day, 13.5, 16, "Dataset review", project_ids[1])
            add_entry(entries, admin, day, 16, 17, "Team sync", project_ids[3])
        logger.info("Seeded dev data; admin login is %s", DEV_ADMIN_EMAIL)


def add_entry(
    service: TimeEntryService,
    actor: User,
    day: datetime,
    start_hour: float,
    stop_hour: float,
    description: str,
    project_id: ProjectId,
) -> None:
    service.create_entry(
        actor,
        TimeEntryDraft(
            description=description,
            project_id=project_id,
            start=day + timedelta(hours=start_hour),
            stop=day + timedelta(hours=stop_hour),
        ),
    )


if __name__ == "__main__":
    configure_logging("INFO")
    seed()
