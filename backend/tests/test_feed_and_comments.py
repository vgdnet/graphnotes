from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.test_ingest import _connect_pair, _github, _install
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
    await _connect_pair(author, "vgdnet/guide_psy", github)
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


async def test_personal_in_app_feed_does_not_mix_with_shared(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\nSee [[already]].\n"
    await _admin(admin, session_factory, "feed-iso-admin")

    author = await _second("feed-iso-author")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    created = await author.post("/proposals", json={"paths": ["already.md", "card.md"]})
    assert created.status_code == 200
    published = await admin.post(
        f"/proposals/{created.json()['id']}/approve", json={"reason": ""}
    )
    assert published.status_code == 200

    shared_before = await author.get("/shared/notes/card.md/feed")
    assert shared_before.status_code == 200
    shared_ids = {item["id"] for item in shared_before.json()["events"]}
    assert shared_ids
    cards_shared = await author.get("/cards/card.md/feed")
    assert {item["id"] for item in cards_shared.json()["events"]} == shared_ids

    detail = await author.get("/personal/notes/card.md")
    assert detail.status_code == 200
    saved = await author.put(
        "/personal/notes/card.md",
        json={
            "source": "# Personal card\nedited in app [[already]]\n",
            "expected_hash": detail.json()["content_hash"],
        },
    )
    assert saved.status_code == 200

    shared_after = await author.get("/shared/notes/card.md/feed")
    assert {item["id"] for item in shared_after.json()["events"]} == shared_ids
    cards_shared_after = await author.get("/cards/card.md/feed")
    assert {item["id"] for item in cards_shared_after.json()["events"]} == shared_ids

    personal_feed = await author.get("/cards/personal:card.md/feed")
    assert personal_feed.status_code == 200
    personal_events = personal_feed.json()["events"]
    personal_ids = {item["id"] for item in personal_events}
    assert personal_ids
    assert personal_ids.isdisjoint(shared_ids)
    assert "edited" in {item["kind"] for item in personal_events}
    assert all(item.get("proposal_id") is None for item in personal_events)
    for item in personal_events:
        assert "body" not in item
        assert "source" not in item
        assert "edited in app" not in str(item)

    unlinked = await author.put(
        "/personal/notes/card.md",
        json={
            "source": "# Personal card\nedited in app\n",
            "expected_hash": saved.json()["content_hash"],
        },
    )
    assert unlinked.status_code == 200
    after_unlink = await author.get("/cards/personal:card.md/feed")
    assert any(
        item["kind"] == "unlinked" and item["other_path"] == "already"
        for item in after_unlink.json()["events"]
    )
    still_shared = await author.get("/shared/notes/card.md/feed")
    assert {item["id"] for item in still_shared.json()["events"]} == shared_ids

    owner_id = (await author.get("/users/me")).json()["id"]
    stranger = await _second("feed-iso-stranger")
    stolen_feed = await stranger.get(f"/cards/personal:{owner_id}:card.md/feed")
    assert stolen_feed.status_code == 404
    admin_feed = await admin.get(f"/cards/personal:{owner_id}:card.md/feed")
    assert admin_feed.status_code == 200
    assert {item["id"] for item in admin_feed.json()["events"]} == {
        item["id"] for item in after_unlink.json()["events"]
    }
    await author.aclose()
    await stranger.aclose()
