import argparse
import getpass
import logging

from app.auth.passwords import Argon2PasswordHasher
from app.config import get_settings
from app.db.session import create_session_factory
from app.domain.clock import SystemClock
from app.domain.users import Role
from app.domain.value_objects import EmailAddress
from app.logging_config import configure_logging
from app.repositories.sql import build_sql_repositories
from app.services.users import NewUser, UserService

logger = logging.getLogger(__name__)


def create_admin(email: str, full_name: str) -> None:
    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords do not match")

    session_factory = create_session_factory(get_settings().database_url)
    with session_factory.begin() as session:
        repositories = build_sql_repositories(session)
        service = UserService(
            users=repositories.users,
            sessions=repositories.sessions,
            hasher=Argon2PasswordHasher(),
            clock=SystemClock(),
        )
        service.bootstrap_admin(
            NewUser(
                email=EmailAddress(email), full_name=full_name, password=password, role=Role.ADMIN
            )
        )


def main() -> None:
    configure_logging(get_settings().log_level)
    parser = argparse.ArgumentParser(prog="tempo")
    commands = parser.add_subparsers(dest="command", required=True)
    admin_parser = commands.add_parser("create-admin", help="Create an admin user")
    admin_parser.add_argument("--email", required=True)
    admin_parser.add_argument("--name", required=True)
    args = parser.parse_args()

    if args.command == "create-admin":
        create_admin(args.email, args.name)


if __name__ == "__main__":
    main()
