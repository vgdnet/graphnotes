from datetime import UTC, datetime
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import DEFAULT_PUBLIC_BASE_URL, settings
from app.models.installation import InstallationSetting

PUBLIC_BASE_URL_KEY = "public_base_url"


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
