from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_PUBLIC_BASE_URL = "https://rhizome.vsepsy.ru"


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
    ingest_max_files: int = 10_000
    ingest_max_path_depth: int = 8
    ingest_max_path_length: int = 180
    take_max_paths: int = 50
    index_max_notes: int = 5000
    graph_page_limit: int = 50
    graph_page_max: int = 200
    graph_diff_timeout_seconds: float = 30.0
    graph_diff_cache_max: int = 20
    personal_sync_interval_seconds: int = 300
    integration_markdown_max_bytes: int = 1_048_576
    integration_attachment_max_bytes: int = 26_214_400
    integration_batch_max_operations: int = 500
    integration_batch_max_bytes: int = 104_857_600
    integration_manifest_page_max: int = 200
    integration_personal_quota_bytes: int = 524_288_000
    integration_token_default_days: int = 30
    integration_token_max_days: int = 90
    integration_plan_ttl_hours: int = 24
    integration_result_ttl_days: int = 30
    integration_rate_limit_per_minute: int = 120
    # Working-DB hygiene: keep ~6 months; never more than ~1 year here.
    # A separate logs database is later architecture, not this wave.
    integration_access_retention_days: int = 183
    integration_access_retention_max_days: int = 366
    integration_access_debounce_seconds: int = 3600
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    smtp_timeout_seconds: float = 15.0
    public_base_url: str = DEFAULT_PUBLIC_BASE_URL
    mail_code_ttl_minutes: int = 30
    mail_resend_cooldown_seconds: int = 60
    invite_ttl_days: int = 7
    invite_resend_cooldown_seconds: int = 60
    invite_max_per_hour: int = 10
    invite_max_pending: int = 20
    telegram_bot_token: str = ""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_prefix="GRAPHNOTES_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
