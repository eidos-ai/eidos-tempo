from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TEMPO_", extra="ignore")

    database_url: str
    session_idle_days: int = 90
    session_cookie_name: str = "tempo_session"
    cookie_secure: bool = True
    log_level: str = "INFO"
    enable_api_docs: bool = False
    api_timezone: str = "America/Montevideo"

    # Cloud Run: every write is archived to the bucket before the response (app/durability/).
    durable_writes: bool = False
    bucket: str = ""
    backup_prefix: str = ""
    lease_object: str = "lease/owner"
    run_dir: str = "/run/tempo"
    pgdata: str = "/var/lib/postgresql/data/pgdata"
    archive_timeout_seconds: float = 90
    backup_audience: str = ""
    backup_caller_email: str = ""

    @model_validator(mode="after")
    def require_backup_location(self) -> "Settings":
        if self.durable_writes and not (self.bucket and self.backup_prefix):
            raise ValueError("TEMPO_DURABLE_WRITES needs TEMPO_BUCKET and TEMPO_BACKUP_PREFIX")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
