import re
from dataclasses import dataclass
from datetime import datetime

from app.domain.errors import InvalidValueError

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-F]{6}$")


@dataclass(frozen=True)
class EmailAddress:
    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().lower()
        if not EMAIL_PATTERN.fullmatch(normalized):
            raise InvalidValueError(f"Invalid email address: {self.value!r}")
        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class HexColor:
    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().upper()
        if not HEX_COLOR_PATTERN.fullmatch(normalized):
            raise InvalidValueError(f"Invalid hex color: {self.value!r}")
        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class DateRange:
    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise InvalidValueError("Date range bounds must be timezone-aware")
        if self.end <= self.start:
            raise InvalidValueError("Date range end must be after its start")


def require_text(value: str, field_name: str, max_length: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise InvalidValueError(f"{field_name} cannot be empty")
    if len(cleaned) > max_length:
        raise InvalidValueError(f"{field_name} cannot exceed {max_length} characters")
    return cleaned
