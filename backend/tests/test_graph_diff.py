from uuid import UUID

from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models.github import SharedRepository
from app.models.user import User
from app.services.github import GitHubAppError
from app.models.proposal import Proposal, ProposalStatus
from app.services.graph_diff import build_snapshot, compare_snapshots
from app.services.repository import SHARED_SINGLETON_ID
from tests.test_ingest import _connect_pair, _github, _install
from tests.test_proposals import _admin, _assert_hidden, _second


async def _set_role(session_factory: async_sessionmaker[AsyncSession], username: str, role: str) -> None:
    async with session_factory() as database:
        user = await database.scalar(select(User).where(User.username == username))
        assert user is not None
        user.role = role
        await database.commit()


def test_snapshot_diff_covers_structure_and_content() -> None:
    base = build_snapshot(
        {
            "card.md": "---\ntags: [src]\n---\n# Card\nSee [[missing]].\n",
            "source.md": "# Source\n",
            "old.md": "# Same body\n",
        }
    )
    head = build_snapshot(
        {
            "card.md": "---\ntags: [src, extra]\n---\n# Card\nSee [[missing]].\n",
            "missing.md": "# Missing\n",
            "source.md": "# Source\nNow [source](source.md) links to itself.\n",
            "fresh.md": "# Fresh\nSee [[card]].\n",
            "renamed.md": "# Same body\n",
        }
    )
    payload = compare_snapshots(
        base,
        head,
        proposal_id="p1",
        status="open",
        stale=False,
        conflicted=False,
        complete=True,
        limit=50,
    )
    assert payload["complete"] is True
    assert payload["empty"] is False
    assert payload["no_structural_change"] is False
    summary = payload["summary"]
    assert summary["nodes_added"] == 2
    assert summary["nodes_renamed"] == 1
    assert summary["tags_added"] == 1
    assert summary["unresolved_resolved"] >= 1
    kinds = {item["kind"] for item in payload["changes"]}
    assert "added" in kinds
    assert "renamed" in kinds
    assert "tags" in kinds
    second = compare_snapshots(
        base,
        head,
        proposal_id="p1",
        status="open",
        stale=False,
        conflicted=False,
        complete=True,
        limit=50,
    )
    assert payload["summary"] == second["summary"]
    assert {(node["path"], node["change"]) for node in payload["nodes"]} == {
        (node["path"], node["change"]) for node in second["nodes"]
    }


def test_content_only_and_identical_snapshots() -> None:
    files = {"note.md": "---\ntags: [a]\n---\n# Note\nSee [[gone]].\n"}
    same = compare_snapshots(
        build_snapshot(files),
        build_snapshot(files),
        proposal_id="p1",
        status="open",
        stale=False,
        conflicted=False,
        complete=True,
        limit=50,
    )
    assert same["empty"] is True
    assert same["no_structural_change"] is False
    assert same["summary"]["nodes_modified"] == 0

    changed = compare_snapshots(
        build_snapshot(files),
        build_snapshot({"note.md": "---\ntags: [a]\n---\n# Note\nSee [[gone]].\nParagraph.\n"}),
        proposal_id="p1",
        status="open",
        stale=False,
        conflicted=False,
        complete=True,
        limit=50,
    )
    assert changed["empty"] is False
    assert changed["no_structural_change"] is True
    assert changed["summary"]["nodes_content_only"] == 1
    assert changed["summary"]["nodes_modified"] == 1


async def test_graph_diff_author_editor_and_hidden_fields(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["already.md"] = "# Mine\nSee [[card]].\n"
    github.repos["vgdnet/guide_psy"].files["card.md"] = (
        "---\ntitle: Card\ntags: [src, extra]\n---\n# Card\nSee [[source]].\n"
    )
    await _admin(admin, session_factory, "diff-admin")

    author = await _second("efimov")
    await _connect_pair(author, "vgdnet/guide_psy")
    created = await author.post("/proposals", json={"paths": ["already.md", "card.md"]})
    assert created.status_code == 200
    proposal_id = created.json()["id"]

    own = await author.get("/graph/diff", params={"proposal_id": proposal_id})
    assert own.status_code == 200
    body = own.json()
    _assert_hidden(own.text)
    assert body["proposal_id"] == proposal_id
    assert body["complete"] is True
    assert body["empty"] is False
    assert body["summary"]["nodes_added"] == 1
    paths = {node["path"]: node["change"] for node in body["nodes"]}
    assert paths.get("already.md") == "added"
    assert "triangle" in {node["marker"] for node in body["nodes"]}

    stranger = await _second("bystander")
    forbidden = await stranger.get("/graph/diff", params={"proposal_id": proposal_id})
    assert forbidden.status_code == 404

    editor = await _second("queue-editor")
    await _set_role(session_factory, "queue-editor", "editor")
    reviewed = await editor.get("/graph/diff", params={"proposal_id": proposal_id})
    assert reviewed.status_code == 200
    assert reviewed.json()["proposal_id"] == proposal_id

    reads_after_editor = github.file_reads
    cached = await editor.get("/graph/diff", params={"proposal_id": proposal_id})
    assert cached.status_code == 200
    assert github.file_reads == reads_after_editor

    admin_view = await admin.get("/graph/diff", params={"proposal_id": proposal_id})
    assert admin_view.status_code == 200

    tiny = await author.get("/graph/diff", params={"proposal_id": proposal_id, "limit": 1})
    assert tiny.status_code == 200
    assert tiny.json()["truncated"] is True
    assert len(tiny.json()["nodes"]) == 1

    anonymous = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    assert (await anonymous.get("/graph/diff", params={"proposal_id": proposal_id})).status_code == 401


async def test_graph_diff_stale_incomplete_and_type_change(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = (
        "---\ntitle: Card\ntags: [src]\n---\n# Card\nSee [missing](missing.md).\n"
    )
    await _admin(admin, session_factory, "stale-admin")
    author = await _second("writer")
    await _connect_pair(author, "vgdnet/guide_psy")
    created = await author.post("/proposals", json={"paths": ["card.md"]})
    assert created.status_code == 200
    proposal_id = created.json()["id"]

    typed = await author.get("/graph/diff", params={"proposal_id": proposal_id})
    assert typed.status_code == 200
    assert typed.json()["summary"]["edges_type_changed"] >= 1

    async with session_factory() as database:
        shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
        assert shared is not None
        shared.observed_sha = "shared-moved"
        shared.indexed_sha = "shared-moved"
        await database.commit()
    stale = await author.get("/graph/diff", params={"proposal_id": proposal_id})
    assert stale.status_code == 200
    assert stale.json()["stale"] is True

    original_get = github.get_file

    async def boom(owner: str, name: str, path: str, ref: str) -> str:
        if ref != "shared-sha":
            raise GitHubAppError("unavailable", "git is unavailable")
        return await original_get(owner, name, path, ref)

    monkeypatch.setattr(github, "get_file", boom)
    incomplete = await author.get("/graph/diff", params={"proposal_id": proposal_id, "limit": 3})
    assert incomplete.status_code == 200
    body = incomplete.json()
    assert body["complete"] is False
    assert body["empty"] is False
    assert body["nodes"] == []
    assert body["changes"][0]["kind"] == "incomplete"
    _assert_hidden(incomplete.text)

    async with session_factory() as database:
        proposal = await database.get(Proposal, UUID(proposal_id))
        assert proposal is not None
        proposal.status = ProposalStatus.CONFLICTED.value
        await database.commit()
    monkeypatch.setattr(github, "get_file", original_get)
    conflicted = await author.get("/graph/diff", params={"proposal_id": proposal_id})
    assert conflicted.status_code == 200
    assert conflicted.json()["conflicted"] is True


def test_edge_removal_direction_properties_and_parse_warnings() -> None:
    base = build_snapshot(
        {
            "a.md": "---\naliases: [old]\n---\n# A\nSee [[b]].\nSee [[c]].\n",
            "b.md": "# B\nSee [[gone]].\n",
            "c.md": "# C\n",
            "gone.md": "# Gone\n",
        }
    )
    head = build_snapshot(
        {
            "a.md": "---\naliases: [new]\n---\n# A\n",
            "b.md": "# B\nSee [[a]].\nSee [[gone]].\n",
            "c.md": "# C\n",
        }
    )
    payload = compare_snapshots(
        base,
        head,
        proposal_id="p2",
        status="open",
        stale=False,
        conflicted=False,
        complete=True,
        limit=50,
    )
    summary = payload["summary"]
    assert summary["edges_removed"] >= 1
    assert summary["edges_direction_changed"] >= 1
    assert summary["resolved_unresolved"] >= 1
    kinds = {item["kind"] for item in payload["changes"]}
    assert "edge_removed" in kinds
    assert "direction_changed" in kinds
    assert "resolved_unresolved" in kinds
    assert any("properties" in item["detail"] for item in payload["changes"] if item["kind"] == "modified")

    bloated = "---\n" + ("k: " + ("x" * 90) + "\n") * 120 + "---\n# Broken\n"
    warned = build_snapshot({"broken.md": bloated})
    assert warned.parse_warnings >= 1
    rebuilt = build_snapshot({"broken.md": bloated})
    again = compare_snapshots(
        warned,
        rebuilt,
        proposal_id="p3",
        status="open",
        stale=False,
        conflicted=False,
        complete=warned.parse_warnings == 0,
        limit=50,
    )
    assert again["empty"] is True
