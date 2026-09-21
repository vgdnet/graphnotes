import hashlib
import hmac

from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.shared_note import SharedNote
from app.services.admin import bootstrap_admin
from app.services.index import IndexerError
from sqlalchemy import select
from tests.test_ingest import MemoryGitHub, _bind_shared, _connect_pair, _github, _install, _register
from tests.test_obsidian_integration import _auth, _token


def _assert_hidden(payload: str) -> None:
    assert "html_url" not in payload
    assert "head_sha" not in payload
    assert "base_sha" not in payload
    assert "merged_sha" not in payload
    assert "gn-p-" not in payload
    assert "pull" not in payload.casefold()
    assert "github.com" not in payload.casefold()


async def _grant_write(admin: AsyncClient, user_id: str, *paths: str) -> None:
    for path in paths:
        created = await admin.post(
            "/admin/grants",
            json={"user_id": user_id, "kind": "path", "value": path},
        )
        assert created.status_code in {201, 409}, created.text


async def _admin(client: AsyncClient, session_factory: async_sessionmaker[AsyncSession], name: str, github=None) -> None:
    await _register(client, name)
    async with session_factory() as database:
        await bootstrap_admin(database, name)
    files = None
    if github is not None:
        repo = github.repos.get("vgdnet/rhizome")
        if repo is not None:
            files = dict(repo.files)
    from tests.test_ingest import _seed_shared_store

    await _seed_shared_store(session_factory, files)


async def _second(username: str) -> AsyncClient:
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(client, username)
    return client


async def _store_body(session_factory: async_sessionmaker[AsyncSession], path: str) -> str | None:
    async with session_factory() as database:
        row = await database.scalar(select(SharedNote).where(SharedNote.path == path))
        return None if row is None else row.body


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
    await _connect_pair(author, "vgdnet/guide_psy", github)
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
    assert await _store_body(session_factory, "already.md") is None
    assert (await _store_body(session_factory, "card.md") or "").startswith("---")

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
    await _grant_write(admin, editor_id, "already.md", "card.md")

    queued = await editor.get("/proposals")
    assert queued.status_code == 200
    assert len(queued.json()["proposals"]) == 1
    detail = await editor.get(f"/proposals/{proposal['id']}")
    assert detail.status_code == 200
    assert detail.json()["diff"][0]["path"] in {"already.md", "card.md"}
    assert any(item["diff"] for item in detail.json()["diff"])
    assert any(item.get("body") for item in detail.json()["diff"])
    files = {item["path"]: item for item in detail.json()["diff"]}
    changed = files["card.md"]
    assert changed["engine"] == "wikidiff2"
    assert changed["html"]
    assert "diff-" in changed["html"]
    assert changed["before"].startswith("---")
    assert "# Personal card" in changed["body"]
    assert changed["rows"]
    assert any(row["op"] in {"replace", "delete", "insert"} for row in changed["rows"])
    added = files["already.md"]
    assert added["engine"] == "wikidiff2"
    assert "diff-addedline" in added["html"]
    assert added["before"] == ""
    assert added["rows"]
    assert all(row["op"] == "insert" and row["left"] == "" for row in added["rows"])
    _assert_hidden(detail.text)

    rejected = await editor.post(
        f"/proposals/{proposal['id']}/reject", json={"reason": "needs a clearer title"}
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["reason"] == "needs a clearer title"
    author_rejected = await author.get(f"/proposals/{proposal['id']}")
    assert author_rejected.status_code == 200
    assert author_rejected.json()["reason"] == "needs a clearer title"
    assert await _store_body(session_factory, "already.md") is None

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
    assert changes.json()["reason"] == "add a link"
    author_returned = await author.get(f"/proposals/{second.json()['id']}")
    assert author_returned.json()["reason"] == "add a link"
    assert await _store_body(session_factory, "already.md") is None

    third = await author.post(
        "/proposals",
        json={"paths": ["already.md", "card.md"], "summary": "Share notes", "expected_sha": personal_sha},
    )
    assert third.status_code == 200
    published = await editor.post(f"/proposals/{third.json()['id']}/approve", json={"reason": ""})
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    assert await _store_body(session_factory, "already.md") == "# Mine\n"
    assert await _store_body(session_factory, "card.md") == "# Personal card\n"
    assert github.repos["vgdnet/guide_psy"].sha == personal_sha

    graph = await admin.get("/graph/shared")
    assert graph.status_code == 200
    paths = {node["path"] for node in graph.json()["nodes"]}
    assert "already.md" in paths
    once = await editor.post(f"/proposals/{third.json()['id']}/approve", json={"reason": ""})
    assert once.status_code == 200
    assert once.json()["status"] == "published"

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
    assert await _store_body(session_factory, "already.md") is None
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

    author = await _second("edits-own")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    own = await author.post(
        "/proposals",
        json={"paths": ["already.md"], "summary": "Own note", "expected_sha": "personal-sha"},
    )
    assert own.status_code == 200
    users = await admin.get("/admin/users")
    author_id = next(item["id"] for item in users.json()["users"] if item["username"] == "edits-own")
    assert (await admin.patch(f"/admin/users/{author_id}", json={"role": "editor"})).status_code == 200
    blocked_offer = await author.post(
        "/proposals",
        json={"paths": ["already.md"], "summary": "Editor must not offer", "expected_sha": "personal-sha"},
    )
    assert blocked_offer.status_code == 403
    assert "cannot propose" in blocked_offer.json()["detail"]
    self_approve = await author.post(
        f"/proposals/{own.json()['id']}/approve", json={"reason": ""}
    )
    assert self_approve.status_code == 403
    assert self_approve.json()["detail"] == "you cannot decide on your own proposal"
    assert await _store_body(session_factory, "already.md") is None
    assert (await admin.patch(f"/admin/users/{author_id}", json={"role": "user"})).status_code == 200

    admin_own = await admin.post(
        "/proposals",
        json={"paths": ["extra.md"], "summary": "Admin note", "expected_sha": "other-sha"},
    )
    assert admin_own.status_code == 403
    assert "cannot propose" in admin_own.json()["detail"]

    reviewer = await _second("second-editor")
    users = await admin.get("/admin/users")
    reviewer_id = next(item["id"] for item in users.json()["users"] if item["username"] == "second-editor")
    assert (await admin.patch(f"/admin/users/{reviewer_id}", json={"role": "editor"})).status_code == 200
    await _grant_write(admin, reviewer_id, "already.md", "later.md")

    first = await author.post(
        "/proposals",
        json={"paths": ["already.md"], "summary": "First", "expected_sha": "personal-sha"},
    )
    second = await author.post(
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
    github.repos["vgdnet/guide_psy"].sha = "personal-later"
    uploaded_later = await author.post(
        "/personal/import-md",
        files={"file": ("later.md", b"# Later\n", "text/markdown")},
    )
    assert uploaded_later.status_code == 200
    pending = await author.post(
        "/proposals",
        json={"paths": ["later.md"], "summary": "Later"},
    )
    assert pending.status_code == 200

    async def boom(*args: object, **kwargs: object) -> None:
        raise IndexerError(502, "index rebuild failed")

    monkeypatch.setattr("app.services.proposal.reindex_shared_store", boom)
    monkeypatch.setattr("app.services.index.reindex_shared_store", boom)
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

    await author.aclose()
    await reviewer.aclose()


async def test_differ_lists_one_way_and_shared_archive_is_gone(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\n"
    github.repos["vgdnet/guide_psy"].files["source.md"] = "# Source\n"
    await _admin(admin, session_factory, "queue-admin")

    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with guest:
        assert (await guest.get("/differ")).status_code == 401
        archive = await guest.get("/shared/archive")
        assert archive.status_code == 410

    author = await _second("efimov")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    differ = await author.get("/differ")
    assert differ.status_code == 200
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
    await _grant_write(admin, editor_id, "already.md")
    published = await editor.post(
        f"/proposals/{created.json()['id']}/approve", json={"reason": ""}
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    after = await author.get("/differ")
    leftover = {item["path"] for item in after.json()["differences"]}
    assert "already.md" not in leftover
    assert "card.md" in leftover

    assert (await author.get("/shared/archive")).status_code == 410

    await author.aclose()
    await editor.aclose()


async def test_differ_list_reads_store_without_git_copy(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    await _admin(admin, session_factory, "queue-admin")
    author = await _second("efimov")
    await _connect_pair(author, "vgdnet/guide_psy", github)

    before = await author.get("/differ")
    assert before.status_code == 200
    assert "obsidian.md" not in {item["path"] for item in before.json()["differences"]}

    repo = github.repos["vgdnet/guide_psy"]
    assert repo.sha is not None
    repo.snapshots[repo.sha] = dict(repo.files)
    repo.files["obsidian.md"] = "# Pushed from Obsidian\n"
    repo.sha = "sha-from-obsidian"
    repo.branches[repo.default_branch] = repo.sha

    git_only = await author.get("/differ")
    assert git_only.status_code == 200
    assert "obsidian.md" not in {item["path"] for item in git_only.json()["differences"]}

    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("obsidian.md", b"# Pushed from Obsidian\n", "text/markdown")},
    )
    assert uploaded.status_code == 200
    after = await author.get("/differ")
    assert after.status_code == 200
    body = {item["path"]: item["kind"] for item in after.json()["differences"]}
    assert body["obsidian.md"] == "added"
    _assert_hidden(after.text)

    await author.aclose()


async def test_new_proposal_notifies_opted_in_editors(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    from tests.test_smtp_and_admin import _enable_smtp

    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\n"
    await _admin(admin, session_factory, "notify-admin")
    quiet = await _second("quiet-ed")
    users = await admin.get("/admin/users")
    quiet_id = next(item["id"] for item in users.json()["users"] if item["username"] == "quiet-ed")
    assert (await admin.patch(f"/admin/users/{quiet_id}", json={"role": "editor"})).status_code == 200
    author = await _second("author-ed")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    sent = _enable_smtp(monkeypatch)
    await admin.patch("/users/me", json={"notify_queue_email": True})
    created = await author.post(
        "/proposals",
        json={"paths": ["card.md"], "summary": "Share card", "expected_sha": github.repos["vgdnet/guide_psy"].sha},
    )
    assert created.status_code == 200
    queue_mail = [item for item in sent if "Новые правки" in item["subject"]]
    assert len(queue_mail) == 1
    assert queue_mail[0]["to"] == "notify-admin@example.com"
    assert "Share card" in queue_mail[0]["body"]
    assert "quiet-ed@example.com" not in {item["to"] for item in queue_mail}
    await quiet.aclose()
    await author.aclose()


async def test_editor_plugin_token_reads_queue_and_resolves_merged_card(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\n"
    await _admin(admin, session_factory, "plugin-queue-admin")

    author = await _second("plugin-author")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    created = await author.post(
        "/proposals",
        json={
            "paths": ["card.md"],
            "summary": "Share card",
            "expected_sha": github.repos["vgdnet/guide_psy"].sha,
        },
    )
    assert created.status_code == 200
    proposal_id = created.json()["id"]

    editor = await _second("plugin-editor")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "plugin-editor")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200
    await _grant_write(admin, editor_id, "card.md")
    secret = (await _token(editor))["token"]

    plugin = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    caps = await plugin.get("/integrations/obsidian/v1/capabilities", headers=_auth(secret))
    assert caps.status_code == 200
    assert caps.json()["user"]["role"] == "editor"
    assert caps.json()["can_see_queue"] is True
    assert caps.json()["can_propose_to_rhizome"] is False
    blocked_offer = await plugin.post(
        "/proposals",
        headers=_auth(secret),
        json={"paths": ["card.md"], "summary": "editor must not offer"},
    )
    assert blocked_offer.status_code == 403
    assert "cannot propose" in blocked_offer.json()["detail"]
    listed = await plugin.get("/proposals", headers=_auth(secret))
    assert listed.status_code == 200
    assert listed.json()["proposals"][0]["id"] == proposal_id
    assert listed.json()["proposals"][0]["status"] == "open"

    detail = await plugin.get(f"/proposals/{proposal_id}", headers=_auth(secret))
    assert detail.status_code == 200
    files = {item["path"]: item for item in detail.json()["diff"]}
    assert "card.md" in files
    assert "# Personal card" in files["card.md"]["body"]
    assert files["card.md"]["before"].startswith("---")

    blocked = await plugin.post(
        f"/proposals/{proposal_id}/approve",
        headers=_auth(secret),
        json={"reason": ""},
    )
    assert blocked.status_code == 401

    pair = await plugin.get(f"/proposals/{proposal_id}/files/card.md", headers=_auth(secret))
    assert pair.status_code == 200
    assert "# Personal card" in pair.json()["body"]
    assert pair.json()["before"].startswith("---")
    assert "html" not in pair.json()

    resolved = await plugin.post(
        f"/proposals/{proposal_id}/resolve",
        headers=_auth(secret),
        json={"files": [{"path": "card.md", "source": "# Editor merge\n"}], "reason": ""},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] in {"published", "merged_indexing"}
    assert await _store_body(session_factory, "card.md") == "# Editor merge\n"
    again = await plugin.post(
        f"/proposals/{proposal_id}/resolve",
        headers=_auth(secret),
        json={"files": [{"path": "card.md", "source": "# Editor merge\n"}], "reason": ""},
    )
    assert again.status_code == 200
    assert again.json()["status"] == "published"
    await plugin.aclose()
    await editor.aclose()
    await author.aclose()


async def test_resolve_one_file_keeps_sibling_in_queue(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\n"
    github.repos["vgdnet/guide_psy"].files["source.md"] = "# Personal source\n"
    await _admin(admin, session_factory, "partial-resolve-admin")

    author = await _second("partial-author")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    created = await author.post(
        "/proposals",
        json={
            "paths": ["card.md", "source.md"],
            "summary": "Two cards",
            "expected_sha": github.repos["vgdnet/guide_psy"].sha,
        },
    )
    assert created.status_code == 200
    proposal_id = created.json()["id"]
    assert set(created.json()["paths"]) == {"card.md", "source.md"}

    editor = await _second("partial-editor")
    users = await admin.get("/admin/users")
    editor_id = next(item["id"] for item in users.json()["users"] if item["username"] == "partial-editor")
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200
    await _grant_write(admin, editor_id, "card.md", "source.md")
    secret = (await _token(editor))["token"]

    plugin = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    shared_source = await _store_body(session_factory, "source.md")
    resolved = await plugin.post(
        f"/proposals/{proposal_id}/resolve",
        headers=_auth(secret),
        json={"files": [{"path": "card.md", "source": "# Editor one\n"}], "reason": ""},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "open"
    assert resolved.json()["paths"] == ["source.md"]
    assert await _store_body(session_factory, "card.md") == "# Editor one\n"
    assert await _store_body(session_factory, "source.md") == shared_source

    listed = await plugin.get("/proposals", headers=_auth(secret))
    assert listed.status_code == 200
    open_rows = [item for item in listed.json()["proposals"] if item["id"] == proposal_id]
    assert len(open_rows) == 1
    assert open_rows[0]["status"] == "open"
    assert open_rows[0]["paths"] == ["source.md"]

    last = await plugin.post(
        f"/proposals/{proposal_id}/resolve",
        headers=_auth(secret),
        json={"files": [{"path": "source.md", "source": "# Editor two\n"}], "reason": ""},
    )
    assert last.status_code == 200
    assert last.json()["status"] in {"published", "merged_indexing"}
    assert await _store_body(session_factory, "source.md") == "# Editor two\n"
    assert await _store_body(session_factory, "card.md") == "# Editor one\n"
    await plugin.aclose()
    await editor.aclose()
    await author.aclose()


async def test_author_token_cannot_resolve_proposal(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    github = _install(monkeypatch, _github())
    github.repos["vgdnet/guide_psy"].files["card.md"] = "# Personal card\n"
    await _admin(admin, session_factory, "author-resolve-admin")

    author = await _second("author-resolve")
    await _connect_pair(author, "vgdnet/guide_psy", github)
    created = await author.post(
        "/proposals",
        json={
            "paths": ["card.md"],
            "summary": "Share card",
            "expected_sha": github.repos["vgdnet/guide_psy"].sha,
        },
    )
    assert created.status_code == 200
    secret = (await _token(author))["token"]
    plugin = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    forbidden = await plugin.post(
        f"/proposals/{created.json()['id']}/resolve",
        headers=_auth(secret),
        json={"files": [{"path": "card.md", "source": "# Nope\n"}]},
    )
    assert forbidden.status_code == 403
    await plugin.aclose()
    await author.aclose()


async def test_user_plugin_token_creates_proposal_editor_token_cannot(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch: MonkeyPatch,
) -> None:
    admin, session_factory = auth_test_context
    _install(monkeypatch, _github())
    await _register(admin, "bearer-offer-admin")
    await _bind_shared(admin, session_factory, "bearer-offer-admin")

    author = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(author, "bearer-user")
    uploaded = await author.post(
        "/personal/import-md",
        files={"file": ("offer.md", b"# Offer from plugin\n", "text/markdown")},
    )
    assert uploaded.status_code == 200
    user_secret = (await _token(author))["token"]

    plugin = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    caps = await plugin.get(
        "/integrations/obsidian/v1/capabilities",
        headers=_auth(user_secret),
    )
    assert caps.status_code == 200
    assert caps.json()["user"]["role"] == "user"
    assert caps.json()["can_propose_to_rhizome"] is True
    created = await plugin.post(
        "/proposals",
        headers=_auth(user_secret),
        json={"paths": ["offer.md"], "summary": "from plugin token"},
    )
    assert created.status_code == 200, created.text
    assert created.json()["status"] == "open"
    assert created.json()["paths"] == ["offer.md"]
    assert created.json()["author"]["username"] == "bearer-user"

    editor = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    await _register(editor, "bearer-editor")
    users = await admin.get("/admin/users")
    editor_id = next(
        item["id"] for item in users.json()["users"] if item["username"] == "bearer-editor"
    )
    assert (await admin.patch(f"/admin/users/{editor_id}", json={"role": "editor"})).status_code == 200
    editor_secret = (await _token(editor))["token"]
    editor_caps = await plugin.get(
        "/integrations/obsidian/v1/capabilities",
        headers=_auth(editor_secret),
    )
    assert editor_caps.status_code == 200
    assert editor_caps.json()["can_propose_to_rhizome"] is False
    blocked = await plugin.post(
        "/proposals",
        headers=_auth(editor_secret),
        json={"paths": ["offer.md"], "summary": "editor must not offer"},
    )
    assert blocked.status_code == 403
    assert "cannot propose" in blocked.json()["detail"]
    await plugin.aclose()
    await editor.aclose()
    await author.aclose()

