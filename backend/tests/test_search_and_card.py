from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from tests.test_graph import _install_graph
from tests.test_ingest import _github, _register
from tests.test_proposals import _admin


def _assert_no_git_sha_keys(payload: object) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            assert "sha" not in str(key).lower()
            _assert_no_git_sha_keys(value)
    elif isinstance(payload, list):
        for item in payload:
            _assert_no_git_sha_keys(item)


async def test_search_highlights_without_card_body_for_guest(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    _install_graph(monkeypatch, _github())
    await _admin(admin, session_factory, "search-admin")
    assert (await admin.post("/repository/connect")).status_code == 200
    assert (await admin.post("/index/rebuild", json={"target": "shared"})).status_code == 200

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with guest:
        empty = await guest.get("/search", params={"q": ""})
        assert empty.status_code == 200
        assert empty.json()["hits"] == []
        found = await guest.get("/search", params={"q": "card"})
        assert found.status_code == 200
        body = found.json()
        _assert_no_git_sha_keys(body)
        paths = {item["path"] for item in body["hits"]}
        assert "card.md" in paths
        assert (await guest.get("/cards/card.md")).status_code == 401
        assert (await guest.get("/shared/notes/card.md")).status_code == 401

    card = await admin.get("/cards/card.md")
    assert card.status_code == 200
    assert card.json()["path"] == "card.md"
    assert "See [[missing]]" in card.json()["body"]
    _assert_no_git_sha_keys({k: v for k, v in card.json().items() if k != "content_hash"})
