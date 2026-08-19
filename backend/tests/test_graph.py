from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import graph as graph_api
from app.api import notes as notes_api
from app.api import repository as repository_api
from app.core.config import settings
from app.main import app
from app.models.graph import NoteIndex, NoteLayer
from app.services.admin import bootstrap_admin
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
    await _connect_pair(first, "vgdnet/guide_psy")
    await first.post("/personal/take-from-shared", json={"paths": ["card.md"]})

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
