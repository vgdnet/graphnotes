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
    assert listed.json()["differences"][0]["updated_at"]

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

    shared_only = await plugin.get("/differ/files/card.md", headers=_auth(created["token"]))
    assert shared_only.status_code == 200
    assert shared_only.json()["kind"] == "changed"
    assert "See [[missing]]" in shared_only.json()["incoming"]["body"]
    assert shared_only.json()["current"]["body"] == ""

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

    proposals_by_token = await plugin.get("/proposals", headers=_auth(created["token"]))
    assert proposals_by_token.status_code == 200
    assert proposals_by_token.json()["proposals"] == []

    offered = await plugin.post(
        "/proposals",
        headers=_auth(created["token"]),
        json={"paths": ["fresh.md"], "summary": "from plugin"},
    )
    assert offered.status_code == 200
    created_proposal = offered.json()
    assert created_proposal["status"] == "open"
    assert created_proposal["paths"] == ["fresh.md"]
    assert created_proposal["added"] == ["fresh.md"]
    assert created_proposal["author"]["username"] == "differ-author"

    listed_after = await plugin.get("/proposals", headers=_auth(created["token"]))
    assert listed_after.status_code == 200
    assert listed_after.json()["proposals"][0]["id"] == created_proposal["id"]

    anonymous_post = await plugin.post("/proposals", json={"paths": ["fresh.md"]})
    assert anonymous_post.status_code == 401

    closed = await author.put("/personal/closed-paths", json={"path": "fresh.md"})
    assert closed.status_code == 200
    hidden_closed = await plugin.get("/differ/files/fresh.md", headers=_auth(created["token"]))
    assert hidden_closed.status_code == 404
    assert hidden_closed.json()["detail"] == "path is closed"
    await author.aclose()
    await plugin.aclose()


async def test_differ_list_does_not_call_github(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    site, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    await _register(site, "differ-admin")
    await _bind_shared(site, session_factory, "differ-admin")

    author = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(author, "store-author")
    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("fresh.md", b"# Store only\n", "text/markdown")},
    )
    assert uploaded.status_code == 200

    async def boom(*_args, **_kwargs):
        raise AssertionError("offer/differ list must not call GitHub")

    monkeypatch.setattr(github, "get_repository", boom)
    monkeypatch.setattr(github, "get_file", boom)
    monkeypatch.setattr(github, "list_markdown_blobs", boom)
    monkeypatch.setattr(github, "get_blob", boom)
    monkeypatch.setattr(github, "merge_branch", boom)
    monkeypatch.setattr(github, "create_branch", boom)
    monkeypatch.setattr(github, "commit_markdown", boom)

    listed = await author.get("/differ")
    assert listed.status_code == 200
    assert listed.json()["differences"][0]["path"] == "fresh.md"
    assert "body" not in listed.json()["differences"][0]
    skipped = await author.get("/differ", params={"include_inbound": "false"})
    assert skipped.status_code == 200
    assert skipped.json()["inbound"] == []
    pair = await author.get("/differ/files/fresh.md")
    assert pair.status_code == 200
    assert pair.json()["current"]["body"] == "# Store only\n"
    queued = await author.get("/proposals")
    assert queued.status_code == 200
    assert queued.json()["proposals"] == []
    status = await author.get("/repository/status")
    assert status.status_code == 200
    assert status.json()["shared"]["connected"] is True
    notes = await author.get("/personal/notes")
    assert notes.status_code == 200
    shared = await author.get("/shared/notes")
    assert shared.status_code == 200
    search = await author.get("/search", params={"q": "Store"})
    assert search.status_code == 200
    graph = await author.get("/graph/shared")
    assert graph.status_code == 200
    contrib = await author.get("/contributions/me")
    assert contrib.status_code == 200
    await author.aclose()


async def test_propose_opens_queue_when_github_is_rate_limited(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    from app.services.github import GitHubAppError

    site, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    await _register(site, "offer-admin")
    await _bind_shared(site, session_factory, "offer-admin")

    author = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(author, "offer-author")
    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("fresh.md", b"# Offer from store\n", "text/markdown")},
    )
    assert uploaded.status_code == 200

    async def limited(*_args, **_kwargs):
        raise GitHubAppError("rate_limited", "GitHub rate limit reached")

    monkeypatch.setattr(github, "create_branch", limited)
    monkeypatch.setattr(github, "commit_markdown", limited)

    offered = await author.post("/proposals", json={"paths": ["fresh.md"], "summary": "from store"})
    assert offered.status_code == 200
    assert offered.json()["status"] == "open"
    assert offered.json()["paths"] == ["fresh.md"]
    queued = await author.get("/proposals")
    assert queued.status_code == 200
    assert queued.json()["proposals"][0]["id"] == offered.json()["id"]
    await author.aclose()
