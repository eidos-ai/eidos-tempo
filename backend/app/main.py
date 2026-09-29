from fastapi import APIRouter, FastAPI

from app.api.errors import register_error_handlers
from app.api.routes import auth, clients, me, projects, time_entries, users
from app.config import Settings, get_settings
from app.db.session import create_session_factory
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
    register_error_handlers(app)

    api = APIRouter(prefix="/api")
    for module in (auth, me, users, clients, projects, time_entries):
        api.include_router(module.router)
    api.add_api_route("/health", health, methods=["GET"], tags=["health"])
    app.include_router(api)
    return app


def health() -> dict[str, str]:
    return {"status": "ok"}
