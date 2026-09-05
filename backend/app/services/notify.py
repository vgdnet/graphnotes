import json
import urllib.error
import urllib.request

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.models.user import User, UserRole
from app.services.audit import record_audit_event
from app.services.mail import (
    MailDeliveryError,
    MailNotConfiguredError,
    queue_notify_mail,
    send_plaintext_mail,
    smtp_configured,
    telegram_configured,
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
    for recipient in recipients:
        if recipient.notify_queue_email and smtp_configured():
            subject, body = queue_notify_mail(
                recipient,
                author_name=author.display_name,
                summary=summary,
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
