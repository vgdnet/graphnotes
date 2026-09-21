import json
import urllib.error
import urllib.request

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.models.user import User, UserRole
from app.services.audit import record_audit_event
from app.services.installation import resolve_public_base_url
from app.services.mail import (
    MailDeliveryError,
    MailNotConfiguredError,
    card_change_mail,
    queue_notify_mail,
    send_plaintext_mail,
    smtp_configured,
    telegram_configured,
    white_noise_lock_mail,
)


class TelegramNotConfiguredError(RuntimeError):
    """Installation Telegram bot token is not set."""


class TelegramDeliveryError(RuntimeError):
    """Telegram accepted the request but delivery failed."""


def _telegram_chat_id(contact: str) -> str:
    value = contact.strip()
    if value.startswith("@"):
        return value
    if value.isdigit() or (value.startswith("-") and value[1:].isdigit()):
        return value
    return f"@{value}"


def send_telegram_message(*, chat_id: str, text: str) -> None:
    token = settings.telegram_bot_token.strip()
    if not token:
        raise TelegramNotConfiguredError("Telegram bot token is not configured")
    payload = json.dumps(
        {"chat_id": chat_id, "text": text},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status >= 400:
                raise TelegramDeliveryError(f"Telegram HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        raise TelegramDeliveryError(f"Telegram HTTP {exc.code}") from exc
    except OSError as exc:
        raise TelegramDeliveryError(str(exc)[:200] or "Telegram delivery failed") from exc


def queue_notify_telegram_text(*, author_name: str, summary: str) -> str:
    return (
        "Новые правки пришли по ризоме.\n"
        f"Автор: {author_name}\n"
        f"Предложение: {summary}"
    )


async def list_queue_subscribers(
    database: AsyncSession,
    *,
    exclude_user_id,
) -> list[User]:
    rows = (
        await database.scalars(
            select(User).where(
                User.is_active.is_(True),
                User.role.in_((UserRole.EDITOR.value, UserRole.ADMIN.value)),
                User.id != exclude_user_id,
            )
        )
    ).all()
    return [
        user
        for user in rows
        if user.notify_queue_email or user.notify_queue_telegram
    ]


async def notify_new_proposal(
    database: AsyncSession,
    *,
    author: User,
    summary: str,
    proposal_id: str,
) -> None:
    recipients = await list_queue_subscribers(database, exclude_user_id=author.id)
    if not recipients:
        return
    emailed = 0
    telegramed = 0
    failed = 0
    public_base = await resolve_public_base_url(database) if smtp_configured() else None
    for recipient in recipients:
        if recipient.notify_queue_email and smtp_configured():
            subject, body = queue_notify_mail(
                recipient,
                author_name=author.display_name,
                summary=summary,
                public_base_url=public_base,
            )
            try:
                await run_in_threadpool(
                    send_plaintext_mail,
                    to_address=recipient.email,
                    subject=subject,
                    body=body,
                )
                emailed += 1
            except (MailNotConfiguredError, MailDeliveryError):
                failed += 1
        if (
            recipient.notify_queue_telegram
            and telegram_configured()
            and recipient.telegram
        ):
            try:
                await run_in_threadpool(
                    send_telegram_message,
                    chat_id=_telegram_chat_id(recipient.telegram),
                    text=queue_notify_telegram_text(
                        author_name=author.display_name,
                        summary=summary,
                    ),
                )
                telegramed += 1
            except (TelegramNotConfiguredError, TelegramDeliveryError):
                failed += 1
    if emailed or telegramed or failed:
        record_audit_event(
            database,
            action="notify.queue_sent" if (emailed or telegramed) else "notify.queue_failed",
            actor_user_id=author.id,
            subject_username=author.username,
            details={
                "proposal_id": proposal_id,
                "emailed": emailed,
                "telegramed": telegramed,
                "failed": failed,
            },
        )


async def notify_card_changes(
    database: AsyncSession,
    *,
    user: User,
    paths: list[str],
) -> None:
    if not user.notify_card_changes or not paths:
        return
    emailed = 0
    telegramed = 0
    failed = 0
    public_base = await resolve_public_base_url(database) if smtp_configured() else None
    if smtp_configured():
        subject, body = card_change_mail(user, paths=paths, public_base_url=public_base)
        try:
            await run_in_threadpool(
                send_plaintext_mail,
                to_address=user.email,
                subject=subject,
                body=body,
            )
            emailed += 1
        except (MailNotConfiguredError, MailDeliveryError):
            failed += 1
    if telegram_configured() and user.telegram:
        try:
            await run_in_threadpool(
                send_telegram_message,
                chat_id=_telegram_chat_id(user.telegram),
                text=(
                    "В карточках, которые вы правили, появились новые правки.\n"
                    f"Карточки: {', '.join(paths[:8])}\n"
                    "Сверка: #/differ"
                ),
            )
            telegramed += 1
        except (TelegramNotConfiguredError, TelegramDeliveryError):
            failed += 1
    if emailed or telegramed or failed:
        record_audit_event(
            database,
            action="notify.card_changes_sent" if (emailed or telegramed) else "notify.card_changes_failed",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={"paths": paths, "emailed": emailed, "telegramed": telegramed, "failed": failed},
        )


async def list_admin_mail_recipients(
    database: AsyncSession,
    *,
    exclude_user_id=None,
) -> list[User]:
    """Active admins with a usable inbox (confirmed, or queue-notify on)."""
    rows = (
        await database.scalars(
            select(User).where(
                User.is_active.is_(True),
                User.role == UserRole.ADMIN.value,
            )
        )
    ).all()
    recipients: list[User] = []
    for user in rows:
        if exclude_user_id is not None and user.id == exclude_user_id:
            continue
        if not user.email or not user.email.strip():
            continue
        confirmed = user.email_verified_at is not None
        if confirmed or user.notify_queue_email:
            recipients.append(user)
    return recipients


async def notify_admins_white_noise(
    database: AsyncSession,
    *,
    username: str,
    locked_email: str,
    when: str,
    reasons: list[str],
    paths: list[str],
    locked: bool,
    exclude_user_id=None,
) -> None:
    if not smtp_configured():
        return
    recipients = await list_admin_mail_recipients(
        database, exclude_user_id=exclude_user_id
    )
    if not recipients:
        return
    public_base = await resolve_public_base_url(database)
    emailed = 0
    failed = 0
    for recipient in recipients:
        subject, body = white_noise_lock_mail(
            recipient,
            username=username,
            locked_email=locked_email,
            when=when,
            reasons=reasons,
            paths=paths,
            locked=locked,
            public_base_url=public_base,
        )
        try:
            await run_in_threadpool(
                send_plaintext_mail,
                to_address=recipient.email,
                subject=subject,
                body=body,
            )
            emailed += 1
        except (MailNotConfiguredError, MailDeliveryError):
            failed += 1
    if emailed or failed:
        record_audit_event(
            database,
            action="notify.white_noise_sent" if emailed else "notify.white_noise_failed",
            subject_username=username,
            details={"emailed": emailed, "failed": failed, "locked": locked},
        )
