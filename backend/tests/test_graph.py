from datetime import UTC, datetime
import time
import uuid

from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import graph as graph_api
from app.api import notes as notes_api
from app.api import repository as repository_api
from app.main import app
from app.models.graph import NoteIndex, NoteLayer, SyncJob, SyncJobStatus
from app.services.admin import bootstrap_admin
from app.services.github import GitHubAppError
from app.services.index import rebuild_shared
from app.services.repository import refresh_shared
from sqlalchemy import func, select
from tests.test_ingest import MemoryGitHub, MemoryRepo, _connect_pair, _github, _install, _register


def _install_graph(monkeypatch: MonkeyPatch, github: MemoryGitHub) -> MemoryGitHub:
    _install(monkeypatch, github)
    monkeypatch.setattr(graph_api, "_client", lambda: github)
    monkeypatch.setattr(notes_api, "_client", lambda: github)
    monkeypatch.setattr(repository_api, "_client", lambda: github)
    return github


def _snapshot(nodes: list[dict], edges: list[dict]) -> tuple:
    return (
        tuple(sorted((n["path"], n["title"], n["unresolved"]) for n in nodes)),
        tuple(sorted((e["source"], e["target"], e["type"], e["unresolved"]) for e in edges)),
    )


async def test_shared_graph_rebuild_is_deterministic(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    github.repos["vgdnet/rhizome"].files["cycle-a.md"] = "# A\nSee [[cycle-b]].\n"
    github.repos["vgdnet/rhizome"].files["cycle-b.md"] = "# B\nSee [[cycle-a]].\n"
    github.repos["vgdnet/rhizome"].files["lonely.md"] = "# Lonely\n"
    await _register(client, "admin-user")
    async with session_factory() as database:
        await bootstrap_admin(database, "admin-user")
    assert (await client.post("/repository/connect")).status_code == 200

    first = await client.get("/graph/shared")
    assert first.status_code == 200
    body = first.json()
    assert body["layer"] == "shared"
    assert body["index_status"] == "current"
    assert "html_url" not in first.text
    paths = {node["path"] for node in body["nodes"]}
    assert "card.md" in paths
    assert any(edge["unresolved"] for edge in body["edges"])
    cycle = {(edge["source"], edge["target"]) for edge in body["edges"] if not edge["unresolved"]}
    assert ("cycle-a.md", "cycle-b.md") in cycle
    assert ("cycle-b.md", "cycle-a.md") in cycle
    lonely = next(node for node in body["nodes"] if node["path"] == "lonely.md")
    assert lonely["isolated"] is True

    rebuilt = await client.post("/index/rebuild", json={"target": "shared"})
    assert rebuilt.status_code == 200
    assert _snapshot(first.json()["nodes"], first.json()["edges"]) == _snapshot(
        rebuilt.json()["nodes"], rebuilt.json()["edges"]
    )

    async with session_factory() as database:
        count = await database.scalar(
            select(func.count()).select_from(NoteIndex).where(NoteIndex.layer == NoteLayer.SHARED.value)
        )
        assert count == len([node for node in body["nodes"] if not node["unresolved"]])
        for note in (await database.scalars(select(NoteIndex))).all():
            assert not hasattr(note, "body")
            assert "content" not in note.__dict__ or "---" not in str(note.content_hash)


async def test_personal_isolation_and_obsidian_sha_refresh(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    first, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    await _register(first, "efimov")
    async with session_factory() as database:
        await bootstrap_admin(database, "efimov")
    assert (await first.post("/repository/connect")).status_code == 200
    github.repos["vgdnet/guide_psy"].files["card.md"] = github.repos["vgdnet/rhizome"].files["card.md"]
    github.repos["vgdnet/guide_psy"].sha = "with-card"
    await _connect_pair(first, "vgdnet/guide_psy")

    mine = await first.get("/graph/personal")
    assert mine.status_code == 200
    assert any(node["path"] == "card.md" for node in mine.json()["nodes"])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as second:
        await _register(second, "other-user")
        await _connect_pair(second, "other/vault")
        other = await second.get("/graph/personal")
        assert other.status_code == 200
        assert other.json()["nodes"] == []
        stolen = await second.get("/graph/personal")
        assert "card.md" not in {node["path"] for node in stolen.json()["nodes"]}

    github.repos["vgdnet/guide_psy"].files["from-obsidian.md"] = "# From Obsidian\nLinked to [[card]].\n"
    github.repos["vgdnet/guide_psy"].sha = "obsidian-sha"
    refreshed = await first.get("/graph/personal")
    assert refreshed.status_code == 200
    paths = {node["path"] for node in refreshed.json()["nodes"]}
    assert "from-obsidian.md" in paths
    status = await first.get("/repository/status")
    assert status.json()["personal"]["index_status"] == "current"


async def test_graph_bounds_and_user_cannot_rebuild(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    github = _install_graph(
        monkeypatch,
        MemoryGitHub(
            {
                "vgdnet/rhizome": MemoryRepo(
                    owner="vgdnet",
                    name="rhizome",
                    files={f"n{i:02d}.md": f"# N{i}\n" for i in range(30)},
                    sha="big-sha",
                )
            }
        ),
    )
    await _register(client, "plain")
    denied = await client.post("/index/rebuild", json={"target": "shared"})
    assert denied.status_code == 403
    async with session_factory() as database:
        await bootstrap_admin(database, "plain")
    assert (await client.post("/repository/connect")).status_code == 200
    bounded = await client.get("/graph/shared", params={"limit": 10})
    assert bounded.status_code == 200
    real_nodes = [node for node in bounded.json()["nodes"] if not node["unresolved"]]
    assert len(real_nodes) == 10
    assert bounded.json()["truncated"] is True


async def _admin_connect(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    username: str = "admin-user",
) -> None:
    await _register(client, username)
    async with session_factory() as database:
        await bootstrap_admin(database, username)
    assert (await client.post("/repository/connect")).status_code == 200


async def test_incremental_rebuild_matches_full_and_reads_fewer_files(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    await _admin_connect(client, session_factory)
    assert (await client.get("/graph/shared")).status_code == 200

    github.repos["vgdnet/rhizome"].files["card.md"] = (
        "---\ntitle: Card\ntags: [src]\n---\n# Card\nSee [[source]].\n"
    )
    github.repos["vgdnet/rhizome"].sha = "shared-sha-2"
    async with session_factory() as database:
        await refresh_shared(database, github)
        github.file_reads = 0
        await rebuild_shared(database, github, paths={"card.md"})
        incremental_reads = github.file_reads
    incremental = await client.get("/graph/shared")
    async with session_factory() as database:
        github.file_reads = 0
        await rebuild_shared(database, github)
        full_reads = github.file_reads
    full = await client.get("/graph/shared")
    assert incremental.status_code == 200
    assert _snapshot(incremental.json()["nodes"], incremental.json()["edges"]) == _snapshot(
        full.json()["nodes"], full.json()["edges"]
    )
    assert incremental_reads == 1
    assert full_reads == 2
    assert any(
        edge["source"] == "card.md" and edge["target"] == "source.md"
        for edge in full.json()["edges"]
    )


async def test_unresolved_delete_rename_self_and_duplicate_links(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    github.repos["vgdnet/rhizome"].files["source.md"] = "# Source\nSee [[card]].\n"
    github.repos["vgdnet/rhizome"].files["loop.md"] = "# Loop\n[[loop]] [[loop]] [[card]] [[card]]\n"
    await _admin_connect(client, session_factory)
    first = await client.get("/graph/shared")
    assert first.status_code == 200
    assert any(edge["unresolved"] for edge in first.json()["edges"])
    loop_edges = [
        edge
        for edge in first.json()["edges"]
        if edge["source"] == "loop.md" and not edge["unresolved"]
    ]
    assert {edge["target"] for edge in loop_edges} == {"loop.md", "card.md"}
    assert len(loop_edges) == 2

    github.repos["vgdnet/rhizome"].files["missing.md"] = "# Missing\n"
    github.repos["vgdnet/rhizome"].sha = "sha-resolved"
    resolved = await client.get("/graph/shared")
    assert "missing.md" in {node["path"] for node in resolved.json()["nodes"]}
    assert not any(edge["target"] == "unresolved:missing" for edge in resolved.json()["edges"])

    del github.repos["vgdnet/rhizome"].files["source.md"]
    github.repos["vgdnet/rhizome"].sha = "sha-deleted"
    deleted = await client.get("/graph/shared")
    assert "source.md" not in {node["path"] for node in deleted.json()["nodes"]}

    card = github.repos["vgdnet/rhizome"].files.pop("card.md")
    github.repos["vgdnet/rhizome"].files["notes/card.md"] = card
    github.repos["vgdnet/rhizome"].sha = "sha-renamed"
    renamed = await client.get("/graph/shared")
    paths = {node["path"] for node in renamed.json()["nodes"]}
    assert "notes/card.md" in paths
    assert "card.md" not in paths
    assert any(
        edge["source"] == "loop.md" and edge["target"] == "notes/card.md"
        for edge in renamed.json()["edges"]
    )


async def test_neighborhood_empty_error_proposal_isolation_and_public_read(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    github = _install_graph(
        monkeypatch,
        MemoryGitHub(
            {
                "vgdnet/rhizome": MemoryRepo(
                    owner="vgdnet",
                    name="rhizome",
                    files={
                        "a.md": "# A\n[[b]]\n",
                        "b.md": "# B\n[[a]] [[c]]\n",
                        "c.md": "# C\n[[b]] [[d]]\n",
                        "d.md": "# D\n[[c]]\n",
                    },
                    sha="chain-sha",
                )
            }
        ),
    )
    await _admin_connect(client, session_factory, "graph-admin")
    neighborhood = await client.get("/graph/shared", params={"center": "b.md", "depth": 1, "limit": 50})
    assert neighborhood.status_code == 200
    nearby = {node["path"] for node in neighborhood.json()["nodes"] if not node["unresolved"]}
    assert nearby == {"a.md", "b.md", "c.md"}
    assert "d.md" not in nearby

    async with session_factory() as database:
        database.add(
            NoteIndex(
                index_key="proposal:secret",
                layer=NoteLayer.PROPOSAL.value,
                revision_sha="proposal-sha",
                path="secret.md",
                slug="secret",
                title="Secret",
                content_hash="a" * 64,
                proposal_id=uuid.uuid4(),
            )
        )
        await database.commit()
    isolated = await client.get("/graph/shared", params={"limit": 50})
    assert "secret.md" not in {node["path"] for node in isolated.json()["nodes"]}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as guest:
        public = await guest.get("/graph/shared")
        assert public.status_code == 200
        assert public.json()["layer"] == "shared"
        assert "secret.md" not in {node["path"] for node in public.json()["nodes"]}

    async def boom_file(owner: str, name: str, path: str, ref: str) -> str:
        raise GitHubAppError("unavailable", "github down")

    async def boom_blob(owner: str, name: str, sha: str) -> str:
        raise GitHubAppError("unavailable", "github down")

    github.get_file = boom_file  # type: ignore[method-assign]
    github.get_blob = boom_blob  # type: ignore[method-assign]
    github.repos["vgdnet/rhizome"].sha = "broken-sha"
    failed = await client.get("/graph/shared")
    assert failed.status_code == 200
    assert failed.json()["index_status"] == "error"
    assert any(node["path"] == "b.md" for node in failed.json()["nodes"])

    async with session_factory() as database:
        database.add(
            SyncJob(
                layer=NoteLayer.SHARED.value,
                status=SyncJobStatus.RUNNING.value,
                started_at=datetime.now(UTC),
            )
        )
        await database.commit()
    busy = await client.post("/index/rebuild", json={"target": "shared"})
    assert busy.status_code == 409


async def test_empty_shared_graph_and_query_baseline(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    github = _install_graph(
        monkeypatch,
        MemoryGitHub(
            {
                "vgdnet/rhizome": MemoryRepo(
                    owner="vgdnet",
                    name="rhizome",
                    files={},
                    sha="empty-sha",
                )
            }
        ),
    )
    await _admin_connect(client, session_factory, "empty-admin")
    empty = await client.get("/graph/shared")
    assert empty.status_code == 200
    assert empty.json()["nodes"] == []
    assert empty.json()["edges"] == []
    assert empty.json()["index_status"] in {"current", "empty"}

    github.repos["vgdnet/rhizome"].files = {f"n{i:03d}.md": f"# N{i}\n" for i in range(80)}
    github.repos["vgdnet/rhizome"].sha = "scale-sha"
    started = time.perf_counter()
    scaled = await client.get("/graph/shared", params={"limit": 20})
    elapsed = time.perf_counter() - started
    assert scaled.status_code == 200
    real_nodes = [node for node in scaled.json()["nodes"] if not node["unresolved"]]
    assert len(real_nodes) == 20
    assert scaled.json()["truncated"] is True
    assert elapsed < 2.0


async def test_personal_overlay_isolation_shared_read_and_xss_inert(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    github = _install_graph(monkeypatch, _github())
    github.repos["vgdnet/rhizome"].files["xss.md"] = "# <script>alert(1)</script>\n<img src=x>\n"
    await _admin_connect(client, session_factory, "efimov")
    await _connect_pair(client, "vgdnet/guide_psy")
    github.repos["vgdnet/guide_psy"].files["card.md"] = github.repos["vgdnet/rhizome"].files["card.md"]
    github.repos["vgdnet/guide_psy"].files["mine.md"] = "# Mine\nSee [[card]].\n"
    github.repos["vgdnet/guide_psy"].sha = "overlay-sha"

    overlay = await client.get("/graph/personal-overlay")
    assert overlay.status_code == 200
    body = overlay.json()
    assert body["layer"] == "overlay"
    assert "html_url" not in overlay.text
    card = next(node for node in body["nodes"] if node["path"] == "card.md")
    assert card["origin"] == "both"
    assert any(node["path"] == "personal:mine.md" for node in body["nodes"])
    assert any(
        edge["origin"] == "overlay" and edge["source"] == "personal:mine.md" and edge["target"] == "card.md"
        for edge in body["edges"]
    )
    xss_node = next(node for node in body["nodes"] if node["path"] == "xss.md")
    assert "<script>alert(1)</script>" in xss_node["title"]

    shared_note = await client.get("/shared/notes/card.md")
    assert shared_note.status_code == 200
    assert shared_note.json()["path"] == "card.md"
    assert "See [[missing]]" in shared_note.json()["body"]
    assert "html_url" not in shared_note.text

    xss_note = await client.get("/shared/notes/xss.md")
    assert xss_note.status_code == 200
    assert "<script>alert(1)</script>" in xss_note.json()["title"]
    assert "<img src=x>" in xss_note.json()["body"]

    me = await client.get("/users/me")
    other_probe = await client.get(
        "/graph/personal-overlay",
        params={"user_id": me.json()["id"], "owner": me.json()["id"]},
    )
    assert other_probe.status_code == 200

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as guest:
        denied = await guest.get("/graph/personal-overlay")
        assert denied.status_code == 401
        public_note = await guest.get("/shared/notes/card.md")
        assert public_note.status_code == 401
        public_graph = await guest.get("/graph/shared")
        assert public_graph.status_code == 200
        assert all(node.get("origin") != "personal" for node in public_graph.json()["nodes"])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as second:
        await _register(second, "other-user")
        await _connect_pair(second, "other/vault")
        stolen = await second.get(
            "/graph/personal-overlay",
            params={"user_id": me.json()["id"]},
        )
        assert stolen.status_code == 200
        paths = {node["path"] for node in stolen.json()["nodes"]}
        assert "personal:mine.md" not in paths
        origins = {node["path"]: node["origin"] for node in stolen.json()["nodes"]}
        assert origins.get("card.md") != "both"


async def test_overlay_from_uploads_without_git(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    _install_graph(monkeypatch, _github())
    await _admin_connect(client, session_factory, "overlay-admin")

    author = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(author, "upload-overlay")
    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("mine.md", b"# Mine\nSee [[card]].\n", "text/markdown")},
    )
    assert uploaded.status_code == 200

    overlay = await author.get("/graph/personal-overlay")
    assert overlay.status_code == 200
    body = overlay.json()
    assert body["layer"] == "overlay"
    assert any(node["path"] == "personal:mine.md" for node in body["nodes"])
    assert any(
        edge["origin"] == "overlay" and edge["source"] == "personal:mine.md" and edge["target"] == "card.md"
        for edge in body["edges"]
    )
    await author.aclose()
