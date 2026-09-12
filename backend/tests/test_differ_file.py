from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from tests.test_ingest import _bind_shared, _github, _install, _register
from tests.test_obsidian_integration import _auth, _token


async def test_differ_file_is_the_same_pair_for_cookie_and_plugin_token(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    site, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _register(site, "differ-admin")
    await _bind_shared(site, session_factory, "differ-admin")

    author = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(author, "differ-author")
    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("fresh.md", b"# Fresh from upload\n", "text/markdown")},
    )
    assert uploaded.status_code == 200

    listed = await author.get("/differ")
    assert listed.status_code == 200
    assert listed.json()["differences"][0]["path"] == "fresh.md"
    assert listed.json()["differences"][0]["kind"] == "added"

    cookie_file = await author.get("/differ/files/fresh.md")
    assert cookie_file.status_code == 200
    pair = cookie_file.json()
    assert pair["path"] == "fresh.md"
    assert pair["kind"] == "added"
    assert pair["incoming"]["layer"] == "shared"
    assert pair["incoming"]["body"] == ""
    assert pair["current"]["layer"] == "personal"
    assert pair["current"]["body"] == "# Fresh from upload\n"
    assert pair["current"]["author"]["username"] == "differ-author"

    created = await _token(author)
    plugin = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    bearer = await plugin.get("/differ", headers=_auth(created["token"]))
    assert bearer.status_code == 200
    assert bearer.json()["differences"] == listed.json()["differences"]

    bearer_file = await plugin.get("/differ/files/fresh.md", headers=_auth(created["token"]))
    assert bearer_file.status_code == 200
    assert bearer_file.json()["current"]["body"] == pair["current"]["body"]
    assert bearer_file.json()["incoming"]["body"] == pair["incoming"]["body"]

    missing = await plugin.get("/differ/files/nope.md", headers=_auth(created["token"]))
    assert missing.status_code == 404
    hidden = await plugin.get("/differ/files/.hidden.md", headers=_auth(created["token"]))
    assert hidden.status_code == 400
    anonymous = await plugin.get("/differ")
    assert anonymous.status_code == 401

    changed = await author.post(
        "/personal/import-md",
        files={"file": ("card.md", b"# Personal rewrite of card\n", "text/markdown")},
    )
    assert changed.status_code == 200
    pair_changed = await author.get("/differ/files/card.md")
    assert pair_changed.status_code == 200
    assert pair_changed.json()["kind"] == "changed"
    assert "See [[missing]]" in pair_changed.json()["incoming"]["body"]
    assert pair_changed.json()["current"]["body"] == "# Personal rewrite of card\n"

    closed = await author.put("/personal/closed-paths", json={"path": "fresh.md"})
    assert closed.status_code == 200
    hidden_closed = await plugin.get("/differ/files/fresh.md", headers=_auth(created["token"]))
    assert hidden_closed.status_code == 404
    assert hidden_closed.json()["detail"] == "path is closed"

    proposals_by_token = await plugin.get("/proposals", headers=_auth(created["token"]))
    assert proposals_by_token.status_code == 401
    await author.aclose()
    await plugin.aclose()
