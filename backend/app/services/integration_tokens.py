from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.integration import IntegrationToken
from app.models.user import User
from app.services.audit import record_audit_event
from app.services.integration_errors import IntegrationError

ALLOWED_SCOPES = ("personal:read", "personal:write", "personal:delete")
TOKEN_PREFIX = "gnp_"


def hash_integration_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def validate_scopes(scopes: list[str]) -> list[str]:
    cleaned = list(dict.fromkeys(item.strip() for item in scopes if item.strip()))
    if not cleaned:
        raise IntegrationError(
            400,
            "invalid_request",
            "укажите хотя бы одно право токена",
        )
    unknown = [item for item in cleaned if item not in ALLOWED_SCOPES]
    if unknown:
        raise IntegrationError(
            400,
            "invalid_request",
            "неизвестные права токена",
            details=[{"scope": item} for item in unknown],
        )
    if "personal:read" not in cleaned:
        raise IntegrationError(
            400,
            "invalid_request",
            "токену нужен scope personal:read",
        )
    return cleaned


def resolve_expiry(expires_at: datetime | None) -> datetime:
    now = datetime.now(UTC)
    maximum = now + timedelta(days=settings.integration_token_max_days)
    if expires_at is None:
        return now + timedelta(days=settings.integration_token_default_days)
    stamp = _aware(expires_at)
    if stamp <= now:
        raise IntegrationError(400, "invalid_request", "срок токена должен быть в будущем")
    if stamp > maximum:
        raise IntegrationError(
            400,
            "invalid_request",
            f"срок токена не больше {settings.integration_token_max_days} дней",
        )
    return stamp


def mint_token_secret() -> str:
    """High-entropy bearer secret. Server stores SHA-256 only (TZ 2.70)."""
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


async def create_integration_token(
    database: AsyncSession,
    *,
    user: User,
    name: str,
    scopes: list[str],
    expires_at: datetime | None,
) -> tuple[IntegrationToken, str]:
    cleaned_name = name.strip()
    if not cleaned_name:
        raise IntegrationError(400, "invalid_request", "нужно имя токена")
    if len(cleaned_name) > 80:
        raise IntegrationError(400, "invalid_request", "имя токена слишком длинное")
    cleaned_scopes = validate_scopes(scopes)
    expiry = resolve_expiry(expires_at)
    secret = mint_token_secret()
    row = IntegrationToken(
        user_id=user.id,
        name=cleaned_name,
        token_hash=hash_integration_token(secret),
        token_prefix=secret[:12],
        scopes=cleaned_scopes,
        expires_at=expiry,
    )
    database.add(row)
    await database.flush()
    record_audit_event(
        database,
        action="integration.token_created",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"token_id": str(row.id), "scopes": cleaned_scopes, "name": cleaned_name},
    )
    await database.commit()
    await database.refresh(row)
    return row, secret


async def list_integration_tokens(
    database: AsyncSession, *, user: User
) -> list[IntegrationToken]:
    result = await database.scalars(
        select(IntegrationToken)
        .where(IntegrationToken.user_id == user.id)
        .order_by(IntegrationToken.created_at.desc())
    )
    return list(result.all())


async def revoke_integration_token(
    database: AsyncSession, *, user: User, token_id: object
) -> None:
    row = await database.scalar(
        select(IntegrationToken).where(
            IntegrationToken.id == token_id,
            IntegrationToken.user_id == user.id,
        )
    )
    if row is None:
        raise IntegrationError(404, "not_found", "токен не найден")
    if row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        record_audit_event(
            database,
            action="integration.token_revoked",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={"token_id": str(row.id)},
        )
        await database.commit()


async def authenticate_integration_token(
    database: AsyncSession, bearer: str | None
) -> tuple[User, IntegrationToken]:
    if not bearer or not bearer.startswith("Bearer "):
        raise IntegrationError(401, "invalid_token", "нужен заголовок Authorization: Bearer")
    secret = bearer[7:].strip()
    if not secret:
        raise IntegrationError(401, "invalid_token", "токен пустой")
    row = await database.scalar(
        select(IntegrationToken).where(
            IntegrationToken.token_hash == hash_integration_token(secret)
        )
    )
    if row is None:
        raise IntegrationError(401, "invalid_token", "токен недействителен")
    now = datetime.now(UTC)
    if row.revoked_at is not None:
        raise IntegrationError(401, "invalid_token", "токен отозван")
    if _aware(row.expires_at) <= now:
        raise IntegrationError(401, "token_expired", "срок токена истёк")
    user = await database.get(User, row.user_id)
    if user is None or not user.is_active:
        raise IntegrationError(401, "invalid_token", "токен недействителен")
    row.last_used_at = now
    await database.commit()
    await database.refresh(row)
    await database.refresh(user)
    return user, row


def require_scopes(token: IntegrationToken, *needed: str) -> None:
    have = set(token.scopes or [])
    missing = [item for item in needed if item not in have]
    if missing:
        raise IntegrationError(
            403,
            "insufficient_scope",
            "недостаточно прав токена",
            details=[{"scope": item} for item in missing],
        )
