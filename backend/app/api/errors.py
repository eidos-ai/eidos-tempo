import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.background import BackgroundTask

from app.domain.errors import (
    AuthenticationError,
    ConflictError,
    DomainError,
    InvalidValueError,
    NotFoundError,
    PermissionDeniedError,
)
from app.durability.errors import DurabilityError, LeaseLostError
from app.durability.runtime import Durability

logger = logging.getLogger(__name__)

STATUS_BY_ERROR: tuple[tuple[type[DomainError], int], ...] = (
    (NotFoundError, status.HTTP_404_NOT_FOUND),
    (PermissionDeniedError, status.HTTP_403_FORBIDDEN),
    (AuthenticationError, status.HTTP_401_UNAUTHORIZED),
    (ConflictError, status.HTTP_409_CONFLICT),
    (InvalidValueError, status.HTTP_422_UNPROCESSABLE_CONTENT),
)


def domain_error_status(error: DomainError) -> int:
    for error_type, status_code in STATUS_BY_ERROR:
        if isinstance(error, error_type):
            return status_code
    return status.HTTP_400_BAD_REQUEST


async def handle_domain_error(request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, DomainError)
    return JSONResponse(status_code=domain_error_status(error), content={"detail": str(error)})


async def handle_integrity_error(request: Request, error: Exception) -> JSONResponse:
    logger.warning("Integrity error on %s %s: %s", request.method, request.url.path, error)
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "The change conflicts with existing data"},
    )


async def handle_durability_error(request: Request, error: Exception) -> JSONResponse:
    logger.error("Not confirmed on %s %s: %s", request.method, request.url.path, error)
    durability: Durability = request.app.state.durability
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "The server could not confirm the change was saved. Try again shortly."},
        background=(
            BackgroundTask(durability.on_lease_lost) if isinstance(error, LeaseLostError) else None
        ),
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, handle_domain_error)
    app.add_exception_handler(DurabilityError, handle_durability_error)
    app.add_exception_handler(IntegrityError, handle_integrity_error)
