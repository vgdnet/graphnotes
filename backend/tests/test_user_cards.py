from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from tests.test_ingest import _github, _install
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
    created = await author.post("/proposals", json={"paths": ["already.md"]})
    assert created.status_code == 200
    published = await admin.post(
        f"/proposals/{created.json()['id']}/approve", json={"reason": ""}
    )
    assert published.status_code == 200

    secret = await author.post(
        "/personal/import-md",
        files={"file": ("secret.md", b"# Hidden diary\n", "text/markdown")},
    )
    assert secret.status_code == 200
    assert (await author.put("/personal/closed-paths", json={"path": "secret.md"})).status_code == 200

    me = await author.get("/users/me")
    author_id = me.json()["id"]
    own = await author.get(f"/users/{author_id}/card")
    assert own.status_code == 200
    assert own.json()["self"] is True
    assert own.json()["user"]["is_author"] is True
    assert own.json()["stats"]["accepted"] >= 1
    assert own.json()["closed_count"] == 1
    _assert_hidden(own.text)

    stranger = await _second("card-viewer")
    public = await stranger.get(f"/users/{author_id}/card")
    assert public.status_code == 200
    assert public.json()["self"] is False
    assert public.json()["closed_count"] is None
    assert public.json()["review"] is None
    assert public.json()["stats"]["accepted"] >= 1
    paths = {item["path"] for item in public.json()["notes"]}
    assert "already.md" in paths
    assert "secret.md" not in paths
    assert "Hidden diary" not in public.text
    assert public.json()["stats"]["added"] == 0
    _assert_hidden(public.text)

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    anon = await guest.get(f"/users/{author_id}/card")
    assert anon.status_code == 200
    assert "secret.md" not in anon.text
    await guest.aclose()
