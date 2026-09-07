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
        assert body["layer"] == "shared"
        paths = {item["path"] for item in body["hits"]}
        assert "card.md" in paths
        assert all(item["layer"] == "shared" for item in body["hits"])
        assert all("body" not in item for item in body["hits"])
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


async def test_rebuild_drops_deleted_personal_from_search_cards_and_comments(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    from sqlalchemy import select

    from app.models.comment import NoteComment
    from tests.test_ingest import _connect_pair
    from tests.test_proposals import _second

    admin, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    gone = "аддик и адреналин.md"
    github.repos["vgdnet/guide_psy"].files[gone] = "# аддик и адреналин\nSee [[card]].\n"
    github.repos["vgdnet/guide_psy"].files["keep-personal.md"] = "# Keep\nSee [[card]].\n"
    github.repos["vgdnet/guide_psy"].sha = "personal-before-delete"
    await _admin(admin, session_factory, "rebuild-search-admin")

    author = await _second("vault-owner")
    await _connect_pair(author, "vgdnet/guide_psy")

    found = await author.get("/search", params={"q": "аддик"})
    assert found.status_code == 200
    assert f"personal:{gone}" in {item["path"] for item in found.json()["hits"]}

    commented = await author.post(
        f"/shared/notes/{gone}/comments",
        json={"body": "still here"},
    )
    assert commented.status_code == 200

    del github.repos["vgdnet/guide_psy"].files[gone]
    github.repos["vgdnet/guide_psy"].sha = "personal-after-delete"

    rebuilt = await admin.post("/index/rebuild", json={"target": "shared"})
    assert rebuilt.status_code == 200

    after = await author.get("/search", params={"q": "аддик"})
    assert after.status_code == 200
    assert f"personal:{gone}" not in {item["path"] for item in after.json()["hits"]}
    keep = await author.get("/search", params={"q": "Keep"})
    assert f"personal:keep-personal.md" in {item["path"] for item in keep.json()["hits"]}

    assert (await author.get(f"/cards/personal:{gone}")).status_code == 404
    missing = await author.post(
        f"/shared/notes/{gone}/comments",
        json={"body": "ghost"},
    )
    assert missing.status_code == 404
    assert missing.json()["detail"] == "note was not found"

    async with session_factory() as database:
        leftover = (
            await database.scalars(select(NoteComment).where(NoteComment.path == gone))
        ).all()
        assert leftover == []
    await author.aclose()


async def test_search_rebuilds_personal_when_git_sha_moves(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    from tests.test_ingest import _connect_pair
    from tests.test_proposals import _second

    admin, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    gone = "ghost-search.md"
    github.repos["vgdnet/guide_psy"].files[gone] = "# Ghost search\n"
    github.repos["vgdnet/guide_psy"].sha = "search-before"
    await _admin(admin, session_factory, "search-sha-admin")
    author = await _second("search-sha-owner")
    await _connect_pair(author, "vgdnet/guide_psy")

    assert f"personal:{gone}" in {
        item["path"]
        for item in (await author.get("/search", params={"q": "Ghost", "layer": "personal"})).json()["hits"]
    }

    del github.repos["vgdnet/guide_psy"].files[gone]
    github.repos["vgdnet/guide_psy"].sha = "search-after"

    assert (await author.get(f"/cards/personal:{gone}")).status_code == 404
    after = await author.get("/search", params={"q": "Ghost", "layer": "personal"})
    assert after.status_code == 200
    assert f"personal:{gone}" not in {item["path"] for item in after.json()["hits"]}
    await author.aclose()


async def test_search_overlay_excludes_unlinked_personal(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    from tests.test_ingest import _connect_pair
    from tests.test_proposals import _second

    admin, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["mine.md"] = "# Mine\nSee [[card]].\n"
    github.repos["vgdnet/guide_psy"].files["alone.md"] = "# Alone vault note\nNo shared link.\n"
    github.repos["vgdnet/guide_psy"].sha = "layer-search-sha"
    await _admin(admin, session_factory, "layer-search-admin")
    author = await _second("layer-search-owner")
    await _connect_pair(author, "vgdnet/guide_psy")

    overlay = await author.get("/search", params={"q": "Alone", "layer": "overlay"})
    assert overlay.status_code == 200
    assert f"personal:alone.md" not in {item["path"] for item in overlay.json()["hits"]}

    personal = await author.get("/search", params={"q": "Alone", "layer": "personal"})
    assert personal.status_code == 200
    assert f"personal:alone.md" in {item["path"] for item in personal.json()["hits"]}

    stitched = await author.get("/search", params={"q": "Mine", "layer": "overlay"})
    assert f"personal:mine.md" in {item["path"] for item in stitched.json()["hits"]}

    graph = await author.get("/graph/personal")
    assert graph.status_code == 200
    assert graph.json()["layer"] == "personal"
    paths = {node["path"] for node in graph.json()["nodes"]}
    assert "alone.md" in paths
    assert "mine.md" in paths

    gone = await author.delete("/personal/connect")
    assert gone.status_code == 200
    cleared = await author.get("/search", params={"q": "Alone", "layer": "personal"})
    assert f"personal:alone.md" not in {item["path"] for item in cleared.json()["hits"]}
    graph_after = await author.get("/graph/personal")
    assert "alone.md" not in {node["path"] for node in graph_after.json()["nodes"]}
    await author.aclose()


async def test_visible_search_scopes_by_role_and_marks_layer(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    from tests.test_ingest import _connect_pair
    from tests.test_proposals import _second

    admin, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["alone.md"] = "# Alone vault note\nNo shared link.\n"
    github.repos["vgdnet/guide_psy"].files["offer.md"] = "# Offer card\nSee [[card]].\n"
    github.repos["vgdnet/guide_psy"].sha = "visible-search-sha"
    await _admin(admin, session_factory, "visible-search-admin")
    author = await _second("visible-search-owner")
    await _connect_pair(author, "vgdnet/guide_psy")

    own = await author.get("/search", params={"q": "Alone"})
    assert own.status_code == 200
    assert own.json()["layer"] == "visible"
    own_hits = {item["path"]: item for item in own.json()["hits"]}
    assert "personal:alone.md" in own_hits
    assert own_hits["personal:alone.md"]["layer"] == "personal"

    stranger = await _second("visible-stranger")
    hidden = await stranger.get("/search", params={"q": "Alone"})
    assert hidden.json()["layer"] == "visible"
    assert "personal:alone.md" not in {item["path"] for item in hidden.json()["hits"]}
    owner_id = next(
        item["id"]
        for item in (await admin.get("/admin/users")).json()["users"]
        if item["username"] == "visible-search-owner"
    )
    foreign_as_user = await stranger.get(f"/cards/personal:{owner_id}:alone.md")
    assert foreign_as_user.status_code == 404
    assert "Alone vault note" not in foreign_as_user.text

    created = await author.post(
        "/proposals",
        json={"paths": ["offer.md"], "summary": "Offer this card", "expected_sha": github.repos["vgdnet/guide_psy"].sha},
    )
    assert created.status_code == 200
    proposal_id = created.json()["id"]

    editor = await _second("visible-editor")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "visible-editor")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200

    reviewed = await editor.get("/search", params={"q": "Offer"})
    assert reviewed.status_code == 200
    review_hits = {item["path"]: item for item in reviewed.json()["hits"]}
    proposal_path = f"proposal:{proposal_id}:offer.md"
    assert proposal_path in review_hits
    assert review_hits[proposal_path]["layer"] == "proposal"
    card = await editor.get(f"/cards/{proposal_path}")
    assert card.status_code == 200
    assert "Offer card" in card.json()["title"] or "Offer" in card.json()["body"]

    as_user = await stranger.get("/search", params={"q": "Offer"})
    assert proposal_path not in {item["path"] for item in as_user.json()["hits"]}

    admin_hits = {item["path"]: item for item in (await admin.get("/search", params={"q": "Alone"})).json()["hits"]}
    foreign = f"personal:{owner_id}:alone.md"
    assert foreign in admin_hits
    assert admin_hits[foreign]["layer"] == "personal"
    opened = await admin.get(f"/cards/{foreign}")
    assert opened.status_code == 200
    assert "Alone vault note" in opened.json()["body"] or opened.json()["title"]
    await author.aclose()
    await stranger.aclose()
    await editor.aclose()
