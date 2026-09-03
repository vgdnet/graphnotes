from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.test_ingest import _connect_pair, _github, _install
from tests.test_proposals import _admin, _second


async def test_contributions_me_marks_open_proposal_paths_as_proposed(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())

    # Populate personal git with at least one note that differs from shared
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
    assert set(body.keys()) >= {"notes", "edges", "proposals"}
    assert len(body["proposals"]) == 1
    assert body["proposals"][0]["id"] == proposal_id
    assert body["proposals"][0]["status"] == "open"

    nodes_by_path = {node["path"]: node for node in body["notes"]}
    assert nodes_by_path["already.md"]["state"] == "proposed"
    assert nodes_by_path["card.md"]["state"] == "proposed"
