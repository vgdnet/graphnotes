from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.test_ingest import _connect_pair, _github, _install
from tests.test_proposals import _admin, _second


def _assert_hidden(payload: str) -> None:
    folded = payload.casefold()
    assert "html_url" not in folded
    assert "head_sha" not in folded
    assert "base_sha" not in folded
    assert "merged_sha" not in folded
    assert "gn-p-" not in folded
    assert "github.com" not in folded


async def test_contributions_me_marks_open_proposal_paths_as_proposed(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())

    github.repos["vgdnet/guide_psy"].files["card.md"] = (
        "---\ntitle: Card\ntags: [src]\n---\n# Card\nSee [[source]].\n"
    )

    await _admin(admin, session_factory, "contrib-admin")

    author = await _second("efimov")
    await _connect_pair(author, "vgdnet/guide_psy")

    created = await author.post("/proposals", json={"paths": ["already.md", "card.md"]})
    assert created.status_code == 200
    proposal_id = created.json()["id"]

    body = (await author.get("/contributions/me")).json()
    _assert_hidden((await author.get("/contributions/me")).text)
    assert set(body.keys()) >= {"notes", "edges", "proposals", "stats"}
    assert body["review"] is None
    assert len(body["proposals"]) == 1
    assert body["proposals"][0]["id"] == proposal_id
    assert body["proposals"][0]["status"] == "open"

    nodes_by_path = {node["path"]: node for node in body["notes"]}
    assert nodes_by_path["already.md"]["state"] == "proposed"
    assert nodes_by_path["card.md"]["state"] == "proposed"
    assert body["stats"]["notes"] >= 2
    assert body["stats"]["added"] >= 2
    assert body["stats"]["accepted"] == 0


async def test_contribution_stats_are_scoped_by_role(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\nSee [[already]].\n"
    await _admin(admin, session_factory, "stats-admin")

    author = await _second("author")
    await _connect_pair(author, "vgdnet/guide_psy")
    created = await author.post("/proposals", json={"paths": ["already.md", "card.md"]})
    assert created.status_code == 200
    proposal_id = created.json()["id"]

    editor = await _second("reviewer")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "reviewer")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200

    other_editor = await _second("other-editor")
    other_id = next(item["id"] for item in (await admin.get("/admin/users")).json()["users"] if item["username"] == "other-editor")
    assert (await admin.patch(f"/admin/users/{other_id}", json={"role": "editor"})).status_code == 200

    bystander = await _second("bystander")

    assert (await author.get("/admin/contributions")).status_code == 403
    assert (await editor.get("/admin/contributions")).status_code == 403
    assert (await bystander.get("/admin/contributions")).status_code == 403

    published = await editor.post(f"/proposals/{proposal_id}/approve", json={"reason": ""})
    assert published.status_code == 200

    author_body = (await author.get("/contributions/me")).json()
    _assert_hidden((await author.get("/contributions/me")).text)
    assert author_body["review"] is None
    assert author_body["stats"]["accepted"] >= 1
    author_paths = {node["path"] for node in author_body["notes"]}
    assert "already.md" in author_paths
    assert author_body["stats"]["links"] >= 1

    bystander_body = (await bystander.get("/contributions/me")).json()
    bystander_paths = {node["path"] for node in bystander_body["notes"]}
    assert "already.md" not in bystander_paths
    assert bystander_body["stats"]["notes"] == 0
    assert bystander_body["review"] is None

    editor_body = (await editor.get("/contributions/me")).json()
    _assert_hidden((await editor.get("/contributions/me")).text)
    assert editor_body["review"] is not None
    assert editor_body["review"]["accepted"] >= 1
    editor_proposal_ids = {item["proposal_id"] for item in editor_body["review"]["decisions"]}
    assert proposal_id in editor_proposal_ids
    decided_paths = {path for item in editor_body["review"]["decisions"] for path in item["paths"]}
    assert "already.md" in decided_paths
    assert "author" not in {node["path"] for node in editor_body["notes"]}

    other_body = (await other_editor.get("/contributions/me")).json()
    assert other_body["review"] is not None
    assert other_body["review"]["accepted"] == 0
    assert other_body["review"]["decisions"] == []

    listing = await admin.get("/admin/contributions")
    assert listing.status_code == 200
    _assert_hidden(listing.text)
    rows = {item["user"]["username"]: item for item in listing.json()["users"]}
    assert rows["author"]["stats"]["accepted"] >= 1
    assert rows["author"]["review"] is None
    assert any(node["path"] == "already.md" for node in rows["author"]["notes"])
    assert rows["reviewer"]["review"] is not None
    assert rows["reviewer"]["review"]["accepted"] >= 1
    assert rows["other-editor"]["review"]["accepted"] == 0
    assert rows["bystander"]["stats"]["notes"] == 0
    await author.aclose()
    await editor.aclose()
    await other_editor.aclose()
    await bystander.aclose()
