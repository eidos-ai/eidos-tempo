import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.domain.errors import (
    AuthenticationError,
    ConflictError,
    DomainError,
    InvalidValueError,
    NotFoundError,
    PermissionDeniedError,
)

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


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, handle_domain_error)
    app.add_exception_handler(IntegrityError, handle_integrity_error)
