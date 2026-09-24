from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from tests.test_ingest import _connect_pair, _github, _install
from tests.test_proposals import _admin, _second


def _assert_hidden(payload: str) -> None:
    folded = payload.casefold()
    assert "head_sha" not in folded
    assert "github.com" not in folded
    assert "password" not in folded


async def test_user_card_hides_other_personal_and_closed(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\n"
    await _admin(admin, session_factory, "card-admin")

    author = await _second("card-author")
    await author.post("/personal/connect", json={"repository": "vgdnet/guide_psy"})
    await _connect_pair(author, "vgdnet/guide_psy", github)
    created = await author.post("/proposals", json={"paths": ["already.md"]})
    assert created.status_code == 200
    published = await admin.post(
        f"/proposals/{created.json()['id']}/approve", json={"reason": ""}
    )
    assert published.status_code == 200

    assert (await author.delete("/personal/connect")).status_code == 410
    secret = await author.post(
        "/personal/import-md",
        files={"file": ("secret.md", b"# Hidden diary\n", "text/markdown")},
    )
    assert secret.status_code == 200
    assert (await author.put("/personal/closed-paths", json={"path": "secret.md"})).status_code == 200

    me = await author.get("/users/me")
    author_id = me.json()["id"]
    own = await author.get("/users/card-author/card")
    assert own.status_code == 200
    assert own.json()["self"] is True
    assert own.json()["user"]["is_author"] is True
    assert own.json()["user"].get("id") is None
    assert str(author_id) not in own.text
    assert own.json()["stats"]["accepted"] >= 1
    assert own.json()["closed_count"] == 1
    assert own.json()["achievements"]["proposals"] >= 1
    _assert_hidden(own.text)

    stranger = await _second("card-viewer")
    assert (await stranger.get(f"/users/{author_id}/card")).status_code == 404
    public = await stranger.get("/users/card-author/card")
    assert public.status_code == 200
    assert public.json()["self"] is False
    assert public.json()["user"].get("id") is None
    assert str(author_id) not in public.text
    assert public.json()["closed_count"] is None
    assert public.json()["review"] is None
    assert public.json()["stats"]["accepted"] >= 1
    paths = {item["path"] for item in public.json()["notes"]}
    assert "already.md" in paths
    assert "secret.md" not in paths
    assert "Hidden diary" not in public.text
    assert public.json()["stats"]["added"] == 0
    achievements = public.json()["achievements"]
    assert achievements["proposals"] >= 1
    assert achievements["accepted_notes"] >= 1
    assert achievements["created"] + achievements["edits"] >= 1
    assert "secret.md" not in public.text
    _assert_hidden(public.text)

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    assert (await guest.get(f"/users/{author_id}/card")).status_code == 404
    anon = await guest.get("/users/card-author/card")
    assert anon.status_code == 200
    assert "secret.md" not in anon.text
    assert str(author_id) not in anon.text
    assert anon.json()["user"].get("id") is None
    store = anon.json()["store"]
    assert store["personal_notes"] >= 1
    assert store["personal_links"] >= 0
    assert store["proposed_notes"] >= 1
    assert store["proposed_links"] >= 0
    assert store["proposed_edit_bytes"] >= 0
    assert "Hidden diary" not in anon.text
    assert anon.json()["user"]["username"] == "card-author"
    missing = await guest.get("/users/no-such-login/card")
    assert missing.status_code == 404
    await guest.aclose()


async def test_user_card_does_not_refresh_github(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _admin(admin, session_factory, "stat-admin")
    author = await _second("stat-author")

    def boom(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("person card must read derived stats without git refresh")

    monkeypatch.setattr("app.services.github.GitHubAppClient", boom)
    own = await author.get("/users/stat-author/card")
    assert own.status_code == 200
    assert own.json()["self"] is True
    assert "store" in own.json()
    assert "achievements" in own.json()
    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    public = await guest.get("/users/stat-author/card")
    assert public.status_code == 200
    assert public.json()["achievements"]["proposals"] >= 0
    await guest.aclose()
