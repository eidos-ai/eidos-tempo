import logging
from pathlib import Path
from typing import Protocol

from google.api_core.exceptions import GoogleAPIError
from google.cloud.storage import Bucket

from app.durability.errors import LeaseLostError, LeaseUnavailableError

logger = logging.getLogger(__name__)


class Lease(Protocol):
    def check(self) -> None: ...


class GcsLease:
    """The lease object's generation changes whenever another instance takes it over."""

    def __init__(self, bucket: Bucket, object_name: str, generation: int) -> None:
        self._bucket = bucket
        self._object_name = object_name
        self._generation = generation

    @classmethod
    def from_generation_file(cls, bucket: Bucket, object_name: str, path: Path) -> "GcsLease":
        generation = int(path.read_text().strip())
        logger.info("Holding the database lease at generation %d", generation)
        return cls(bucket, object_name, generation)

    def check(self) -> None:
        try:
            blob = self._bucket.get_blob(self._object_name)
        except GoogleAPIError as error:
            raise LeaseUnavailableError("Could not read the database lease") from error
        current = blob.generation if blob else None
        if current != self._generation:
            raise LeaseLostError(
                f"Another instance took the database lease (generation {current}, "
                f"this instance holds {self._generation})"
            )
