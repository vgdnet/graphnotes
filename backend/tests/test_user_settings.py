from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from tests.test_ingest import _connect_pair, _github, _install, _register
from tests.test_proposals import _admin
from tests.test_repository import _install_fake, _snapshot


async def test_register_requires_unique_email_and_profile_patch(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _ = auth_test_context
    missing = await client.post(
        "/auth/register",
        json={
            "username": "no-mail",
            "password": "a sufficiently long password",
            "display_name": "No Mail",
        },
    )
    assert missing.status_code == 422

    created = await client.post(
        "/auth/register",
        json={
            "username": "mail-user",
            "password": "a sufficiently long password",
            "display_name": "Mail User",
            "email": "Mail.User@Example.com",
        },
    )
    assert created.status_code == 201
    assert created.json()["email"] == "mail.user@example.com"
    assert created.json()["phone"] is None

    taken = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with taken:
        clash = await taken.post(
            "/auth/register",
            json={
                "username": "other-mail",
                "password": "a sufficiently long password",
                "display_name": "Other",
                "email": "mail.user@example.com",
            },
        )
        assert clash.status_code == 409

    patched = await client.patch(
        "/users/me",
        json={
            "display_name": "Mail Person",
            "phone": "+70000000000",
            "telegram": "@mailuser",
            "phone_public": False,
            "telegram_public": True,
            "website": "https://example.test/mail",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["display_name"] == "Mail Person"
    assert patched.json()["phone"] == "+70000000000"
    assert patched.json()["telegram_public"] is True

    me = await client.get("/users/me")
    assert me.json()["website"] == "https://example.test/mail"


async def test_author_contract_settings_aliases_and_git_disconnect(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    _install_fake(
        monkeypatch,
        {
            "vgdnet/rhizome": _snapshot("vgdnet", "rhizome"),
            "vgdnet/guide_psy": _snapshot("vgdnet", "guide_psy", "2656006c2308"),
        },
    )
    await _admin(client, session_factory, "settings-admin")
    author = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(author, "settings-author", accept_author=False)
    assert (await author.get("/users/me/author-contract")).status_code == 200
    accepted = await author.post("/users/me/author-contract", json={"accepted": True})
    assert accepted.status_code == 200
    assert accepted.json()["is_author"] is True

    connected = await author.post("/personal/connect", json={"repository": "vgdnet/guide_psy"})
    assert connected.status_code == 200
    assert connected.json()["personal"]["connected"] is True

    gone = await author.delete("/personal/connect")
    assert gone.status_code == 200
    assert gone.json()["personal"] is None
    status = await author.get("/repository/status")
    assert status.json()["personal"] is None

    withdrawn = await author.post("/users/me/author-contract/withdraw")
    assert withdrawn.status_code == 200
    assert withdrawn.json()["is_author"] is False
    blocked = await author.post("/personal/connect", json={"repository": "vgdnet/guide_psy"})
    assert blocked.status_code == 403
    await author.aclose()


async def test_guest_graph_has_no_note_bodies(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _admin(admin, session_factory, "graph-admin")
    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with guest:
        graph = await guest.get("/graph/shared")
        assert graph.status_code == 200
        assert (await guest.get("/shared/notes/card.md")).status_code == 401
        assert (await guest.get("/shared/notes/card.md/feed")).status_code == 401
        assert (await guest.get("/shared/notes/card.md/comments")).status_code == 401
