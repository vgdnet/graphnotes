import hashlib
import hmac

from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.main import app
from app.models.audit_event import AuditEvent
from app.services.admin import bootstrap_admin
from app.services.index import IndexerError
from sqlalchemy import select
from tests.test_ingest import MemoryGitHub, _connect_pair, _github, _install, _register


def _assert_hidden(payload: str) -> None:
    assert "html_url" not in payload
    assert "head_sha" not in payload
    assert "base_sha" not in payload
    assert "merged_sha" not in payload
    assert "gn-p-" not in payload
    assert "pull" not in payload.casefold()
    assert "github.com" not in payload.casefold()


async def _admin(client: AsyncClient, session_factory: async_sessionmaker[AsyncSession], name: str) -> None:
    await _register(client, name)
    async with session_factory() as database:
        await bootstrap_admin(database, name)
    assert (await client.post("/repository/connect")).status_code == 200


async def _second(username: str) -> AsyncClient:
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(client, username)
    return client


async def test_user_proposal_editor_review_and_publication(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\n"
    github.repos["vgdnet/guide_psy"].files["source.md"] = "# Source\n"
    monkeypatch.setattr(settings, "github_webhook_secret", "webhook-secret")
    await _admin(admin, session_factory, "queue-admin")

    author = await _second("efimov")
    await _connect_pair(author, "vgdnet/guide_psy")
    personal_sha = github.repos["vgdnet/guide_psy"].sha
    created = await author.post(
        "/proposals",
        json={
            "paths": ["already.md", "card.md", "source.md"],
            "summary": "Share two notes",
            "expected_sha": personal_sha,
        },
    )
    assert created.status_code == 200
    proposal = created.json()
    assert proposal["status"] == "open"
    assert proposal["added"] == ["already.md"]
    assert proposal["changed"] == ["card.md"]
    assert "source.md" not in proposal["paths"]
    _assert_hidden(created.text)
    assert github.repos["vgdnet/guide_psy"].sha == personal_sha
    assert "already.md" not in github.repos["vgdnet/rhizome"].files
    assert github.repos["vgdnet/rhizome"].files["card.md"].startswith("---")

    own = await author.get("/proposals")
    assert own.status_code == 200
    assert len(own.json()["proposals"]) == 1
    forbidden_approve = await author.post(
        f"/proposals/{proposal['id']}/approve", json={"reason": ""}
    )
    assert forbidden_approve.status_code == 403
    shared_connect = await author.post("/repository/connect")
    assert shared_connect.status_code == 403

    editor = await _second("reviewer")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "reviewer")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200

    queued = await editor.get("/proposals")
    assert queued.status_code == 200
    assert len(queued.json()["proposals"]) == 1
    detail = await editor.get(f"/proposals/{proposal['id']}")
    assert detail.status_code == 200
    assert detail.json()["diff"][0]["path"] in {"already.md", "card.md"}
    assert any(item["diff"] for item in detail.json()["diff"])
    _assert_hidden(detail.text)

    rejected = await editor.post(
        f"/proposals/{proposal['id']}/reject", json={"reason": "needs a clearer title"}
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert "already.md" not in github.repos["vgdnet/rhizome"].files

    second = await author.post(
        "/proposals",
        json={"paths": ["already.md"], "summary": "Share already", "expected_sha": personal_sha},
    )
    assert second.status_code == 200
    changes = await editor.post(
        f"/proposals/{second.json()['id']}/request-changes",
        json={"reason": "add a link"},
    )
    assert changes.status_code == 200
    assert changes.json()["status"] == "changes_requested"
    assert "already.md" not in github.repos["vgdnet/rhizome"].files

    third = await author.post(
        "/proposals",
        json={"paths": ["already.md", "card.md"], "summary": "Share notes", "expected_sha": personal_sha},
    )
    assert third.status_code == 200
    published = await editor.post(f"/proposals/{third.json()['id']}/approve", json={"reason": ""})
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    assert github.repos["vgdnet/rhizome"].files["already.md"] == "# Mine\n"
    assert github.repos["vgdnet/rhizome"].files["card.md"] == "# Personal card\n"
    assert github.repos["vgdnet/guide_psy"].sha == personal_sha

    graph = await admin.get("/graph/shared")
    assert graph.status_code == 200
    paths = {node["path"] for node in graph.json()["nodes"]}
    assert "already.md" in paths
    once = await editor.post(f"/proposals/{third.json()['id']}/approve", json={"reason": ""})
    assert once.status_code == 409

    body = b'{"repository":{"node_id":"node-vgdnet-rhizome"}}'
    digest = hmac.new(b"webhook-secret", body, hashlib.sha256).hexdigest()
    headers = {
        "X-Hub-Signature-256": f"sha256={digest}",
        "X-GitHub-Delivery": "proposal-delivery-1",
        "X-GitHub-Event": "push",
        "Content-Type": "application/json",
    }
    first_hook = await admin.post("/webhooks/github", content=body, headers=headers)
    duplicate = await admin.post("/webhooks/github", content=body, headers=headers)
    assert first_hook.status_code == 202
    assert duplicate.status_code == 202
    assert duplicate.json()["status"] == "duplicate"

    rolled = await editor.post(
        f"/proposals/{third.json()['id']}/rollback",
        json={"reason": "published too early"},
    )
    assert rolled.status_code == 200
    assert rolled.json()["status"] == "rejected"
    assert "already.md" not in github.repos["vgdnet/rhizome"].files
    restored = await admin.get("/graph/shared")
    assert "already.md" not in {node["path"] for node in restored.json()["nodes"]}

    async with session_factory() as database:
        actions = {event.action for event in (await database.scalars(select(AuditEvent))).all()}
        assert "proposal.created" in actions
        assert "proposal.rejected" in actions
        assert "proposal.approved" in actions
        assert "proposal.rolled_back" in actions
        for event in (await database.scalars(select(AuditEvent))).all():
            assert "html_url" not in str(event.details)
            assert "BEGIN" not in str(event.details)

    await author.aclose()
    await editor.aclose()


async def test_self_approval_conflict_inactive_and_index_failure(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    await _admin(admin, session_factory, "queue-admin")
    assert (await admin.get("/graph/shared")).status_code == 200

    editor_author = await _second("edits-own")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "edits-own")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200
    await _connect_pair(editor_author, "vgdnet/guide_psy")
    own = await editor_author.post(
        "/proposals",
        json={"paths": ["already.md"], "summary": "Own note", "expected_sha": "personal-sha"},
    )
    assert own.status_code == 200
    self_approve = await editor_author.post(
        f"/proposals/{own.json()['id']}/approve", json={"reason": ""}
    )
    assert self_approve.status_code == 403
    assert self_approve.json()["detail"] == "you cannot decide on your own proposal"
    assert "already.md" not in github.repos["vgdnet/rhizome"].files

    admin_author = admin
    await admin_author.post("/personal/connect", json={"repository": "other/vault"})
    github.repos["other/vault"].files["extra.md"] = "# Extra\n"
    admin_own = await admin_author.post(
        "/proposals",
        json={"paths": ["extra.md"], "summary": "Admin note", "expected_sha": "other-sha"},
    )
    assert admin_own.status_code == 200
    admin_self = await admin_author.post(
        f"/proposals/{admin_own.json()['id']}/approve", json={"reason": ""}
    )
    assert admin_self.status_code == 403

    reviewer = await _second("second-editor")
    users = await admin.get("/admin/users")
    reviewer_id = next(item["id"] for item in users.json()["users"] if item["username"] == "second-editor")
    assert (await admin.patch(f"/admin/users/{reviewer_id}", json={"role": "editor"})).status_code == 200

    first = await editor_author.post(
        "/proposals",
        json={"paths": ["already.md"], "summary": "First", "expected_sha": "personal-sha"},
    )
    second = await editor_author.post(
        "/proposals",
        json={"paths": ["already.md"], "summary": "Second", "expected_sha": "personal-sha"},
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] != second.json()["id"]
    merged = await reviewer.post(f"/proposals/{first.json()['id']}/approve", json={"reason": ""})
    assert merged.status_code == 200
    assert merged.json()["status"] == "published"
    conflicted = await reviewer.post(f"/proposals/{second.json()['id']}/approve", json={"reason": ""})
    assert conflicted.status_code == 409
    listed = await reviewer.get(f"/proposals/{second.json()['id']}")
    assert listed.json()["status"] == "conflicted"

    blocked = await admin.patch(f"/admin/users/{reviewer_id}", json={"is_active": False})
    assert blocked.status_code == 200
    inactive = await reviewer.post(f"/proposals/{own.json()['id']}/approve", json={"reason": ""})
    assert inactive.status_code == 401

    github.repos["vgdnet/guide_psy"].files["later.md"] = "# Later\n"
    pending = await editor_author.post(
        "/proposals",
        json={"paths": ["later.md"], "summary": "Later", "expected_sha": "personal-sha"},
    )
    assert pending.status_code == 200

    async def boom(*args: object, **kwargs: object) -> None:
        raise IndexerError(502, "index rebuild failed")

    monkeypatch.setattr("app.services.proposal.rebuild_shared", boom)
    monkeypatch.setattr("app.services.index.rebuild_shared", boom)
    revived = await admin.patch(f"/admin/users/{reviewer_id}", json={"is_active": True})
    assert revived.status_code == 200
    login = await reviewer.post(
        "/auth/login",
        json={"username": "second-editor", "password": "a sufficiently long password"},
    )
    assert login.status_code == 200
    failed = await reviewer.post(f"/proposals/{pending.json()['id']}/approve", json={"reason": ""})
    assert failed.status_code == 200
    assert failed.json()["status"] == "failed"
    visible = await admin.get("/graph/shared")
    assert visible.status_code == 200
    assert "later.md" not in {node["path"] for node in visible.json()["nodes"]}

    await editor_author.aclose()
    await reviewer.aclose()


async def test_differ_lists_one_way_and_archive_is_published_zip(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    import io
    import zipfile

    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\n"
    github.repos["vgdnet/guide_psy"].files["source.md"] = "# Source\n"
    await _admin(admin, session_factory, "queue-admin")

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with guest:
        assert (await guest.get("/differ")).status_code == 401
        archive = await guest.get("/shared/archive")
        assert archive.status_code == 200
        assert archive.headers["content-type"].startswith("application/zip")
        assert "shared-rhizome.zip" in archive.headers.get("content-disposition", "")
        names = zipfile.ZipFile(io.BytesIO(archive.content)).namelist()
        assert set(names) == {"card.md", "source.md"}
        assert "html_url" not in archive.text
        assert "gn-p-" not in archive.text

    author = await _second("efimov")
    await _connect_pair(author, "vgdnet/guide_psy")
    reads_before = github.file_reads
    differ = await author.get("/differ")
    assert differ.status_code == 200
    assert github.file_reads == reads_before
    body = {item["path"]: item["kind"] for item in differ.json()["differences"]}
    assert body["already.md"] == "added"
    assert body["card.md"] == "changed"
    assert "source.md" not in body
    _assert_hidden(differ.text)

    created = await author.post("/proposals", json={"paths": ["already.md"]})
    assert created.status_code == 200
    assert created.json()["summary"] == "already.md"
    assert created.json()["added"] == ["already.md"]

    editor = await _second("reviewer")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "reviewer")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200
    published = await editor.post(
        f"/proposals/{created.json()['id']}/approve", json={"reason": ""}
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    after = await author.get("/differ")
    leftover = {item["path"] for item in after.json()["differences"]}
    assert "already.md" not in leftover
    assert "card.md" in leftover

    zipped = await author.get("/shared/archive")
    packed = set(zipfile.ZipFile(io.BytesIO(zipped.content)).namelist())
    assert "already.md" in packed
    assert "card.md" in packed

    await author.aclose()
    await editor.aclose()

