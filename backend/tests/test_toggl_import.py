from datetime import UTC, datetime, timedelta

import pytest

from app.domain.users import Role, User
from app.domain.value_objects import DateRange, EmailAddress
from app.importers.toggl import TogglImporter
from app.importers.toggl_api import (
    TogglClient,
    TogglProject,
    TogglSnapshot,
    TogglTag,
    TogglTimeEntry,
    TogglUser,
)
from app.repositories.protocols import Repositories
from tests.fakes import FakeClock, FakePasswordHasher

OWNER_EMAIL = EmailAddress("owner@eidos.ai")
DEV_EMAIL = EmailAddress("dev@eidos.ai")
START = datetime(2024, 3, 4, 9, 0, tzinfo=UTC)


def entry(
    entry_id: int, user_id: int, project_id: int | None, hours: float, description: str = "Work"
) -> TogglTimeEntry:
    start = START + timedelta(days=entry_id)
    return TogglTimeEntry(
        id=entry_id,
        user_id=user_id,
        description=description,
        project_id=project_id,
        billable=project_id == 20,
        tag_ids=[30] if project_id == 20 else [],
        start=start,
        stop=start + timedelta(hours=hours),
    )


def snapshot(entries: list[TogglTimeEntry]) -> TogglSnapshot:
    return TogglSnapshot(
        users=[
            TogglUser(uid=1, email="dev@eidos.ai", name="Dev", inactive=False),
            TogglUser(uid=2, email="former@eidos.ai", name="Former", inactive=True),
            TogglUser(uid=3, email="owner@eidos.ai", name="Owner", inactive=False),
        ],
        clients=[TogglClient(id=10, name="Acme")],
        projects=[
            TogglProject(id=20, name="Vision", client_id=10, billable=True, color="#9e5bd9"),
            TogglProject(id=21, name="Legacy", active=False, color="not-a-color"),
        ],
        tags=[TogglTag(id=30, name="research")],
        time_entries=entries,
    )


def make_importer(repositories: Repositories, admins: list[EmailAddress]) -> TogglImporter:
    return TogglImporter(repositories, FakePasswordHasher(), FakeClock(), admins)


def user_by_email(repositories: Repositories, email: str) -> User:
    user = repositories.users.get_by_email(EmailAddress(email))
    assert user is not None
    return user


def all_entries(repositories: Repositories, user: User) -> list[object]:
    period = DateRange(START - timedelta(days=1), START + timedelta(days=30))
    return list(repositories.time_entries.list_overlapping(user.id, period))


def test_import_creates_accounts_projects_tags_and_entries(repositories: Repositories) -> None:
    running = entry(4, 1, None, 1).model_copy(update={"stop": None})
    report = make_importer(repositories, [OWNER_EMAIL, DEV_EMAIL]).run(
        snapshot([entry(1, 1, 20, 2), entry(2, 2, 21, 1.5), entry(3, 9, None, 1), running])
    )

    dev, former, owner = (
        user_by_email(repositories, f"{name}@eidos.ai") for name in ("dev", "former", "owner")
    )
    assert (dev.role, owner.role, former.role) == (Role.ADMIN, Role.ADMIN, Role.MEMBER)
    assert dev.is_active and owner.is_active and not former.is_active

    projects = {p.name: p for p in repositories.projects.list_all(include_archived=True)}
    assert projects["Vision"].is_billable and not projects["Vision"].is_archived
    assert projects["Legacy"].is_archived

    [imported] = repositories.time_entries.list_overlapping(
        dev.id, DateRange(START, START + timedelta(days=3))
    )
    tag = repositories.tags.get_by_name("research")
    assert tag is not None
    assert imported.project_id == projects["Vision"].id
    assert imported.is_billable and imported.tag_ids == (tag.id,)

    assert report.time_entries.created == 2
    assert report.time_entries.skipped == 2
    assert report.hours_by_year[2024] == pytest.approx(3.5)


def test_rerun_updates_changed_entries_without_duplicates(repositories: Repositories) -> None:
    make_importer(repositories, [OWNER_EMAIL]).run(
        snapshot([entry(1, 1, 20, 2), entry(2, 1, None, 1)])
    )

    report = make_importer(repositories, [OWNER_EMAIL]).run(
        snapshot([entry(1, 1, 20, 2, description="Renamed"), entry(2, 1, None, 1)])
    )

    dev = user_by_email(repositories, "dev@eidos.ai")
    assert len(all_entries(repositories, dev)) == 2
    assert (report.time_entries.created, report.time_entries.updated) == (0, 1)
    assert report.time_entries.unchanged == 1
    assert report.users.created == 0 and report.projects.created == 0


def test_existing_account_is_reused_and_promoted(
    repositories: Repositories, admin: User, member: User
) -> None:
    report = make_importer(repositories, [OWNER_EMAIL, EmailAddress(member.email.value)]).run(
        snapshot([]).model_copy(
            update={
                "users": [TogglUser(uid=1, email=member.email.value, name="Member", inactive=False)]
            }
        )
    )

    promoted = user_by_email(repositories, member.email.value)
    assert promoted.id == member.id and promoted.role is Role.ADMIN
    assert report.users.created == 0
