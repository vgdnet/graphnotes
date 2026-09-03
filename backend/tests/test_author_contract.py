from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models.audit_event import AuditEvent
from app.services.admin import bootstrap_admin
from app.services.author_contract import AUTHOR_CONTRACT_REQUIRED, AUTHOR_CONTRACT_VERSION
from tests.test_ingest import _github, _install, _register
from tests.test_proposals import _admin, _second


def _assert_no_secrets_or_shas(payload: str) -> None:
    folded = payload.casefold()
    assert "password" not in folded
    assert "password_hash" not in folded
    assert "token_hash" not in folded
    assert "html_url" not in folded
    assert "head_sha" not in folded
    assert "base_sha" not in folded
    assert "merged_sha" not in folded
    assert "github.com" not in folded


async def test_contribute_requires_author_contract(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["fresh.md"] = "# Fresh\n"
    await _admin(admin, session_factory, "contract-admin")

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(guest, "plain-user", accept_author=False)
    me = await guest.get("/users/me")
    assert me.status_code == 200
    assert me.json()["is_author"] is False
    assert me.json()["role"] == "user"
    _assert_no_secrets_or_shas(me.text)

    blocked_upload = await guest.post(
        "/personal/import-md",
        files={"file": ("fresh.md", b"# Fresh from upload\n", "text/markdown")},
    )
    assert blocked_upload.status_code == 403
    assert blocked_upload.json()["detail"] == AUTHOR_CONTRACT_REQUIRED

    blocked_connect = await guest.post(
        "/personal/connect",
        json={"repository": "vgdnet/guide_psy"},
    )
    assert blocked_connect.status_code == 403

    blocked_differ = await guest.get("/differ")
    assert blocked_differ.status_code == 403

    blocked_propose = await guest.post("/proposals", json={"paths": ["fresh.md"]})
    assert blocked_propose.status_code == 403

    contract = await guest.get("/author/contract")
    assert contract.status_code == 200
    assert contract.json()["version"] == AUTHOR_CONTRACT_VERSION
    assert "ответственность" in contract.json()["responsibility"].casefold()
    _assert_no_secrets_or_shas(contract.text)

    refused = await guest.post("/author/accept", json={"accepted": False})
    assert refused.status_code == 400

    accepted = await guest.post("/author/accept", json={"accepted": True})
    assert accepted.status_code == 200
    assert accepted.json()["is_author"] is True
    assert accepted.json()["author_contract_version"] == AUTHOR_CONTRACT_VERSION
    assert accepted.json()["author_contract_accepted_at"]
    _assert_no_secrets_or_shas(accepted.text)

    uploaded = await guest.post(
        "/personal/import-md",
        files={"file": ("fresh.md", b"# Fresh from upload\n", "text/markdown")},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["accepted"] == ["fresh.md"]
    assert uploaded.json()["revision"] is None

    differ = await guest.get("/differ")
    assert differ.status_code == 200
    assert any(item["path"] == "fresh.md" for item in differ.json()["differences"])
    _assert_no_secrets_or_shas(differ.text)

    created = await guest.post("/proposals", json={"paths": ["fresh.md"]})
    assert created.status_code == 200
    proposal_id = created.json()["id"]
    _assert_no_secrets_or_shas(created.text)

    withdrawn = await guest.post("/author/withdraw")
    assert withdrawn.status_code == 200
    assert withdrawn.json()["is_author"] is False
    assert withdrawn.json()["author_contract_withdrawn_at"]

    blocked_again = await guest.post("/proposals", json={"paths": ["fresh.md"]})
    assert blocked_again.status_code == 403

    reaccepted = await guest.post("/author/accept", json={"accepted": True})
    assert reaccepted.status_code == 200
    assert reaccepted.json()["is_author"] is True

    connected = await guest.post(
        "/personal/connect",
        json={"repository": "vgdnet/guide_psy"},
    )
    assert connected.status_code == 200

    archive = await guest.get("/shared/archive")
    assert archive.status_code == 410

    editor = await _second("reviewer")
    await editor.post("/author/withdraw")
    users = await admin.get("/admin/users")
    editor_id = next(
        item["id"] for item in users.json()["users"] if item["username"] == "reviewer"
    )
    assert (
        await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})
    ).status_code == 200
    editor_me = await editor.get("/users/me")
    assert editor_me.status_code == 200
    assert editor_me.json()["role"] == "editor"
    assert editor_me.json()["is_author"] is False

    queued = await editor.get("/proposals")
    assert queued.status_code == 200
    assert any(item["id"] == proposal_id for item in queued.json()["proposals"])
    approved = await editor.post(
        f"/proposals/{proposal_id}/approve", json={"reason": ""}
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "published"
    _assert_no_secrets_or_shas(approved.text)

    async with session_factory() as database:
        actions = set((await database.scalars(select(AuditEvent.action))).all())
        assert "author.contract_accepted" in actions
        assert "author.contract_withdrawn" in actions
        serialized = " ".join(
            f"{event.action} {event.details}"
            for event in (await database.scalars(select(AuditEvent))).all()
        )
        assert "a sufficiently long password" not in serialized
        assert "graphnotes_session" not in serialized

    await guest.aclose()


async def test_register_checkbox_grants_author_and_admin_without_author_still_works(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    _install(monkeypatch, _github())

    await _register(admin, "ops-admin", accept_author=False)
    async with session_factory() as database:
        await bootstrap_admin(database, "ops-admin")
    me = await admin.get("/users/me")
    assert me.json()["role"] == "admin"
    assert me.json()["is_author"] is False
    assert (await admin.get("/admin/users")).status_code == 200
    connected = await admin.post("/repository/connect")
    assert connected.status_code == 200

    author = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(author, "checkbox-author", accept_author=True)
    granted = await author.get("/users/me")
    assert granted.json()["is_author"] is True
    assert granted.json()["author_contract_accepted_at"]
    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("note.md", b"# Note\n", "text/markdown")},
    )
    assert uploaded.status_code == 200
    await author.aclose()
