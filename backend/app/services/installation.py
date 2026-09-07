from datetime import UTC, datetime
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import DEFAULT_PUBLIC_BASE_URL, settings
from app.models.installation import InstallationSetting

PUBLIC_BASE_URL_KEY = "public_base_url"
START_CARD_PATH_KEY = "start_card_path"


def normalize_start_card_path(value: str | None) -> str:
    raw = (value or "").strip().lstrip("/")
    if raw.startswith("#/card/"):
        raw = raw[len("#/card/") :]
    if raw.startswith("#/card"):
        raw = raw[len("#/card") :].lstrip("/")
    return raw[:300]


def normalize_public_base_url(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return DEFAULT_PUBLIC_BASE_URL
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("public site URL must be an absolute http(s) origin")
    path = parsed.path.rstrip("/")
    if path == "/":
        path = ""
    return f"{parsed.scheme}://{parsed.netloc}{path}"


async def resolve_public_base_url(database: AsyncSession) -> str:
    row = await database.get(InstallationSetting, PUBLIC_BASE_URL_KEY)
    if row is not None and row.value.strip():
        try:
            return normalize_public_base_url(row.value)
        except ValueError:
            pass
    try:
        return normalize_public_base_url(settings.public_base_url)
    except ValueError:
        return DEFAULT_PUBLIC_BASE_URL


async def save_public_base_url(database: AsyncSession, value: str) -> str:
    normalized = normalize_public_base_url(value)
    row = await database.get(InstallationSetting, PUBLIC_BASE_URL_KEY)
    now = datetime.now(UTC)
    if row is None:
        database.add(
            InstallationSetting(
                key=PUBLIC_BASE_URL_KEY,
                value=normalized,
                updated_at=now,
            )
        )
    else:
        row.value = normalized
        row.updated_at = now
    return normalized


async def resolve_start_card_path(database: AsyncSession) -> str:
    row = await database.get(InstallationSetting, START_CARD_PATH_KEY)
    if row is None:
        return ""
    return normalize_start_card_path(row.value)


async def save_start_card_path(database: AsyncSession, value: str | None) -> str:
    normalized = normalize_start_card_path(value)
    row = await database.get(InstallationSetting, START_CARD_PATH_KEY)
    now = datetime.now(UTC)
    if not normalized:
        if row is not None:
            await database.delete(row)
        return ""
    if row is None:
        database.add(
            InstallationSetting(
                key=START_CARD_PATH_KEY,
                value=normalized,
                updated_at=now,
            )
        )
    else:
        row.value = normalized
        row.updated_at = now
    return normalized
