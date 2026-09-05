from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.test_ingest import _github, _install
from tests.test_proposals import _admin, _second


def _assert_hidden(payload: str) -> None:
    folded = payload.casefold()
    assert "head_sha" not in folded
    assert "merged_sha" not in folded
    assert "github.com" not in folded
    assert "password" not in folded


async def test_publication_feed_and_commenter_moderation(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\nSee [[already]].\n"
    await _admin(admin, session_factory, "feed-admin")

    author = await _second("feeder")
    await author.post("/personal/connect", json={"repository": "vgdnet/guide_psy"})
    created = await author.post("/proposals", json={"paths": ["already.md", "card.md"]})
    assert created.status_code == 200
    published = await admin.post(
        f"/proposals/{created.json()['id']}/approve", json={"reason": ""}
    )
    assert published.status_code == 200

    feed = await author.get("/shared/notes/already.md/feed")
    assert feed.status_code == 200
    kinds = {item["kind"] for item in feed.json()["events"]}
    assert "created" in kinds
    assert "linked" in kinds
    assert all(item.get("proposal_id") for item in feed.json()["events"] if item["kind"] == "created")
    _assert_hidden(feed.text)

    edited = await author.get("/shared/notes/card.md/feed")
    assert edited.status_code == 200
    edited_kinds = {item["kind"] for item in edited.json()["events"]}
    assert "edited" in edited_kinds
    assert "linked" in edited_kinds
    _assert_hidden(edited.text)

    commenter = await _second("talker")
    await commenter.post("/author/withdraw")
    pending = await commenter.post(
        "/shared/notes/already.md/comments",
        json={"body": "Thanks for this card"},
    )
    assert pending.status_code == 200
    assert pending.json()["status"] == "pending"
    comment_id = pending.json()["id"]

    public = await author.get("/shared/notes/already.md/comments")
    assert public.status_code == 200
    assert public.json()["comments"] == []

    approved = await admin.post(
        f"/comments/{comment_id}/moderate",
        json={"status": "approved"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    _assert_hidden(approved.text)

    visible = await author.get("/shared/notes/already.md/comments")
    assert any(item["id"] == comment_id for item in visible.json()["comments"])
    assert "Thanks for this card" in visible.text
    archive = await author.get("/shared/archive")
    assert archive.status_code == 410
