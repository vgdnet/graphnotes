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
        assert "src" in body["available_tags"]
        tagged = await guest.get("/search", params={"tag": "src"})
        assert tagged.status_code == 200
        assert "card.md" in {item["path"] for item in tagged.json()["hits"]}
        by_tag_text = await guest.get("/search", params={"q": "src"})
        assert "card.md" in {item["path"] for item in by_tag_text.json()["hits"]}
        assert (await guest.get("/cards/card.md")).status_code == 401
        assert (await guest.get("/shared/notes/card.md")).status_code == 401

    card = await admin.get("/cards/card.md")
    assert card.status_code == 200
    assert card.json()["path"] == "card.md"
    assert "See [[missing]]" in card.json()["body"]
    _assert_no_git_sha_keys({k: v for k, v in card.json().items() if k != "content_hash"})


async def test_encoded_personal_card_unicode_path(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    from urllib.parse import quote

    from tests.test_ingest import _connect_pair

    admin, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    await _admin(admin, session_factory, "unicode-card-admin")
    note_path = "вариант Б — конспекты/Паранойя (Б).md"
    github.repos["vgdnet/guide_psy"].files[note_path] = (
        "# Паранойя (Б)\n\n#inline-tag\nSee [[already]].\n"
    )
    github.repos["vgdnet/guide_psy"].sha = "unicode-personal-card"
    await _connect_pair(admin, "vgdnet/guide_psy")

    prefixed = f"personal:{note_path}"
    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with guest:
        assert (await guest.get(f"/cards/{prefixed}")).status_code == 401

    card = await admin.get(f"/cards/{prefixed}")
    assert card.status_code == 200
    assert card.json()["path"] == note_path
    assert "#inline-tag" in card.json()["body"]
    _assert_no_git_sha_keys({k: v for k, v in card.json().items() if k != "content_hash"})

    encoded_keep_slash = quote(prefixed, safe="/:")
    via_encode_uri = await admin.get(f"/cards/{encoded_keep_slash}")
    assert via_encode_uri.status_code == 200
    assert via_encode_uri.json()["path"] == note_path

    personal = await admin.get(f"/personal/notes/{note_path}")
    assert personal.status_code == 200
    assert personal.json()["path"] == note_path
