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
    github_app_id: str = ""
    github_app_installation_id: str = ""
    github_app_private_key_path: str = ".secrets/github-app.pem"
    github_shared_owner: str = "vgdnet"
    github_shared_name: str = "rhizome"
    github_webhook_secret: str = ""
    github_api_timeout_seconds: float = 10.0
    ingest_max_file_bytes: int = 262_144
    ingest_max_zip_bytes: int = 2_097_152
    ingest_max_unpacked_bytes: int = 8_388_608
    ingest_max_files: int = 100
    ingest_max_path_depth: int = 8
    ingest_max_path_length: int = 180
    take_max_paths: int = 50

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_prefix="GRAPHNOTES_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
