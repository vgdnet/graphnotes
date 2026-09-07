import hashlib
import secrets
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import DEFAULT_PUBLIC_BASE_URL, settings
from app.models.email_token import EmailToken
from app.models.user import User
from app.services.installation import normalize_public_base_url

CONFIRM_PURPOSE = "confirm"
LOGIN_PURPOSE = "login"
RESET_PURPOSE = "reset"


class MailNotConfiguredError(RuntimeError):
    """Installation SMTP is not configured."""


class MailDeliveryError(RuntimeError):
    """SMTP accepted the connection but sending failed."""


def smtp_configured() -> bool:
    return bool(settings.smtp_host.strip() and settings.smtp_from.strip())


def smtp_public_status(*, public_base_url: str | None = None) -> dict[str, object]:
    configured = smtp_configured()
    return {
        "configured": configured,
        "host": settings.smtp_host.strip() or None if configured else None,
        "port": settings.smtp_port if configured else None,
        "from_address": settings.smtp_from.strip() or None if configured else None,
        "use_tls": settings.smtp_use_tls if configured else None,
        "public_base_url": _public_base(public_base_url) or None,
    }


def telegram_configured() -> bool:
    return bool(settings.telegram_bot_token.strip())


def telegram_public_status() -> dict[str, object]:
    return {"configured": telegram_configured()}


def _smtp_error_text(exc: BaseException) -> str:
    text = str(exc).strip() or exc.__class__.__name__
    secret = settings.smtp_password.strip()
    if secret and secret in text:
        text = text.replace(secret, "[redacted]")
    return text[:300]


def send_plaintext_mail(*, to_address: str, subject: str, body: str) -> None:
    if not smtp_configured():
        raise MailNotConfiguredError("SMTP is not configured")
    message = EmailMessage()
    message["From"] = settings.smtp_from.strip()
    message["To"] = to_address
    message["Subject"] = subject
    message.set_content(body)
    host = settings.smtp_host.strip()
    port = settings.smtp_port
    try:
        if port == 465:
            client_cm = smtplib.SMTP_SSL(
                host, port, timeout=settings.smtp_timeout_seconds
            )
        else:
            client_cm = smtplib.SMTP(
                host, port, timeout=settings.smtp_timeout_seconds
            )
        with client_cm as client:
            if port != 465 and settings.smtp_use_tls:
                client.starttls()
            if settings.smtp_username.strip():
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise MailDeliveryError(_smtp_error_text(exc)) from exc


def hash_mail_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _public_base(public_base_url: str | None = None) -> str:
    raw = public_base_url if public_base_url is not None else settings.public_base_url
    try:
        return normalize_public_base_url(raw)
    except ValueError:
        return DEFAULT_PUBLIC_BASE_URL


def confirmation_mail(
    user: User,
    token: str,
    code: str,
    *,
    public_base_url: str | None = None,
) -> tuple[str, str]:
    base = _public_base(public_base_url)
    link = f"{base}/#/auth/confirm?token={token}" if base else f"#/auth/confirm?token={token}"
    lines = [
        f"Здравствуйте, {user.display_name}.",
        "",
        "Подтвердите почту для GraphNotes.",
        f"Код: {code}",
        "",
        f"Или откройте ссылку: {link}",
        "",
        "Если вы не регистрировались, письмо можно игнорировать.",
    ]
    return "Подтверждение почты GraphNotes", "\n".join(lines)


def login_mail(
    user: User,
    token: str,
    code: str,
    *,
    public_base_url: str | None = None,
) -> tuple[str, str]:
    base = _public_base(public_base_url)
    link = f"{base}/#/auth/login-code?token={token}" if base else ""
    lines = [
        f"Здравствуйте, {user.display_name}.",
        "",
        "Вход в GraphNotes по почте.",
        f"Код: {code}",
    ]
    if link:
        lines.extend(["", f"Или откройте ссылку: {link}"])
    lines.extend(["", "Если вы не запрашивали вход, письмо можно игнорировать."])
    return "Вход в GraphNotes", "\n".join(lines)


def reset_mail(
    user: User,
    token: str,
    code: str,
    *,
    public_base_url: str | None = None,
) -> tuple[str, str]:
    base = _public_base(public_base_url)
    link = f"{base}/#/auth/reset?token={token}" if base else ""
    lines = [
        f"Здравствуйте, {user.display_name}.",
        "",
        "Сброс пароля GraphNotes.",
        f"Код: {code}",
    ]
    if link:
        lines.extend(["", f"Или откройте ссылку: {link}"])
    lines.extend(["", "Если вы не запрашивали сброс, письмо можно игнорировать."])
    return "Сброс пароля GraphNotes", "\n".join(lines)


def queue_notify_mail(
    recipient: User,
    *,
    author_name: str,
    summary: str,
    public_base_url: str | None = None,
) -> tuple[str, str]:
    base = _public_base(public_base_url)
    link = f"{base}/#/" if base else ""
    lines = [
        f"Здравствуйте, {recipient.display_name}.",
        "",
        "Новые правки пришли по ризоме.",
        f"Автор: {author_name}",
        f"Предложение: {summary}",
    ]
    if link:
        lines.extend(["", f"Очередь: {link}"])
    return "Новые правки по ризоме", "\n".join(lines)


def test_mail(to_address: str) -> tuple[str, str]:
    return (
        "GraphNotes: проверка SMTP",
        "Это проверочное письмо инсталляции GraphNotes. SMTP доставляет почту.\n",
    )


async def issue_email_token(
    database: AsyncSession,
    user: User,
    purpose: str,
) -> tuple[str, str]:
    await database.execute(
        delete(EmailToken).where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
    )
    token = secrets.token_urlsafe(32)
    code = f"{secrets.randbelow(1_000_000):06d}"
    database.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_mail_secret(token),
            code_hash=hash_mail_secret(code),
            expires_at=datetime.now(UTC)
            + timedelta(minutes=settings.mail_code_ttl_minutes),
        )
    )
    return token, code


async def mail_resend_on_cooldown(
    database: AsyncSession,
    user: User,
    purpose: str,
) -> bool:
    latest = await database.scalar(
        select(EmailToken)
        .where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
        )
        .order_by(EmailToken.created_at.desc())
        .limit(1)
    )
    if latest is None:
        return False
    now = datetime.now(UTC)
    expires_at = latest.expires_at
    created_at = latest.created_at
    if created_at is None:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    if latest.used_at is not None or expires_at <= now:
        return False
    cooldown = max(0, settings.mail_resend_cooldown_seconds)
    return (now - created_at).total_seconds() < cooldown


async def consume_email_token(
    database: AsyncSession,
    *,
    purpose: str,
    token: str | None = None,
    code: str | None = None,
    email: str | None = None,
) -> User | None:
    if not token and not code:
        return None
    now = datetime.now(UTC)
    query = select(EmailToken).where(
        EmailToken.purpose == purpose,
        EmailToken.used_at.is_(None),
        EmailToken.expires_at > now,
    )
    if token:
        query = query.where(EmailToken.token_hash == hash_mail_secret(token))
    elif code:
        if not email:
            return None
        query = query.where(EmailToken.code_hash == hash_mail_secret(code.strip()))
    row = await database.scalar(query.order_by(EmailToken.created_at.desc()))
    if row is None:
        return None
    user = await database.get(User, row.user_id)
    if user is None or not user.is_active:
        return None
    if email:
        ident = email.strip()
        if "@" in ident:
            if user.email != ident.casefold():
                return None
        elif user.username != ident.casefold():
            return None
    row.used_at = now
    return user
