from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "GraphNotes"
    environment: str = "development"
    database_url: str = (
        "postgresql+asyncpg://graphnotes:change-me@localhost:5432/graphnotes"
    )
    session_cookie_name: str = "graphnotes_session"
    session_ttl_hours: int = 168
    cookie_secure: bool = True

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_prefix="GRAPHNOTES_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
