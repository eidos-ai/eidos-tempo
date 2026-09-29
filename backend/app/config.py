from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TEMPO_", extra="ignore")

    database_url: str
    session_ttl_days: int = 14
    session_cookie_name: str = "tempo_session"
    cookie_secure: bool = True
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
