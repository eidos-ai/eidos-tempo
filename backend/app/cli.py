import argparse
import getpass
import logging

from app.auth.passwords import Argon2PasswordHasher
from app.config import get_settings
from app.db.session import create_session_factory
from app.domain.clock import SystemClock
from app.domain.users import Role
from app.domain.value_objects import EmailAddress
from app.durability.runtime import build_durability
from app.logging_config import configure_logging
from app.repositories.protocols import Repositories
from app.repositories.sql import build_sql_repositories
from app.services.users import NewUser, UserService

logger = logging.getLogger(__name__)


def ask_password(email: str) -> str:
    password = getpass.getpass(f"Password for {email}: ")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords do not match")
    return password


def user_service(repositories: Repositories) -> UserService:
    return UserService(
        users=repositories.users,
        sessions=repositories.sessions,
        api_tokens=repositories.api_tokens,
        hasher=Argon2PasswordHasher(),
        clock=SystemClock(),
    )


def create_admin(email: str, full_name: str) -> None:
    password = ask_password(email)
    session_factory = create_session_factory(get_settings().database_url)
    with session_factory.begin() as session:
        user_service(build_sql_repositories(session)).bootstrap_admin(
            NewUser(
                email=EmailAddress(email), full_name=full_name, password=password, role=Role.ADMIN
            )
        )


def ensure_admin(email: str) -> None:
    """Promote an existing user (e.g. imported from Toggl) or create a new admin."""
    address = EmailAddress(email)
    session_factory = create_session_factory(get_settings().database_url)
    with session_factory.begin() as session:
        repositories = build_sql_repositories(session)
        exists = repositories.users.get_by_email(address) is not None
        full_name = "" if exists else input(f"Full name for {email}: ")
        password = ask_password(email)
        service = user_service(repositories)
        if exists:
            service.promote_to_admin(address, password)
        else:
            service.bootstrap_admin(NewUser(address, full_name, password, Role.ADMIN))


def run_backup() -> None:
    backups = build_durability(get_settings()).backups
    if backups is None:
        raise SystemExit("Backups need TEMPO_DURABLE_WRITES=true")
    result = backups.run()
    logger.info("Backup done: %s", result.dump_object)


def main() -> None:
    configure_logging(get_settings().log_level)
    parser = argparse.ArgumentParser(prog="tempo")
    commands = parser.add_subparsers(dest="command", required=True)
    admin_parser = commands.add_parser("create-admin", help="Create an admin user")
    admin_parser.add_argument("--email", required=True)
    admin_parser.add_argument("--name", required=True)
    ensure_parser = commands.add_parser(
        "ensure-admin", help="Make a user admin and set their password, creating them if needed"
    )
    ensure_parser.add_argument("--email", required=True)
    commands.add_parser("backup", help="Push a base backup and a pg_dump to the bucket now")
    args = parser.parse_args()

    if args.command == "create-admin":
        create_admin(args.email, args.name)
    elif args.command == "ensure-admin":
        ensure_admin(args.email)
    elif args.command == "backup":
        run_backup()


if __name__ == "__main__":
    main()
