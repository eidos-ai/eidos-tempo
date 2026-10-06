"""Import clients, projects, tags, members and time entries from Toggl Track.

Safe to run again: everything imported is linked to its Toggl id, so a second run updates
changed entries instead of duplicating them. Use --dry-run first; it rolls everything back.
"""

import argparse
import getpass
import logging
from datetime import date
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.auth.passwords import Argon2PasswordHasher
from app.config import get_settings
from app.db.session import create_session_factory
from app.domain.clock import SystemClock
from app.domain.users import Role
from app.domain.value_objects import EmailAddress
from app.importers.toggl import EntityCounts, ImportReport, TogglImporter
from app.importers.toggl_api import TogglApi, TogglSnapshot
from app.logging_config import configure_logging
from app.repositories.protocols import Repositories
from app.repositories.sql import build_sql_repositories
from app.services.users import UserService

logger = logging.getLogger(__name__)

DEFAULT_SINCE = date(2022, 1, 1)


class TogglSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TEMPO_", extra="ignore")

    toggl_api_token: SecretStr
    toggl_workspace_id: int


def load_snapshot(since: date, cache: Path | None) -> TogglSnapshot:
    if cache is not None and cache.exists():
        logger.info("Using cached Toggl data from %s", cache)
        return TogglSnapshot.model_validate_json(cache.read_text())
    settings = TogglSettings()
    api = TogglApi(settings.toggl_api_token.get_secret_value(), settings.toggl_workspace_id)
    snapshot = api.fetch_snapshot(since, date.today())
    if cache is not None:
        cache.write_text(snapshot.model_dump_json())
        logger.info("Saved Toggl data to %s (contains personal data; keep it out of git)", cache)
    return snapshot


def set_password(repositories: Repositories, email: EmailAddress, password: str) -> None:
    hasher = Argon2PasswordHasher()
    users = UserService(
        repositories.users,
        repositories.sessions,
        repositories.api_tokens,
        hasher,
        SystemClock(),
    )
    target = repositories.users.get_by_email(email)
    if target is None:
        raise SystemExit(f"--set-password: no user with email {email}")
    actor = next(u for u in repositories.users.list_all() if u.role is Role.ADMIN and u.is_active)
    users.reset_password(actor, target.id, password)


def log_report(report: ImportReport) -> None:
    def describe(counts: EntityCounts) -> str:
        return (
            f"{counts.created} created, {counts.linked} matched to existing, "
            f"{counts.updated} updated, {counts.unchanged} unchanged, {counts.skipped} skipped"
        )

    for name in ("users", "clients", "projects", "tags", "time_entries"):
        logger.info("%-12s %s", name, describe(getattr(report, name)))
    for year, hours in sorted(report.hours_by_year.items()):
        logger.info("Hours in %d: %.1f", year, hours)
    for warning, count in report.warnings.most_common():
        logger.warning("%s (%d)", warning, count)


def main() -> None:
    configure_logging(get_settings().log_level)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--admin", action="append", required=True, help="Email to make admin; repeatable"
    )
    parser.add_argument(
        "--since", type=date.fromisoformat, default=DEFAULT_SINCE, help="YYYY-MM-DD"
    )
    parser.add_argument("--dry-run", action="store_true", help="Run everything, then roll back")
    parser.add_argument("--cache", type=Path, help="Save Toggl data here, or reuse it if it exists")
    parser.add_argument("--set-password", metavar="EMAIL", help="Set this imported user's password")
    args = parser.parse_args()

    password = None
    if args.set_password and not args.dry_run:
        password = getpass.getpass(f"New password for {args.set_password}: ")
        if password != getpass.getpass("Repeat password: "):
            raise SystemExit("Passwords do not match")

    snapshot = load_snapshot(args.since, args.cache)
    logger.info(
        "Toggl data: %d users, %d clients, %d projects, %d tags, %d time entries",
        len(snapshot.users),
        len(snapshot.clients),
        len(snapshot.projects),
        len(snapshot.tags),
        len(snapshot.time_entries),
    )

    session_factory = create_session_factory(get_settings().database_url)
    with session_factory() as session:
        repositories = build_sql_repositories(session)
        importer = TogglImporter(
            repositories,
            Argon2PasswordHasher(),
            SystemClock(),
            [EmailAddress(email) for email in args.admin],
        )
        report = importer.run(snapshot)
        if password is not None:
            set_password(repositories, EmailAddress(args.set_password), password)
        log_report(report)
        if args.dry_run:
            session.rollback()
            logger.info("Dry run: nothing was saved")
        else:
            session.commit()
            logger.info("Import saved")


if __name__ == "__main__":
    main()
