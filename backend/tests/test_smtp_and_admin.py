from datetime import UTC, datetime, timedelta
import uuid

from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.auth_session import AuthSession
from app.models.email_token import EmailToken
from app.models.installation import InstallationSetting
from app.models.user import User
from app.services.admin import bootstrap_admin
from app.services.installation import PUBLIC_BASE_URL_KEY
from tests.test_ingest import _register as _seed_account


async def _register(
    client: AsyncClient,
    name: str,
    email: str | None = None,
) -> dict:
    await _seed_account(client, name, accept_author=False, email=email)
    me = await client.get("/users/me")
    assert me.status_code == 200, me.text
    return me.json()


async def _admin(client: AsyncClient, session_factory, name: str = "ops-admin") -> None:
    await _register(client, name)
    async with session_factory() as database:
        await bootstrap_admin(database, name)


def _enable_smtp(monkeypatch: MonkeyPatch) -> list[dict]:
    sent: list[dict] = []

    def fake_send(*, to_address: str, subject: str, body: str) -> None:
        sent.append({"to": to_address, "subject": subject, "body": body})

    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "smtp_from", "graphnotes@example.test")
    monkeypatch.setattr(settings, "smtp_username", "")
    monkeypatch.setattr(settings, "smtp_password", "")
    monkeypatch.setattr(settings, "public_base_url", "http://rhizome.test")
    monkeypatch.setattr("app.services.mail.send_plaintext_mail", fake_send)
    monkeypatch.setattr("app.api.auth.send_plaintext_mail", fake_send)
    monkeypatch.setattr("app.api.admin.send_plaintext_mail", fake_send)
    monkeypatch.setattr("app.api.invites.send_plaintext_mail", fake_send)
    monkeypatch.setattr("app.services.notify.send_plaintext_mail", fake_send)
    return sent


async def test_login_by_email_without_smtp(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _ = auth_test_context
    await _register(client, "mail-login")
    await client.post("/auth/logout")
    status = await client.get("/auth/mail-status")
    assert status.status_code == 200
    assert status.json()["configured"] is False
    assert status.json()["code_ttl_minutes"] == 30
    login = await client.post(
        "/auth/login",
        json={"username": "mail-login@example.com", "password": "a sufficiently long password"},
    )
    assert login.status_code == 200
    assert login.json()["username"] == "mail-login"
    assert login.json()["email_verified_at"]
    assert login.json()["last_login_at"]
    assert (await client.post("/auth/email/request", json={"email": "mail-login@example.com", "purpose": "login"})).status_code == 503


async def test_smtp_invite_accept_and_email_login(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    await _register(client, "host")
    sent = _enable_smtp(monkeypatch)
    created = await client.post("/invites", json={"email": "pending@example.com"})
    assert created.status_code == 201
    assert sent and "#/auth/invite?token=" in sent[0]["body"]
    assert "a sufficiently long password" not in sent[0]["body"]
    token = sent[0]["body"].split("token=", 1)[1].split()[0]
    await client.post("/auth/logout")

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    accepted = await guest.post(
        "/auth/invite/accept",
        json={
            "token": token,
            "username": "pending",
            "password": "a sufficiently long password",
            "display_name": "Pending",
        },
    )
    assert accepted.status_code == 201
    assert accepted.json()["email_verified_at"]
    assert accepted.json()["email"] == "pending@example.com"
    assert guest.cookies.get("graphnotes_session")
    await guest.post("/auth/logout")
    login = await guest.post(
        "/auth/login",
        json={"username": "pending@example.com", "password": "a sufficiently long password"},
    )
    assert login.status_code == 200
    await guest.post("/auth/logout")
    asked = await guest.post(
        "/auth/email/request",
        json={"email": "pending@example.com", "purpose": "login"},
    )
    assert asked.status_code == 204
    login_token = sent[-1]["body"].split("token=", 1)[1].split()[0]
    via_link = await guest.post(
        "/auth/email/verify",
        json={"purpose": "login", "token": login_token},
    )
    assert via_link.status_code == 200
    assert via_link.json()["username"] == "pending"
    async with session_factory() as database:
        actions = set((await database.scalars(select(AuditEvent.action))).all())
        assert "invite.created" in actions
        assert "invite.accepted" in actions
        serialized = " ".join(
            str(item.details) for item in (await database.scalars(select(AuditEvent))).all()
        )
        assert "a sufficiently long password" not in serialized
    await guest.aclose()


async def test_smtp_login_code_accepts_username_identifier(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    sent = _enable_smtp(monkeypatch)
    await _register(client, "mail-code", email="mail-code@example.com")
    await client.post("/auth/logout")
    asked = await client.post(
        "/auth/email/request",
        json={"identifier": "mail-code", "purpose": "login"},
    )
    assert asked.status_code == 204
    code = sent[-1]["body"].split("Код: ", 1)[1].splitlines()[0].strip()
    via_code = await client.post(
        "/auth/email/verify",
        json={"purpose": "login", "identifier": "mail-code", "code": code},
    )
    assert via_code.status_code == 200
    assert via_code.json()["username"] == "mail-code"
    assert client.cookies.get("graphnotes_session")


async def test_smtp_invite_link_opens_session(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    await _register(client, "host-link")
    sent = _enable_smtp(monkeypatch)
    created = await client.post("/invites", json={"email": "link-pending@example.com"})
    assert created.status_code == 201
    assert sent and "#/auth/invite?token=" in sent[0]["body"]
    token = sent[0]["body"].split("token=", 1)[1].split()[0]
    await client.post("/auth/logout")
    accepted = await client.post(
        "/auth/invite/accept",
        json={
            "token": token,
            "username": "link-pending",
            "password": "a sufficiently long password",
            "display_name": "Link Pending",
        },
    )
    assert accepted.status_code == 201
    assert accepted.json()["email_verified_at"]
    assert accepted.json()["username"] == "link-pending"
    assert client.cookies.get("graphnotes_session")
    assert (await client.get("/users/me")).status_code == 200


async def test_admin_create_search_revoke_audit_filters_and_mail_test(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    await _admin(admin, session_factory, "desk-admin")
    forbidden = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(forbidden, "plain-user")
    sent = _enable_smtp(monkeypatch)

    created = await admin.post(
        "/admin/users",
        json={
            "username": "invited",
            "password": "invitee long password",
            "display_name": "Invited",
            "email": "invited@example.com",
            "role": "editor",
        },
    )
    assert created.status_code == 201
    assert created.json()["role"] == "editor"
    assert created.json()["email_verified_at"]
    invited_id = created.json()["id"]
    assert "password" not in created.text

    listed = await admin.get("/admin/users", params={"q": "invited", "role": "editor"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["users"][0]["username"] == "invited"
    assert listed.json()["users"][0]["session_count"] == 0

    other = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    login = await other.post(
        "/auth/login",
        json={"username": "invited", "password": "invitee long password"},
    )
    assert login.status_code == 200
    assert (await other.get("/users/me")).status_code == 200
    revoked = await admin.post(f"/admin/users/{invited_id}/sessions/revoke")
    assert revoked.status_code == 200
    assert revoked.json()["revoked"] >= 1
    assert (await other.get("/users/me")).status_code == 401
    await other.aclose()

    journal = await admin.get(
        "/admin/audit",
        params={"action": "admin.user_created", "actor": "desk-admin"},
    )
    assert journal.status_code == 200
    assert journal.json()["total"] >= 1
    assert journal.json()["events"][0]["actor_username"] == "desk-admin"
    assert "invitee long password" not in journal.text

    operator = await admin.get("/admin/operator")
    assert operator.status_code == 200
    assert operator.json()["smtp"]["configured"] is True
    assert operator.json()["smtp"]["host"] == "smtp.example.test"
    assert "password" not in operator.text
    assert settings.smtp_password == ""

    test_send = await admin.post("/admin/mail/test", json={"to": "ops@example.com"})
    assert test_send.status_code == 200
    assert test_send.json()["sent"] is True
    assert sent[-1]["to"] == "ops@example.com"
    assert "invitee long password" not in sent[-1]["body"]

    assert (await forbidden.get("/admin/users")).status_code == 403
    assert (await forbidden.get("/admin/audit")).status_code == 403
    assert (await forbidden.get("/admin/operator")).status_code == 403
    await forbidden.aclose()

    async with session_factory() as database:
        sessions = (
            await database.scalars(
                select(AuthSession).where(AuthSession.user_id == uuid.UUID(invited_id))
            )
        ).all()
        assert sessions == []
        user = await database.scalar(select(User).where(User.username == "invited"))
        assert user is not None
        assert user.role == "editor"


async def test_password_reset_by_email_code_and_link(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    sent = _enable_smtp(monkeypatch)
    await _register(client, "reset-me", email="reset-me@example.com")
    await client.post("/auth/logout")

    missing = await client.post(
        "/auth/password/reset",
        json={"email": "reset-me@example.com", "code": "000000", "password": "brand new long password"},
    )
    assert missing.status_code == 401

    asked = await client.post(
        "/auth/email/request",
        json={"email": "reset-me@example.com", "purpose": "reset"},
    )
    assert asked.status_code == 204
    assert "Сброс пароля" in sent[-1]["subject"]
    assert "http://rhizome.test/#/auth/reset" in sent[-1]["body"]
    code = sent[-1]["body"].split("Код: ", 1)[1].splitlines()[0].strip()
    assert "brand new long password" not in sent[-1]["body"]

    changed = await client.post(
        "/auth/password/reset",
        json={
            "email": "reset-me@example.com",
            "code": code,
            "password": "brand new long password",
        },
    )
    assert changed.status_code == 200
    assert changed.json()["username"] == "reset-me"
    assert client.cookies.get("graphnotes_session")
    await client.post("/auth/logout")

    old = await client.post(
        "/auth/login",
        json={"username": "reset-me", "password": "a sufficiently long password"},
    )
    assert old.status_code == 401
    fresh = await client.post(
        "/auth/login",
        json={"username": "reset-me@example.com", "password": "brand new long password"},
    )
    assert fresh.status_code == 200
    await client.post("/auth/logout")

    asked_again = await client.post(
        "/auth/email/request",
        json={"email": "reset-me@example.com", "purpose": "reset"},
    )
    assert asked_again.status_code == 204
    token = sent[-1]["body"].split("token=", 1)[1].split()[0]
    via_link = await client.post(
        "/auth/password/reset",
        json={"token": token, "password": "another long password"},
    )
    assert via_link.status_code == 200
    async with session_factory() as database:
        actions = set((await database.scalars(select(AuditEvent.action))).all())
        assert "auth.password_reset" in actions
        serialized = " ".join(
            str(item.details) for item in (await database.scalars(select(AuditEvent))).all()
        )
        assert "brand new long password" not in serialized
        assert "another long password" not in serialized


async def test_notify_prefs_default_off_and_admin_toggle(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    admin, session_factory = auth_test_context
    await _admin(admin, session_factory, "notify-admin")
    me = await admin.get("/users/me")
    assert me.json()["notify_queue_email"] is False
    assert me.json()["notify_queue_telegram"] is False
    assert me.json()["notify_card_changes"] is False
    patched = await admin.patch(
        "/users/me",
        json={
            "notify_queue_email": True,
            "notify_queue_telegram": True,
            "notify_card_changes": True,
        },
    )
    assert patched.status_code == 200
    assert patched.json()["notify_queue_email"] is True
    assert patched.json()["notify_queue_telegram"] is True
    assert patched.json()["notify_card_changes"] is True

    created = await admin.post(
        "/admin/users",
        json={
            "username": "queue-ed",
            "password": "editor long password",
            "display_name": "Queue Ed",
            "email": "queue-ed@example.com",
            "role": "editor",
        },
    )
    editor_id = created.json()["id"]
    assert created.json()["notify_queue_email"] is False
    assert created.json()["notify_card_changes"] is False
    toggled = await admin.patch(
        f"/admin/users/{editor_id}",
        json={"notify_queue_email": True, "notify_card_changes": True},
    )
    assert toggled.status_code == 200
    assert toggled.json()["notify_queue_email"] is True
    assert toggled.json()["notify_queue_telegram"] is False
    assert toggled.json()["notify_card_changes"] is True
    operator = await admin.get("/admin/operator")
    assert operator.json()["telegram"]["configured"] is False


async def test_default_public_base_url_in_confirmation_mail(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    await _register(client, "url-host")
    sent = _enable_smtp(monkeypatch)
    monkeypatch.setattr(settings, "public_base_url", "")
    created = await client.post("/invites", json={"email": "default-url@example.com"})
    assert created.status_code == 201
    assert "https://rhizome.vsepsy.ru/#/auth/invite?token=" in sent[0]["body"]
    assert "172.16.13.14" not in sent[0]["body"]


async def test_admin_persisted_public_url_overrides_lan_env(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    await _admin(admin, session_factory, "url-admin")
    sent = _enable_smtp(monkeypatch)
    monkeypatch.setattr(settings, "public_base_url", "http://172.16.13.14:8080")

    saved = await admin.put(
        "/admin/operator",
        json={"public_base_url": "https://rhizome.vsepsy.ru/"},
    )
    assert saved.status_code == 200
    assert saved.json()["public_base_url"] == "https://rhizome.vsepsy.ru"
    assert saved.json()["smtp"]["public_base_url"] == "https://rhizome.vsepsy.ru"
    assert saved.json()["mail_code_ttl_minutes"] == 30

    listed = await admin.get("/admin/operator")
    assert listed.json()["public_base_url"] == "https://rhizome.vsepsy.ru"

    created = await admin.post("/invites", json={"email": "lan-env@example.com"})
    assert created.status_code == 201
    assert "https://rhizome.vsepsy.ru/#/auth/invite?token=" in sent[-1]["body"]
    assert "172.16.13.14" not in sent[-1]["body"]

    async with session_factory() as database:
        row = await database.get(InstallationSetting, PUBLIC_BASE_URL_KEY)
        assert row is not None
        assert row.value == "https://rhizome.vsepsy.ru"
        actions = set((await database.scalars(select(AuditEvent.action))).all())
        assert "admin.public_base_url_changed" in actions


async def test_start_card_path_persists_and_is_public(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    admin, session_factory = auth_test_context
    await _admin(admin, session_factory, "start-admin")
    missing = await admin.get("/installation/start-card")
    assert missing.status_code == 200
    assert missing.json()["path"] is None
    saved = await admin.put(
        "/admin/operator",
        json={
            "public_base_url": "https://rhizome.vsepsy.ru",
            "start_card_path": "Welcome.md",
        },
    )
    assert saved.status_code == 200
    assert saved.json()["start_card_path"] == "Welcome.md"
    listed = await admin.get("/installation/start-card")
    assert listed.json()["path"] == "Welcome.md"


async def test_expired_reset_and_confirm_tokens_do_not_open_session(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    sent = _enable_smtp(monkeypatch)
    await _register(client, "ttl-user", email="ttl-user@example.com")
    await client.post("/auth/logout")

    asked = await client.post(
        "/auth/email/request",
        json={"email": "ttl-user@example.com", "purpose": "reset"},
    )
    assert asked.status_code == 204
    code = sent[-1]["body"].split("Код: ", 1)[1].splitlines()[0].strip()
    token = sent[-1]["body"].split("token=", 1)[1].split()[0]
    async with session_factory() as database:
        rows = (await database.scalars(select(EmailToken))).all()
        assert rows
        for row in rows:
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await database.commit()

    expired = await client.post(
        "/auth/password/reset",
        json={
            "email": "ttl-user@example.com",
            "code": code,
            "password": "brand new long password",
        },
    )
    assert expired.status_code == 401
    assert "graphnotes_session" not in client.cookies
    via_link = await client.post(
        "/auth/password/reset",
        json={"token": token, "password": "brand new long password"},
    )
    assert via_link.status_code == 401
    assert "graphnotes_session" not in via_link.cookies
    old = await client.post(
        "/auth/login",
        json={"username": "ttl-user@example.com", "password": "a sufficiently long password"},
    )
    assert old.status_code == 200
    await client.post("/auth/logout")

    asked_login = await client.post(
        "/auth/email/request",
        json={"email": "ttl-user@example.com", "purpose": "login"},
    )
    assert asked_login.status_code == 204
    login_token = sent[-1]["body"].split("token=", 1)[1].split()[0]
    async with session_factory() as database:
        rows = (
            await database.scalars(
                select(EmailToken).where(EmailToken.purpose == "login")
            )
        ).all()
        for row in rows:
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await database.commit()
    failed_login = await client.post(
        "/auth/email/verify",
        json={"purpose": "login", "token": login_token},
    )
    assert failed_login.status_code == 401
    assert "graphnotes_session" not in failed_login.cookies


async def test_resend_is_generic_and_sends_after_expiry(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    sent = _enable_smtp(monkeypatch)
    await _register(client, "resend-me", email="resend-me@example.com")
    await client.post("/auth/logout")

    missing = await client.post(
        "/auth/email/request",
        json={"email": "nobody@example.com", "purpose": "reset"},
    )
    assert missing.status_code == 204
    assert sent == [] or all("nobody@example.com" not in item["body"] for item in sent)
    mail_count = len(sent)

    first = await client.post(
        "/auth/email/request",
        json={"email": "resend-me@example.com", "purpose": "reset"},
    )
    assert first.status_code == 204
    assert len(sent) == mail_count + 1
    first_token = sent[-1]["body"].split("token=", 1)[1].split()[0]

    second = await client.post(
        "/auth/email/request",
        json={"email": "resend-me@example.com", "purpose": "reset"},
    )
    assert second.status_code == 204
    assert len(sent) == mail_count + 1

    async with session_factory() as database:
        rows = (await database.scalars(select(EmailToken))).all()
        for row in rows:
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await database.commit()

    third = await client.post(
        "/auth/email/request",
        json={"email": "resend-me@example.com", "purpose": "reset"},
    )
    assert third.status_code == 204
    assert len(sent) == mail_count + 2
    new_token = sent[-1]["body"].split("token=", 1)[1].split()[0]
    assert new_token != first_token
    reused = await client.post(
        "/auth/password/reset",
        json={"token": first_token, "password": "brand new long password"},
    )
    assert reused.status_code == 401


async def test_password_reset_by_username_sends_to_stored_email(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    sent = _enable_smtp(monkeypatch)
    await _register(client, "by-login", email="stored-box@example.com")
    await client.post("/auth/logout")

    asked = await client.post(
        "/auth/email/request",
        json={"identifier": "by-login", "purpose": "reset"},
    )
    assert asked.status_code == 204
    assert sent[-1]["to"] == "stored-box@example.com"
    assert "Сброс пароля" in sent[-1]["subject"]

    by_email = await client.post(
        "/auth/email/request",
        json={"email": "stored-box@example.com", "purpose": "reset"},
    )
    assert by_email.status_code == 204

    unknown = await client.post(
        "/auth/email/request",
        json={"identifier": "no-such-user", "purpose": "reset"},
    )
    assert unknown.status_code == 204
    stray = await client.post(
        "/auth/email/request",
        json={"email": "not-the-account@example.com", "purpose": "reset"},
    )
    assert stray.status_code == 204
    assert all(item["to"] == "stored-box@example.com" for item in sent)


async def test_password_reset_by_username_sends_to_stored_email(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    sent = _enable_smtp(monkeypatch)
    await _register(client, "by-login", email="stored-box@example.com")
    await client.post("/auth/logout")

    asked = await client.post(
        "/auth/email/request",
        json={"identifier": "by-login", "purpose": "reset"},
    )
    assert asked.status_code == 204
    assert sent[-1]["to"] == "stored-box@example.com"
    assert "evil@example.com" not in sent[-1]["to"]
    assert "Сброс пароля" in sent[-1]["subject"]
    assert "https://rhizome.vsepsy.ru/#/auth/reset" in sent[-1]["body"] or (
        "http://rhizome.test/#/auth/reset" in sent[-1]["body"]
    )

    by_email = await client.post(
        "/auth/email/request",
        json={"email": "stored-box@example.com", "purpose": "reset"},
    )
    assert by_email.status_code == 204

    unknown = await client.post(
        "/auth/email/request",
        json={"identifier": "no-such-user", "purpose": "reset"},
    )
    assert unknown.status_code == 204
    stray = await client.post(
        "/auth/email/request",
        json={"email": "not-the-account@example.com", "purpose": "reset"},
    )
    assert stray.status_code == 204
    assert all(item["to"] == "stored-box@example.com" for item in sent)

