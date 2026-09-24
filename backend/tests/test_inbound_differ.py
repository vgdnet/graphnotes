from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from httpx import AsyncClient
from pytest import MonkeyPatch

from app.models.inbound_notice import InboundNotice
from app.models.personal_upload import PersonalUpload
from app.models.shared_note import SharedNote
from app.services.markdown import parse_markdown
from tests.test_ingest import _github, _install
from tests.test_proposals import _admin, _grant_write, _second


async def test_inbound_differ_lists_shared_edits_and_accepts(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    await _admin(admin, session_factory, "in-admin")

    editor = await _second("in-editor")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "in-editor")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200
    await _grant_write(admin, editor_id, "watch.md")

    author = await _second("in-author")
    await author.post("/personal/connect", json={"repository": "vgdnet/guide_psy"})
    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("watch.md", b"# Mine first\n", "text/markdown")},
    )
    assert uploaded.status_code == 200
    extra = await author.post(
        "/personal/import-md",
        files={"file": ("fresh.md", b"# Only mine\n", "text/markdown")},
    )
    assert extra.status_code == 200

    created = await author.post(
        "/proposals",
        json={
            "paths": ["watch.md"],
            "summary": "Watch card",
            "expected_sha": github.repos["vgdnet/guide_psy"].sha,
        },
    )
    assert created.status_code == 200
    published = await editor.post(f"/proposals/{created.json()['id']}/approve", json={"reason": ""})
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    after_publish = await author.get("/differ")
    assert after_publish.status_code == 200
    assert after_publish.json()["inbound"] == []
    outbound_paths = {item["path"] for item in after_publish.json()["differences"]}
    assert "watch.md" not in outbound_paths
    assert "fresh.md" in outbound_paths

    rewritten = await author.post(
        "/personal/import-md",
        files={"file": ("watch.md", b"# Mine second\n", "text/markdown")},
    )
    assert rewritten.status_code == 200
    local_edit = await author.get("/differ")
    assert local_edit.status_code == 200
    assert local_edit.json()["inbound"] == []
    assert any(item["path"] == "watch.md" for item in local_edit.json()["differences"])

    prefs = await author.patch("/users/me", json={"notify_card_changes": True})
    assert prefs.status_code == 200
    assert prefs.json()["notify_card_changes"] is True

    rewritten_shared = "# Shared later\n"
    parsed = parse_markdown("watch.md", rewritten_shared)
    async with session_factory() as database:
        note = await database.scalar(select(SharedNote).where(SharedNote.path == "watch.md"))
        assert note is not None
        note.body = rewritten_shared
        note.content_hash = parsed.content_hash
        note.updated_at = datetime.now(UTC) + timedelta(seconds=5)
        await database.commit()

    inbound = await author.get("/differ")
    assert inbound.status_code == 200
    inbound_paths = {item["path"] for item in inbound.json()["inbound"]}
    outbound_again = {item["path"] for item in inbound.json()["differences"]}
    assert inbound_paths == {"watch.md"}
    assert "watch.md" not in outbound_again
    assert "fresh.md" in outbound_again

    skipped = await author.get("/differ", params={"include_inbound": "false"})
    assert skipped.status_code == 200
    assert skipped.json()["inbound"] == []

    again = await author.get("/differ")
    assert again.status_code == 200
    assert {item["path"] for item in again.json()["inbound"]} == {"watch.md"}
    async with session_factory() as database:
        notices = (
            await database.scalars(select(InboundNotice).where(InboundNotice.path == "watch.md"))
        ).all()
        assert len(notices) == 1

    accepted = await author.post("/differ/inbound/watch.md/accept")
    assert accepted.status_code == 200
    assert accepted.json()["inbound"] == []
    assert "watch.md" not in {item["path"] for item in accepted.json()["differences"]}

    async with session_factory() as database:
        upload = await database.scalar(
            select(PersonalUpload).where(PersonalUpload.path == "watch.md")
        )
        assert upload is not None
        assert upload.body == "# Shared later\n"
        leftover = await database.scalar(select(func.count()).select_from(InboundNotice))
        assert leftover == 0

    missing = await author.post("/differ/inbound/fresh.md/accept")
    assert missing.status_code == 404

    await author.aclose()
    await editor.aclose()
