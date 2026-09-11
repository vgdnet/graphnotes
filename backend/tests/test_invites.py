from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.invite import Invite
from app.models.user import User
from app.services.invites import attribute_existing_accounts_to_efimov
from tests.test_ingest import _register
from tests.test_smtp_and_admin import _enable_smtp


async def test_public_register_is_gone(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _ = auth_test_context
    response = await client.post(
        "/auth/register",
        json={
            "username": "street",
            "password": "a sufficiently long password",
            "display_name": "Street",
            "email": "street@example.com",
        },
    )
    assert response.status_code == 410
    assert "invite" in response.json()["detail"]


async def test_any_user_invites_and_accept_creates_account(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    host, session_factory = auth_test_context
    await _register(host, "plain-host", accept_author=False)
    sent = _enable_smtp(monkeypatch)
    created = await host.post("/invites", json={"email": "Guest.User@Example.com"})
    assert created.status_code == 201
    assert created.json()["email"] == "guest.user@example.com"
    assert sent and "https://rhizome.vsepsy.ru/#/auth/invite?token=" in sent[0]["body"] or (
        "http://rhizome.test/#/auth/invite?token=" in sent[0]["body"]
    )
    assert "@plain-host" in sent[0]["body"]
    token = sent[0]["body"].split("token=", 1)[1].split()[0]
    listed = await host.get("/invites")
    assert listed.status_code == 200
    assert listed.json()["invites"][0]["email"] == "guest.user@example.com"

    preview = await host.get("/auth/invite", params={"token": token})
    assert preview.status_code == 200
    assert preview.json()["email"] == "guest.user@example.com"
    assert preview.json()["inviter_username"] == "plain-host"

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    accepted = await guest.post(
        "/auth/invite/accept",
        json={
            "token": token,
            "username": "Guest.User",
            "password": "a sufficiently long password",
            "display_name": "Guest User",
        },
    )
    assert accepted.status_code == 201
    assert accepted.json()["username"] == "guest.user"
    assert accepted.json()["email"] == "guest.user@example.com"
    assert accepted.json()["email_verified_at"]
    assert accepted.json()["role"] == "user"
    assert guest.cookies.get("graphnotes_session")

    reused = await guest.post(
        "/auth/invite/accept",
        json={
            "token": token,
            "username": "other-guest",
            "password": "a sufficiently long password",
            "display_name": "Other",
        },
    )
    assert reused.status_code == 404

    guest_id = accepted.json()["id"]
    card = await host.get(f"/users/{guest_id}/card")
    assert card.status_code == 200
    assert card.json()["inviter"]["username"] == "plain-host"
    assert card.json()["invited_at"]
    host_id = (await host.get("/users/me")).json()["id"]
    host_card = await guest.get(f"/users/{host_id}/card")
    assert host_card.status_code == 200
    assert host_card.json()["inviter"] is None

    async with session_factory() as database:
        actions = set((await database.scalars(select(AuditEvent.action))).all())
        assert "invite.created" in actions
        assert "invite.accepted" in actions
        invite = (await database.scalars(select(Invite))).first()
        assert invite is not None
        assert invite.used_at is not None
        user = await database.scalar(select(User).where(User.username == "guest.user"))
        assert user is not None
        assert user.invited_by_id is not None
    await guest.aclose()


async def test_invite_requires_smtp_and_rate_limits(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, _ = auth_test_context
    await _register(client, "limiter")
    offline = await client.post("/invites", json={"email": "off@example.com"})
    assert offline.status_code == 503

    sent = _enable_smtp(monkeypatch)
    first = await client.post("/invites", json={"email": "one@example.com"})
    assert first.status_code == 201
    second = await client.post("/invites", json={"email": "two@example.com"})
    assert second.status_code == 429
    assert len(sent) == 1

    own = await client.post("/invites", json={"email": "limiter@example.com"})
    assert own.status_code in {409, 429}


async def test_revoked_invite_does_not_register(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    host, _ = auth_test_context
    await _register(host, "revoker")
    sent = _enable_smtp(monkeypatch)
    monkeypatch.setattr(settings, "invite_resend_cooldown_seconds", 0)
    created = await host.post("/invites", json={"email": "gone@example.com"})
    assert created.status_code == 201
    token = sent[0]["body"].split("token=", 1)[1].split()[0]
    invite_id = created.json()["id"]
    revoked = await host.delete(f"/invites/{invite_id}")
    assert revoked.status_code == 204
    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    accepted = await guest.post(
        "/auth/invite/accept",
        json={
            "token": token,
            "username": "gone-user",
            "password": "a sufficiently long password",
            "display_name": "Gone",
        },
    )
    assert accepted.status_code == 404
    await guest.aclose()


async def test_cutover_attributes_existing_users_to_efimov(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, session_factory = auth_test_context
    await _register(client, "efimov")
    other = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(other, "old-account")
    async with session_factory() as database:
        changed = await attribute_existing_accounts_to_efimov(database)
        await database.commit()
        assert changed == 1
        again = await attribute_existing_accounts_to_efimov(database)
        await database.commit()
        assert again == 0
        seed = await database.scalar(select(User).where(User.username == "efimov"))
        guest = await database.scalar(select(User).where(User.username == "old-account"))
        assert seed is not None and guest is not None
        assert seed.invited_by_id is None
        assert guest.invited_by_id == seed.id
        assert guest.invited_at is not None
    efimov_id = (await client.get("/users/me")).json()["id"]
    other_id = (await other.get("/users/me")).json()["id"]
    card = await client.get(f"/users/{other_id}/card")
    assert card.status_code == 200
    assert card.json()["inviter"]["username"] == "efimov"
    assert card.json()["inviter"]["id"] == efimov_id
    seed_card = await other.get(f"/users/{efimov_id}/card")
    assert seed_card.json()["inviter"] is None
    await other.aclose()
