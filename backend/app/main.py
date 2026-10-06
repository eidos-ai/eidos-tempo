from fastapi import APIRouter, FastAPI

from app.api.errors import register_error_handlers
from app.api.routes import (
    auth,
    clients,
    internal,
    me,
    projects,
    reports,
    tags,
    time_entries,
    toggl,
    users,
)
from app.auth.google_oidc import GoogleIdTokenVerifier
from app.config import Settings, get_settings
from app.db.session import create_session_factory
from app.durability.runtime import build_durability
from app.logging_config import configure_logging


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Eidos Tempo",
        docs_url="/api/docs" if settings.enable_api_docs else None,
        openapi_url="/api/openapi.json" if settings.enable_api_docs else None,
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.session_factory = create_session_factory(settings.database_url)
    app.state.durability = build_durability(settings)
    app.state.backup_caller_verifier = (
        GoogleIdTokenVerifier(settings.backup_audience, settings.backup_caller_email)
        if settings.backup_audience and settings.backup_caller_email
        else None
    )
    register_error_handlers(app)

    api = APIRouter(prefix="/api")
    for module in (
        auth,
        me,
        users,
        clients,
        projects,
        tags,
        time_entries,
        reports,
        toggl,
        internal,
    ):
        api.include_router(module.router)
    api.add_api_route("/health", health, methods=["GET"], tags=["health"])
    app.include_router(api)
    return app


def health() -> dict[str, str]:
    return {"status": "ok"}
