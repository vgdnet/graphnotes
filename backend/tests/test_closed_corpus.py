from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from tests.test_ingest import _github, _install, _register
from tests.test_proposals import _admin, _second


def _assert_hidden(payload: str) -> None:
    folded = payload.casefold()
    assert "head_sha" not in folded
    assert "github.com" not in folded
    assert "password" not in folded


async def test_closed_path_stays_out_of_differ_and_hides_body(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _admin(admin, session_factory, "closed-admin")

    author = await _second("keeper")
    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("missing.md", b"# Secret closed body\nDo not leak.\n", "text/markdown")},
    )
    assert uploaded.status_code == 200

    public = await author.post(
        "/personal/import-md",
        files={"file": ("public.md", b"# Public draft\n", "text/markdown")},
    )
    assert public.status_code == 200

    before = await author.get("/differ")
    assert before.status_code == 200
    paths = {item["path"] for item in before.json()["differences"]}
    assert "missing.md" in paths
    assert "public.md" in paths

    closed = await author.put("/personal/closed-paths", json={"path": "missing.md"})
    assert closed.status_code == 200
    assert {item["path"] for item in closed.json()["paths"]} == {"missing.md"}

    after = await author.get("/differ")
    assert after.status_code == 200
    remain = {item["path"] for item in after.json()["differences"]}
    assert "missing.md" not in remain
    assert "public.md" in remain
    _assert_hidden(after.text)

    blocked = await author.post("/proposals", json={"paths": ["missing.md"]})
    assert blocked.status_code == 403

    own = await author.get("/personal/notes/missing.md")
    assert own.status_code == 200
    assert "Secret closed body" in own.json()["body"]
    assert own.json()["closed"] is True

    stranger = await _second("stranger")
    other_personal = await stranger.get("/personal/notes/missing.md")
    assert other_personal.status_code == 404
    assert "Secret closed body" not in other_personal.text

    shared = await stranger.get("/shared/notes/missing.md")
    assert shared.status_code == 200
    assert shared.json()["locked"] is True
    assert shared.json()["body"] == ""
    assert "Secret closed body" not in shared.text
    _assert_hidden(shared.text)

    card = await stranger.get("/shared/notes/card.md")
    assert card.status_code == 200
    assert "missing" in card.json()["locked_links"]
    assert "missing" not in card.json()["unresolved_links"]
    assert "Secret closed body" not in card.text

    graph = await stranger.get("/graph/shared")
    assert graph.status_code == 200
    locked = [node for node in graph.json()["nodes"] if node.get("locked")]
    assert locked
    assert all("Secret closed body" not in node.get("title", "") for node in graph.json()["nodes"])
    _assert_hidden(graph.text)

    archive = await stranger.get("/shared/archive")
    assert archive.status_code == 410

    opened = await author.delete("/personal/closed-paths/missing.md")
    assert opened.status_code == 204
    differ_again = await author.get("/differ")
    assert "missing.md" in {item["path"] for item in differ_again.json()["differences"]}
