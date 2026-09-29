from typing import Protocol

from argon2 import PasswordHasher as Argon2Hasher
from argon2.exceptions import InvalidHashError, VerificationError


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...
    def verify(self, password_hash: str, password: str) -> bool: ...
    def verify_dummy(self, password: str) -> None: ...


class Argon2PasswordHasher:
    def __init__(self) -> None:
        self._hasher = Argon2Hasher()
        self._dummy_hash: str | None = None

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._hasher.verify(password_hash, password)
        except (VerificationError, InvalidHashError):
            return False

    def verify_dummy(self, password: str) -> None:
        if self._dummy_hash is None:
            self._dummy_hash = self._hasher.hash("dummy-password-for-constant-time-login")
        self.verify(self._dummy_hash, password)
