import uuid

from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.admin import bootstrap_admin


async def _register(
    client: AsyncClient,
    name: str,
    email: str | None = None,
) -> dict:
    response = await client.post(
        "/auth/register",
        json={
            "username": name,
            "password": "a sufficiently long password",
            "display_name": name.title(),
            "email": email or f"{name}@example.com",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


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
    login = await client.post(
        "/auth/login",
        json={"username": "mail-login@example.com", "password": "a sufficiently long password"},
    )
    assert login.status_code == 200
    assert login.json()["username"] == "mail-login"
    assert login.json()["email_verified_at"]
    assert login.json()["last_login_at"]
    assert (await client.post("/auth/email/request", json={"email": "mail-login@example.com", "purpose": "login"})).status_code == 503


async def test_smtp_registration_confirm_and_email_login(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    sent = _enable_smtp(monkeypatch)
    created = await client.post(
        "/auth/register",
        json={
            "username": "pending",
            "password": "a sufficiently long password",
            "display_name": "Pending",
            "email": "pending@example.com",
        },
    )
    assert created.status_code == 201
    assert created.json()["email_verified_at"] is None
    assert "graphnotes_session" not in created.cookies
    assert (await client.get("/users/me")).status_code == 401
    blocked = await client.post(
        "/auth/login",
        json={"username": "pending@example.com", "password": "a sufficiently long password"},
    )
    assert blocked.status_code == 403
    assert "not confirmed" in blocked.json()["detail"]
    assert sent and "Код:" in sent[0]["body"]
    assert "http://rhizome.test/#/auth/confirm" in sent[0]["body"]
    assert "a sufficiently long password" not in sent[0]["body"]

    resent = await client.post(
        "/auth/email/request",
        json={"email": "pending@example.com", "purpose": "confirm"},
    )
    assert resent.status_code == 204
    code = sent[-1]["body"].split("Код: ", 1)[1].splitlines()[0].strip()
    confirmed = await client.post(
        "/auth/email/verify",
        json={"purpose": "confirm", "email": "pending@example.com", "code": code},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["email_verified_at"]
    assert client.cookies.get("graphnotes_session")
    await client.post("/auth/logout")
    login = await client.post(
        "/auth/login",
        json={"username": "pending@example.com", "password": "a sufficiently long password"},
    )
    assert login.status_code == 200
    await client.post("/auth/logout")
    asked = await client.post(
        "/auth/email/request",
        json={"email": "pending@example.com", "purpose": "login"},
    )
    assert asked.status_code == 204
    login_token = sent[-1]["body"].split("token=", 1)[1].split()[0]
    via_link = await client.post(
        "/auth/email/verify",
        json={"purpose": "login", "token": login_token},
    )
    assert via_link.status_code == 200
    assert via_link.json()["username"] == "pending"
    async with session_factory() as database:
        actions = set((await database.scalars(select(AuditEvent.action))).all())
        assert "mail.confirmation_sent" in actions
        assert "auth.email_confirmed" in actions
        serialized = " ".join(
            str(item.details) for item in (await database.scalars(select(AuditEvent))).all()
        )
        assert "a sufficiently long password" not in serialized
        assert "pending@example.com" not in serialized or "mail.confirmation_sent" in actions


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
