from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from tests.test_ingest import _connect_pair, _github, _install, _register
from tests.test_obsidian_integration import _auth, _token
from tests.test_proposals import _admin, _second


async def test_editor_tag_grant_filters_queue_and_files(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = (
        "---\ntitle: Card\ntags: [src]\n---\n# Personal card\n"
    )
    github.repos["vgdnet/guide_psy"].files["other.md"] = (
        "---\ntitle: Other\ntags: [beta]\n---\n# Other\n"
    )
    await _admin(admin, session_factory, "grant-admin")

    author = await _second("efimov")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    created = await author.post(
        "/proposals",
        json={
            "paths": ["card.md", "other.md"],
            "summary": "Two tagged notes",
            "expected_sha": github.repos["vgdnet/guide_psy"].sha,
        },
    )
    assert created.status_code == 200, created.text
    proposal_id = created.json()["id"]

    editor = await _second("sliced")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "sliced")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200

    empty = await admin.patch(f"/admin/users/{editor_id}/editor-tags", json={"tags": []})
    assert empty.status_code == 200
    assert empty.json()["editor_tags"] == []
    none = await editor.get("/proposals")
    assert none.status_code == 200
    assert none.json()["proposals"] == []
    assert none.json()["editorial_queue_mode"] == "none"
    assert none.json()["has_editorial_grants"] is False

    granted = await admin.patch(
        f"/admin/users/{editor_id}/editor-tags", json={"tags": ["SRC", " src "]}
    )
    assert granted.status_code == 200
    assert granted.json()["editor_tags"] == ["src"]
    listed_tags = await admin.get(f"/admin/grants?user_id={editor_id}&kind=tag")
    assert listed_tags.status_code == 200
    assert [item["value"] for item in listed_tags.json()["grants"]] == ["src"]

    listed = await editor.get("/proposals")
    assert listed.status_code == 200
    assert listed.json()["editorial_queue_mode"] == "granted"
    assert listed.json()["has_editorial_grants"] is True
    assert len(listed.json()["proposals"]) == 1
    assert listed.json()["proposals"][0]["paths"] == ["card.md"]

    detail = await editor.get(f"/proposals/{proposal_id}")
    assert detail.status_code == 200
    assert [item["path"] for item in detail.json()["diff"]] == ["card.md"]

    allowed = await editor.get(f"/proposals/{proposal_id}/files/card.md")
    assert allowed.status_code == 200
    denied = await editor.get(f"/proposals/{proposal_id}/files/other.md")
    assert denied.status_code == 403

    blocked = await editor.post(
        f"/proposals/{proposal_id}/resolve",
        json={"files": [{"path": "other.md", "source": "# No\n"}], "reason": "out of grant"},
    )
    assert blocked.status_code == 403
    mixed = await editor.post(
        f"/proposals/{proposal_id}/approve", json={"reason": ""}
    )
    assert mixed.status_code == 403

    admin_list = await admin.get("/proposals")
    assert admin_list.status_code == 200
    assert admin_list.json()["editorial_queue_mode"] == "all"
    assert set(admin_list.json()["proposals"][0]["paths"]) == {"card.md", "other.md"}

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(guest, "plain")
    forbidden = await guest.patch(
        f"/admin/users/{editor_id}/editor-tags", json={"tags": ["src"]}
    )
    assert forbidden.status_code == 403
    editor_create = await editor.post(
        "/admin/grants",
        json={"user_id": editor_id, "kind": "path", "value": "card.md"},
    )
    assert editor_create.status_code == 403


async def test_path_and_prefix_grants_and_plugin_sync(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/rhizome"].files["психология/note.md"] = (
        "---\ntitle: Psy\ntags: [clinic]\n---\n# Psy\n"
    )
    github.repos["vgdnet/guide_psy"].files["card.md"] = (
        github.repos["vgdnet/rhizome"].files["card.md"]
    )
    github.repos["vgdnet/guide_psy"].files["source.md"] = "# Different\n"
    await _admin(admin, session_factory, "grant-admin", github)

    editor = await _second("folder-ed")
    users = await admin.get("/admin/users")
    editor_id = next(
        item["id"] for item in users.json()["users"] if item["username"] == "folder-ed"
    )
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200

    created_path = await admin.post(
        "/admin/grants",
        json={"user_id": editor_id, "kind": "path", "value": "card.md"},
    )
    assert created_path.status_code == 201, created_path.text
    created_prefix = await admin.post(
        "/admin/grants",
        json={"user_id": editor_id, "kind": "prefix", "value": "психология"},
    )
    assert created_prefix.status_code == 201, created_prefix.text
    assert created_prefix.json()["value"] == "психология/"
    duplicate = await admin.post(
        "/admin/grants",
        json={"user_id": editor_id, "kind": "prefix", "value": "психология/"},
    )
    assert duplicate.status_code == 409

    catalog = await admin.get("/admin/grants/catalog")
    assert catalog.status_code == 200
    assert "card.md" in catalog.json()["paths"]
    assert "психология/" in catalog.json()["prefixes"]
    cards = {item["path"]: item["title"] for item in catalog.json()["cards"]}
    assert "card.md" in cards
    assert cards["card.md"]

    filtered = await admin.get("/admin/grants/catalog", params={"q": "психология"})
    assert filtered.status_code == 200
    assert "психология/note.md" in filtered.json()["paths"]
    assert "психология/" in filtered.json()["prefixes"]
    assert "card.md" not in filtered.json()["paths"]

    if "clinic" in catalog.json()["tags"]:
        tagged = await admin.get("/admin/grants/catalog", params={"tag": "clinic"})
        assert tagged.status_code == 200
        assert "психология/note.md" in tagged.json()["paths"]
        assert "card.md" not in tagged.json()["paths"]

    nick = await admin.get("/admin/users", params={"q": "folder-ed"})
    assert nick.status_code == 200
    assert nick.json()["total"] == 1
    row = nick.json()["users"][0]
    assert row["username"] == "folder-ed"
    assert row["role"] == "editor"
    assert row["is_active"] is True
    grant_values = {(item["kind"], item["value"]) for item in row["grants"]}
    assert ("path", "card.md") in grant_values
    assert ("prefix", "психология/") in grant_values

    by_card = await admin.get("/admin/grants?kind=path&value=card.md")
    assert by_card.status_code == 200
    assert by_card.json()["total"] == 1
    assert by_card.json()["grants"][0]["username"] == "folder-ed"

    token = await _token(editor)
    listed = await editor.get(
        "/integrations/obsidian/v1/granted", headers=_auth(token["token"])
    )
    assert listed.status_code == 200, listed.text
    paths = {item["path"] for item in listed.json()["items"]}
    assert "card.md" in paths
    assert "психология/note.md" in paths
    assert "source.md" not in paths

    denied = await editor.get(
        "/integrations/obsidian/v1/granted/files/content",
        params={"path": "source.md"},
        headers=_auth(token["token"]),
    )
    assert denied.status_code in {403, 404}

    body = await editor.get(
        "/integrations/obsidian/v1/granted/files/content",
        params={"path": "card.md"},
        headers=_auth(token["token"]),
    )
    assert body.status_code == 200, body.text
    assert b"# Card" in body.content

    put = await editor.put(
        "/integrations/obsidian/v1/granted/files",
        params={"path": "card.md"},
        headers={**_auth(token["token"]), "Content-Type": "application/octet-stream"},
        content="# Local first\n".encode("utf-8"),
    )
    assert put.status_code == 200, put.text
    assert put.json()["path"] == "card.md"

    again = await editor.get(
        "/integrations/obsidian/v1/granted/files/content",
        params={"path": "card.md"},
        headers=_auth(token["token"]),
    )
    assert again.status_code == 200
    assert again.content.decode("utf-8") == "# Local first\n"

    removed = await admin.delete(f"/admin/grants/{created_path.json()['id']}")
    assert removed.status_code == 204
    after = await editor.get(
        "/integrations/obsidian/v1/granted/files/content",
        params={"path": "card.md"},
        headers=_auth(token["token"]),
    )
    assert after.status_code in {403, 404}


async def test_admin_sees_all_pending_editor_without_grants_empty_with_grant_match(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["match.md"] = "# Match\n"
    github.repos["vgdnet/guide_psy"].files["other.md"] = "# Other\n"
    await _admin(admin, session_factory, "queue-scope-admin")

    author = await _second("author-q")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    created = await author.post(
        "/proposals",
        json={"paths": ["match.md", "other.md"], "summary": "Two notes", "expected_sha": github.repos["vgdnet/guide_psy"].sha},
    )
    assert created.status_code == 200, created.text
    proposal_id = created.json()["id"]

    admin_secret = (await _token(admin))["token"]
    admin_caps = await admin.get(
        "/integrations/obsidian/v1/capabilities", headers=_auth(admin_secret)
    )
    assert admin_caps.status_code == 200
    assert admin_caps.json()["editorial_queue_mode"] == "all"
    assert admin_caps.json()["can_see_queue"] is True
    admin_list = await admin.get("/proposals")
    assert admin_list.status_code == 200
    assert admin_list.json()["editorial_queue_mode"] == "all"
    assert {item["id"] for item in admin_list.json()["proposals"]} == {proposal_id}
    assert set(admin_list.json()["proposals"][0]["paths"]) == {"match.md", "other.md"}

    editor = await _second("grantless-ed")
    users = await admin.get("/admin/users")
    editor_id = next(
        item["id"] for item in users.json()["users"] if item["username"] == "grantless-ed"
    )
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200

    empty = await editor.get("/proposals")
    assert empty.status_code == 200
    assert empty.json()["proposals"] == []
    assert empty.json()["editorial_queue_mode"] == "none"
    assert empty.json()["has_editorial_grants"] is False
    editor_secret = (await _token(editor))["token"]
    editor_caps = await editor.get(
        "/integrations/obsidian/v1/capabilities", headers=_auth(editor_secret)
    )
    assert editor_caps.status_code == 200
    assert editor_caps.json()["editorial_queue_mode"] == "none"
    assert editor_caps.json()["has_editorial_grants"] is False
    granted = await editor.get(
        "/integrations/obsidian/v1/granted", headers=_auth(editor_secret)
    )
    assert granted.status_code == 200
    assert granted.json()["items"] == []

    created_grant = await admin.post(
        "/admin/grants",
        json={"user_id": editor_id, "kind": "path", "value": "match.md"},
    )
    assert created_grant.status_code == 201, created_grant.text

    listed = await editor.get("/proposals")
    assert listed.status_code == 200
    assert listed.json()["editorial_queue_mode"] == "granted"
    assert listed.json()["has_editorial_grants"] is True
    assert len(listed.json()["proposals"]) == 1
    assert listed.json()["proposals"][0]["id"] == proposal_id
    assert listed.json()["proposals"][0]["paths"] == ["match.md"]
    after_caps = await editor.get(
        "/integrations/obsidian/v1/capabilities", headers=_auth(editor_secret)
    )
    assert after_caps.json()["editorial_queue_mode"] == "granted"
    assert after_caps.json()["has_editorial_grants"] is True
