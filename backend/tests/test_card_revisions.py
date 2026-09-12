from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models.card_revision import CARD_REVISION_LIMIT
from app.services.provenance import record_card_revision
from tests.test_ingest import _bind_shared, _github, _install, _register
from tests.test_proposals import _admin, _second


async def test_personal_revisions_show_what_changed(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _admin(admin, session_factory, "rev-admin")
    author = await _second("rev-author")

    created = await author.put(
        "/personal/notes/mine.md",
        json={"source": "# Mine\nfirst\n", "expected_hash": ""},
    )
    assert created.status_code == 200
    edited = await author.put(
        "/personal/notes/mine.md",
        json={
            "source": "# Mine\nsecond\n",
            "expected_hash": created.json()["content_hash"],
        },
    )
    assert edited.status_code == 200

    history = await author.get("/cards/personal:mine.md/revisions")
    assert history.status_code == 200
    revisions = history.json()["revisions"]
    assert len(revisions) == 2
    assert revisions[0]["kind"] == "edited"
    assert "-first" in revisions[0]["change"]
    assert "+second" in revisions[0]["change"]
    assert revisions[1]["kind"] == "created"
    assert "+first" in revisions[1]["change"]
    assert "first\n" not in str({k: v for k, v in revisions[0].items() if k != "change"})

    shared = await author.get("/cards/mine.md/revisions")
    assert shared.json()["revisions"] == []

    owner_id = (await author.get("/users/me")).json()["id"]
    stranger = await _second("rev-stranger")
    stolen = await stranger.get(f"/cards/personal:{owner_id}:mine.md/revisions")
    assert stolen.status_code == 404
    admin_view = await admin.get(f"/cards/personal:{owner_id}:mine.md/revisions")
    assert admin_view.status_code == 200
    assert len(admin_view.json()["revisions"]) == 2
    await author.aclose()
    await stranger.aclose()


async def test_differ_and_card_use_latest_not_old_revisions(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _admin(admin, session_factory, "rev-latest-admin")
    author = await _second("rev-latest-author")
    first = await author.put(
        "/personal/notes/only.md",
        json={"source": "# Only\nold\n", "expected_hash": ""},
    )
    assert first.status_code == 200
    second = await author.put(
        "/personal/notes/only.md",
        json={"source": "# Only\nlatest\n", "expected_hash": first.json()["content_hash"]},
    )
    assert second.status_code == 200
    card = await author.get("/cards/personal:only.md")
    assert card.status_code == 200
    assert "latest" in card.json()["body"]
    assert "old" not in card.json()["body"]
    differ = await author.get("/differ")
    assert differ.status_code == 200
    paths = {item["path"] for item in differ.json()["differences"]}
    assert "only.md" in paths
    assert all("old" not in str(item) for item in differ.json()["differences"])
    await author.aclose()


async def test_shared_revisions_are_public_and_lazy_only_via_endpoint(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    client, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _register(client, "rev-shared-admin")
    await _bind_shared(client, session_factory, "rev-shared-admin")

    card = await client.get("/cards/card.md")
    assert card.status_code == 200
    assert "revisions" not in card.json()

    history = await client.get("/cards/card.md/revisions")
    assert history.status_code == 200
    revisions = history.json()["revisions"]
    assert revisions
    assert any("See [[missing]]" in item["change"] or item["kind"] == "created" for item in revisions)

    anonymous = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with anonymous:
        guest = await anonymous.get("/cards/card.md/revisions")
        assert guest.status_code == 200
        assert len(guest.json()["revisions"]) == len(revisions)
        personal = await anonymous.get("/cards/personal:mine.md/revisions")
        assert personal.status_code == 401


async def test_card_revisions_keep_last_thirty(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    _client, session_factory = auth_test_context
    async with session_factory() as database:
        for index in range(CARD_REVISION_LIMIT + 5):
            await record_card_revision(
                database,
                path="keep.md",
                source=f"# Keep\n{index}\n",
                owner_user_id=None,
                actor_user_id=None,
            )
        await database.commit()

    listed = await _client.get("/cards/keep.md/revisions")
    assert listed.status_code == 200
    revisions = listed.json()["revisions"]
    assert len(revisions) == CARD_REVISION_LIMIT
    assert f"+{CARD_REVISION_LIMIT + 4}" in revisions[0]["change"]
    assert "+0\n" not in "".join(item["change"] for item in revisions)
