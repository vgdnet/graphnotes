import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.invite import Invite
from app.models.user import User
from app.services.mail import hash_mail_secret

CUTOVER_INVITER_USERNAME = "efimov"


class InviteError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


async def attribute_existing_accounts_to_efimov(database: AsyncSession) -> int:
    seed = await database.scalar(
        select(User).where(User.username == CUTOVER_INVITER_USERNAME)
    )
    if seed is None:
        return 0
    result = await database.execute(
        update(User)
        .where(
            User.id != seed.id,
            User.invited_by_id.is_(None),
        )
        .values(
            invited_by_id=seed.id,
            invited_at=func.coalesce(User.invited_at, User.created_at),
        )
    )
    return int(result.rowcount or 0)


async def list_pending_invites(database: AsyncSession, inviter: User) -> list[Invite]:
    now = datetime.now(UTC)
    rows = (
        await database.scalars(
            select(Invite)
            .where(
                Invite.inviter_id == inviter.id,
                Invite.used_at.is_(None),
                Invite.revoked_at.is_(None),
                Invite.expires_at > now,
            )
            .order_by(Invite.created_at.desc())
        )
    ).all()
    return list(rows)


async def preview_invite(database: AsyncSession, token: str) -> tuple[Invite, User]:
    invite = await _unused_invite(database, token)
    if invite is None:
        raise InviteError(404, "invite is invalid or expired")
    inviter = await database.get(User, invite.inviter_id)
    if inviter is None or not inviter.is_active:
        raise InviteError(404, "invite is invalid or expired")
    return invite, inviter


async def issue_invite(database: AsyncSession, inviter: User, email: str) -> tuple[Invite, str]:
    if not inviter.is_active:
        raise InviteError(403, "account is inactive")
    if inviter.email == email:
        raise InviteError(409, "cannot invite your own email")
    taken = await database.scalar(select(User.id).where(User.email == email))
    if taken is not None:
        raise InviteError(409, "email is already registered")

    now = datetime.now(UTC)
    pending_same = await database.scalar(
        select(Invite)
        .where(
            Invite.email == email,
            Invite.used_at.is_(None),
            Invite.revoked_at.is_(None),
            Invite.expires_at > now,
        )
        .order_by(Invite.created_at.desc())
    )
    if pending_same is not None and pending_same.inviter_id != inviter.id:
        raise InviteError(409, "email already has a pending invite")

    latest = await database.scalar(
        select(Invite)
        .where(Invite.inviter_id == inviter.id)
        .order_by(Invite.created_at.desc())
        .limit(1)
    )
    created_at = _aware(latest.created_at) if latest is not None else None
    cooldown = max(0, settings.invite_resend_cooldown_seconds)
    if created_at is not None and (now - created_at).total_seconds() < cooldown:
        raise InviteError(429, "invite rate limit exceeded")

    hour_ago = now - timedelta(hours=1)
    hour_count = int(
        await database.scalar(
            select(func.count())
            .select_from(Invite)
            .where(Invite.inviter_id == inviter.id, Invite.created_at > hour_ago)
        )
        or 0
    )
    if hour_count >= settings.invite_max_per_hour:
        raise InviteError(429, "invite rate limit exceeded")

    pending_count = int(
        await database.scalar(
            select(func.count())
            .select_from(Invite)
            .where(
                Invite.inviter_id == inviter.id,
                Invite.used_at.is_(None),
                Invite.revoked_at.is_(None),
                Invite.expires_at > now,
            )
        )
        or 0
    )
    if pending_same is None and pending_count >= settings.invite_max_pending:
        raise InviteError(429, "too many pending invites")

    if pending_same is not None:
        pending_same.revoked_at = now

    token = secrets.token_urlsafe(32)
    invite = Invite(
        inviter_id=inviter.id,
        email=email,
        token_hash=hash_mail_secret(token),
        expires_at=now + timedelta(days=settings.invite_ttl_days),
    )
    database.add(invite)
    await database.flush()
    return invite, token


async def revoke_invite(database: AsyncSession, inviter: User, invite_id) -> None:
    invite = await database.get(Invite, invite_id)
    if invite is None or invite.inviter_id != inviter.id:
        raise InviteError(404, "invite not found")
    if invite.used_at is not None:
        raise InviteError(409, "invite already used")
    if invite.revoked_at is None:
        invite.revoked_at = datetime.now(UTC)


async def consume_invite(database: AsyncSession, token: str) -> Invite:
    invite = await _unused_invite(database, token)
    if invite is None:
        raise InviteError(404, "invite is invalid or expired")
    inviter = await database.get(User, invite.inviter_id)
    if inviter is None or not inviter.is_active:
        raise InviteError(404, "invite is invalid or expired")
    taken = await database.scalar(select(User.id).where(User.email == invite.email))
    if taken is not None:
        raise InviteError(409, "email is already registered")
    invite.used_at = datetime.now(UTC)
    return invite


async def _unused_invite(database: AsyncSession, token: str) -> Invite | None:
    now = datetime.now(UTC)
    invite = await database.scalar(
        select(Invite).where(
            Invite.token_hash == hash_mail_secret(token),
            Invite.used_at.is_(None),
            Invite.revoked_at.is_(None),
            Invite.expires_at > now,
        )
    )
    return invite
