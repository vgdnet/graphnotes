from __future__ import annotations

import hashlib

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models.audit_event import AuditEvent
from app.models.personal_upload import PersonalUpload
from app.models.shared_note import SharedNote
from tests.test_ingest import _register


PREFIX = "/integrations/obsidian/v1"


def _sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


async def _author(client: AsyncClient, username: str = "obsidian-user") -> None:
    await _register(client, username, accept_author=True)


async def _token(
    client: AsyncClient,
    *,
    scopes: list[str] | None = None,
    name: str = "Obsidian",
) -> dict:
    response = await client.post(
        "/users/me/integration-tokens",
        json={
            "name": name,
            "scopes": scopes
            or ["personal:read", "personal:write", "personal:delete"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_token_create_list_revoke_and_secret_kept(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, session_factory = auth_test_context
    await _author(client)
    created = await _token(client, name="Vault")
    assert created["token"].startswith("gnp_")
    assert created["token_prefix"].startswith("gnp_")
    assert "personal:read" in created["scopes"]
    listed = await client.get("/users/me/integration-tokens")
    assert listed.status_code == 200
    tokens = listed.json()["tokens"]
    assert len(tokens) == 1
    assert tokens[0]["token"] == created["token"]
    revoked = await client.delete(f"/users/me/integration-tokens/{created['id']}")
    assert revoked.status_code == 204
    blocked = await client.get(f"{PREFIX}/capabilities", headers=_auth(created["token"]))
    assert blocked.status_code == 401
    assert blocked.json()["error"]["code"] == "invalid_token"
    async with session_factory() as database:
        actions = set(
            (await database.scalars(select(AuditEvent.action))).all()
        )
    assert "integration.token_created" in actions
    assert "integration.token_revoked" in actions


async def test_token_access_history_who_where_which_token(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _session_factory = auth_test_context
    await _author(client)
    empty = await client.get("/users/me/integration-tokens/access")
    assert empty.status_code == 200
    assert empty.json()["access"] == []
    assert empty.json()["retention_days"] == 183
    assert empty.json()["retention_days"] <= 366

    created = await _token(client, name="Laptop")
    secret = created["token"]
    headers = {
        **_auth(secret),
        "X-Forwarded-For": "203.0.113.50",
        "User-Agent": "GraphNotes Publisher/1.0",
    }
    first = await client.get(f"{PREFIX}/capabilities", headers=headers)
    assert first.status_code == 200
    repeat = await client.get(f"{PREFIX}/capabilities", headers=headers)
    assert repeat.status_code == 200
    other = await client.get(
        f"{PREFIX}/capabilities",
        headers={
            **_auth(secret),
            "X-Forwarded-For": "198.51.100.9",
            "User-Agent": "GraphNotes Publisher/1.0",
        },
    )
    assert other.status_code == 200

    listed = await client.get("/users/me/integration-tokens/access")
    assert listed.status_code == 200
    access = listed.json()["access"]
    assert secret not in listed.text
    assert len(access) == 2
    assert {row["ip"] for row in access} == {"203.0.113.50", "198.51.100.9"}
    assert {row["username"] for row in access} == {"obsidian-user"}
    assert {row["token_name"] for row in access} == {"Laptop"}
    assert all(row["token_prefix"] == created["token_prefix"] for row in access)
    assert all(row["user_agent"] == "GraphNotes Publisher/1.0" for row in access)
    assert all("token" not in row for row in access)

    revoked = await client.delete(f"/users/me/integration-tokens/{created['id']}")
    assert revoked.status_code == 204
    after = await client.get("/users/me/integration-tokens/access")
    assert after.status_code == 200
    assert len(after.json()["access"]) == 2
    blocked = await client.get(f"{PREFIX}/capabilities", headers=_auth(secret))
    assert blocked.status_code == 401

    await client.post("/auth/logout")
    denied = await client.get("/users/me/integration-tokens/access")
    assert denied.status_code == 401


async def test_capabilities_manifest_one_note_transfer(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, session_factory = auth_test_context
    await _author(client)
    secret = (await _token(client))["token"]
    caps = await client.get(f"{PREFIX}/capabilities", headers=_auth(secret))
    assert caps.status_code == 200
    body = caps.json()
    assert body["protocol_version"] == "1.0"
    assert body["write_allowed"] is True
    assert body["write_block_reason"] is None
    assert "md" in body["formats"]
    assert body["links"]["personal_graph"].endswith("#/graph")
    assert "Cache-Control" in caps.headers
    assert caps.headers["cache-control"] == "no-store"

    empty = await client.get(f"{PREFIX}/manifest", headers=_auth(secret))
    assert empty.status_code == 200
    assert empty.json()["items"] == []
    snapshot = empty.json()["snapshot_id"]
    assert snapshot

    note = "# Память\n\nс плагина\n".encode("utf-8")
    digest = _sha(note)
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers={**_auth(secret), "Idempotency-Key": "plan-1"},
        json={
            "client_id": "11111111-1111-1111-1111-111111111111",
            "operations": [
                {
                    "op": "upsert",
                    "path": "Темы/Память.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": digest,
                    "size": len(note),
                }
            ],
        },
    )
    assert plan.status_code == 201, plan.text
    transfer_id = plan.json()["transfer_id"]
    assert plan.json()["state"] == "awaiting_upload"
    assert plan.json()["required_blobs"] == [{"sha256": digest, "size": len(note)}]

    replay = await client.post(
        f"{PREFIX}/transfers",
        headers={**_auth(secret), "Idempotency-Key": "plan-1"},
        json={
            "client_id": "11111111-1111-1111-1111-111111111111",
            "operations": [
                {
                    "op": "upsert",
                    "path": "Темы/Память.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": digest,
                    "size": len(note),
                }
            ],
        },
    )
    assert replay.status_code == 201
    assert replay.json()["transfer_id"] == transfer_id

    mismatch = await client.post(
        f"{PREFIX}/transfers",
        headers={**_auth(secret), "Idempotency-Key": "plan-1"},
        json={
            "client_id": "11111111-1111-1111-1111-111111111111",
            "operations": [
                {
                    "op": "upsert",
                    "path": "Другое.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": digest,
                    "size": len(note),
                }
            ],
        },
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["error"]["code"] == "idempotency_mismatch"

    uploaded = await client.put(
        f"{PREFIX}/transfers/{transfer_id}/blobs/{digest}",
        headers={**_auth(secret), "Content-Type": "application/octet-stream"},
        content=note,
    )
    assert uploaded.status_code == 204
    again = await client.put(
        f"{PREFIX}/transfers/{transfer_id}/blobs/{digest}",
        headers={**_auth(secret), "Content-Type": "application/octet-stream"},
        content=note,
    )
    assert again.status_code == 204

    committed = await client.post(
        f"{PREFIX}/transfers/{transfer_id}/commit",
        headers=_auth(secret),
    )
    assert committed.status_code == 202, committed.text
    assert committed.json()["state"] == "succeeded"
    assert committed.json()["files_applied"] is True
    version = committed.json()["results"][0]["version"]
    assert version

    status = await client.get(
        f"{PREFIX}/transfers/{transfer_id}", headers=_auth(secret)
    )
    assert status.json()["state"] == "succeeded"

    manifest = await client.get(f"{PREFIX}/manifest", headers=_auth(secret))
    items = manifest.json()["items"]
    assert len(items) == 1
    assert items[0]["path"] == "Темы/Память.md"
    assert items[0]["sha256"] == digest
    assert items[0]["version"] == version

    content = await client.get(
        f"{PREFIX}/files/content",
        params={"path": "Темы/Память.md"},
        headers=_auth(secret),
    )
    assert content.status_code == 200
    assert content.content == note
    assert content.headers["x-graphnotes-version"] == version

    async with session_factory() as database:
        stored = (
            await database.scalars(select(PersonalUpload))
        ).all()
        assert len(stored) == 1
        assert stored[0].body == note.decode("utf-8")
        shared = (await database.scalars(select(SharedNote))).all()
        assert shared == []
        actions = set((await database.scalars(select(AuditEvent.action))).all())
    assert "integration.transfer_applied" in actions
    assert "integration.transfer_indexed" in actions


async def test_version_conflict_is_atomic(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, session_factory = auth_test_context
    await _author(client, "conflict-user")
    secret = (await _token(client))["token"]
    first = b"# One\n"
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "client-a",
            "operations": [
                {
                    "op": "upsert",
                    "path": "note.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(first),
                    "size": len(first),
                }
            ],
        },
    )
    transfer_id = plan.json()["transfer_id"]
    await client.put(
        f"{PREFIX}/transfers/{transfer_id}/blobs/{_sha(first)}",
        headers=_auth(secret),
        content=first,
    )
    done = await client.post(
        f"{PREFIX}/transfers/{transfer_id}/commit", headers=_auth(secret)
    )
    version = done.json()["results"][0]["version"]

    stale = b"# Stale\n"
    stale_plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "client-a",
            "operations": [
                {
                    "op": "upsert",
                    "path": "note.md",
                    "kind": "markdown",
                    "expected_version": "not-the-version",
                    "sha256": _sha(stale),
                    "size": len(stale),
                }
            ],
        },
    )
    stale_id = stale_plan.json()["transfer_id"]
    await client.put(
        f"{PREFIX}/transfers/{stale_id}/blobs/{_sha(stale)}",
        headers=_auth(secret),
        content=stale,
    )
    conflicted = await client.post(
        f"{PREFIX}/transfers/{stale_id}/commit", headers=_auth(secret)
    )
    assert conflicted.status_code == 409
    assert conflicted.json()["error"]["code"] == "version_conflict"
    assert conflicted.json()["error"]["details"][0]["current_version"] == version

    async with session_factory() as database:
        stored = (await database.scalars(select(PersonalUpload))).one()
        assert stored.body == first.decode()


async def test_create_existing_path_without_version_is_conflict(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _ = auth_test_context
    await _author(client, "first-send")
    secret = (await _token(client))["token"]
    payload = b"# Exists\n"
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c1",
            "operations": [
                {
                    "op": "upsert",
                    "path": "exists.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(payload),
                    "size": len(payload),
                }
            ],
        },
    )
    tid = plan.json()["transfer_id"]
    await client.put(
        f"{PREFIX}/transfers/{tid}/blobs/{_sha(payload)}",
        headers=_auth(secret),
        content=payload,
    )
    await client.post(f"{PREFIX}/transfers/{tid}/commit", headers=_auth(secret))

    other = b"# Other\n"
    second = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c1",
            "operations": [
                {
                    "op": "upsert",
                    "path": "exists.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(other),
                    "size": len(other),
                }
            ],
        },
    )
    sid = second.json()["transfer_id"]
    await client.put(
        f"{PREFIX}/transfers/{sid}/blobs/{_sha(other)}",
        headers=_auth(secret),
        content=other,
    )
    result = await client.post(
        f"{PREFIX}/transfers/{sid}/commit", headers=_auth(secret)
    )
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "version_conflict"


async def test_admin_token_cannot_see_foreign_transfer(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    owner, _ = auth_test_context
    await _author(owner, "owner-user")
    owner_token = (await _token(owner))["token"]
    payload = b"# Mine\n"
    plan = await owner.post(
        f"{PREFIX}/transfers",
        headers=_auth(owner_token),
        json={
            "client_id": "own",
            "operations": [
                {
                    "op": "upsert",
                    "path": "mine.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(payload),
                    "size": len(payload),
                }
            ],
        },
    )
    transfer_id = plan.json()["transfer_id"]

    other = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    async with other:
        await _register(other, "admin-obsidian", accept_author=True)
        # even an author with a token cannot see another user's transfer
        other_token = (await _token(other, name="Admin vault"))["token"]
        seen = await other.get(
            f"{PREFIX}/transfers/{transfer_id}", headers=_auth(other_token)
        )
        assert seen.status_code == 404
        assert seen.json()["error"]["code"] == "not_found"
        assert "mine.md" not in seen.text


async def test_invalid_path_and_hash_mismatch(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _ = auth_test_context
    await _author(client, "guard-user")
    secret = (await _token(client))["token"]
    traversal = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": "../secret.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": "a" * 64,
                    "size": 1,
                }
            ],
        },
    )
    assert traversal.status_code == 400
    assert traversal.json()["error"]["code"] == "invalid_path"

    good = b"# Ok\n"
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": "ok.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(good),
                    "size": len(good),
                }
            ],
        },
    )
    tid = plan.json()["transfer_id"]
    bad = await client.put(
        f"{PREFIX}/transfers/{tid}/blobs/{_sha(good)}",
        headers=_auth(secret),
        content=b"# Different\n",
    )
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "hash_mismatch"


async def test_delete_requires_scope_and_removes_note(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, session_factory = auth_test_context
    await _author(client, "delete-user")
    read_write = (
        await _token(client, scopes=["personal:read", "personal:write"], name="no-delete")
    )["token"]
    payload = b"# Drop me\n"
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(read_write),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": "drop.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(payload),
                    "size": len(payload),
                }
            ],
        },
    )
    tid = plan.json()["transfer_id"]
    await client.put(
        f"{PREFIX}/transfers/{tid}/blobs/{_sha(payload)}",
        headers=_auth(read_write),
        content=payload,
    )
    committed = await client.post(
        f"{PREFIX}/transfers/{tid}/commit", headers=_auth(read_write)
    )
    version = committed.json()["results"][0]["version"]

    denied = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(read_write),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "delete",
                    "path": "drop.md",
                    "expected_version": version,
                }
            ],
        },
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "insufficient_scope"

    full = (await _token(client, name="with-delete"))["token"]
    deletion = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(full),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "delete",
                    "path": "drop.md",
                    "expected_version": version,
                }
            ],
        },
    )
    did = deletion.json()["transfer_id"]
    assert deletion.json()["state"] == "ready"
    gone = await client.post(
        f"{PREFIX}/transfers/{did}/commit", headers=_auth(full)
    )
    assert gone.status_code == 202
    assert gone.json()["state"] == "succeeded"
    async with session_factory() as database:
        assert (await database.scalars(select(PersonalUpload))).all() == []


async def test_author_contract_blocks_write_and_revoked_token_skips_apply(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, session_factory = auth_test_context
    await _register(client, "plain-obsidian", accept_author=False)
    secret = (
        await _token(client, scopes=["personal:read", "personal:write"], name="plain")
    )["token"]
    caps = await client.get(f"{PREFIX}/capabilities", headers=_auth(secret))
    assert caps.json()["write_allowed"] is False
    assert caps.json()["write_block_reason"] == "author_contract_required"
    payload = b"# No\n"
    blocked = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": "no.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(payload),
                    "size": len(payload),
                }
            ],
        },
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "author_contract_required"

    accepted = await client.post(
        "/users/me/author-contract", json={"accepted": True}
    )
    assert accepted.status_code == 200
    created = await _token(client, name="after-contract")
    secret = created["token"]
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": "later.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(payload),
                    "size": len(payload),
                }
            ],
        },
    )
    tid = plan.json()["transfer_id"]
    await client.put(
        f"{PREFIX}/transfers/{tid}/blobs/{_sha(payload)}",
        headers=_auth(secret),
        content=payload,
    )
    await client.delete(f"/users/me/integration-tokens/{created['id']}")
    commit = await client.post(
        f"{PREFIX}/transfers/{tid}/commit", headers=_auth(secret)
    )
    assert commit.status_code == 401
    async with session_factory() as database:
        assert (await database.scalars(select(PersonalUpload))).all() == []


async def test_png_attachment_and_cancel(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _ = auth_test_context
    await _author(client, "asset-user")
    secret = (await _token(client))["token"]
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    digest = _sha(png)
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": "img/pic.png",
                    "kind": "png",
                    "expected_version": None,
                    "sha256": digest,
                    "size": len(png),
                }
            ],
        },
    )
    tid = plan.json()["transfer_id"]
    cancelled = await client.delete(
        f"{PREFIX}/transfers/{tid}", headers=_auth(secret)
    )
    assert cancelled.status_code == 204
    late = await client.put(
        f"{PREFIX}/transfers/{tid}/blobs/{digest}",
        headers=_auth(secret),
        content=png,
    )
    assert late.status_code == 409

    plan2 = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": "img/pic.png",
                    "kind": "png",
                    "expected_version": None,
                    "sha256": digest,
                    "size": len(png),
                }
            ],
        },
    )
    tid2 = plan2.json()["transfer_id"]
    uploaded = await client.put(
        f"{PREFIX}/transfers/{tid2}/blobs/{digest}",
        headers=_auth(secret),
        content=png,
    )
    assert uploaded.status_code == 204
    done = await client.post(
        f"{PREFIX}/transfers/{tid2}/commit", headers=_auth(secret)
    )
    assert done.status_code == 202
    assert done.json()["state"] == "succeeded"
    content = await client.get(
        f"{PREFIX}/files/content",
        params={"path": "img/pic.png"},
        headers=_auth(secret),
    )
    assert content.content == png
    assert content.headers["x-graphnotes-kind"] == "png"


async def test_commit_replay_does_not_duplicate(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, session_factory = auth_test_context
    await _author(client, "replay-user")
    secret = (await _token(client))["token"]
    payload = b"# Once\n"
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": "once.md",
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": _sha(payload),
                    "size": len(payload),
                }
            ],
        },
    )
    tid = plan.json()["transfer_id"]
    await client.put(
        f"{PREFIX}/transfers/{tid}/blobs/{_sha(payload)}",
        headers=_auth(secret),
        content=payload,
    )
    first = await client.post(f"{PREFIX}/transfers/{tid}/commit", headers=_auth(secret))
    second = await client.post(f"{PREFIX}/transfers/{tid}/commit", headers=_auth(secret))
    assert first.json()["state"] == "succeeded"
    assert second.status_code == 202
    assert second.json()["state"] == "succeeded"
    assert second.json()["results"] == first.json()["results"]
    async with session_factory() as database:
        rows = (await database.scalars(select(PersonalUpload))).all()
        assert len(rows) == 1


async def _transfer_note(
    client: AsyncClient,
    secret: str,
    path: str,
    payload: bytes,
) -> object:
    digest = _sha(payload)
    plan = await client.post(
        f"{PREFIX}/transfers",
        headers=_auth(secret),
        json={
            "client_id": "c",
            "operations": [
                {
                    "op": "upsert",
                    "path": path,
                    "kind": "markdown",
                    "expected_version": None,
                    "sha256": digest,
                    "size": len(payload),
                }
            ],
        },
    )
    assert plan.status_code == 201, plan.text
    tid = plan.json()["transfer_id"]
    uploaded = await client.put(
        f"{PREFIX}/transfers/{tid}/blobs/{digest}",
        headers=_auth(secret),
        content=payload,
    )
    assert uploaded.status_code == 204
    return await client.post(f"{PREFIX}/transfers/{tid}/commit", headers=_auth(secret))


async def test_plugin_white_noise_rejects_without_locking_account(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    from app.models.user import User

    client, session_factory = auth_test_context
    await _author(client, "plugin-noise")
    secret = (await _token(client))["token"]
    soup = "".join("!@#$%^&*()[]{}<>/\\|+=~`"[(i * 7) % 22] for i in range(200)).encode()
    result = await _transfer_note(client, secret, "junk.md", soup)
    assert result.status_code == 415
    assert result.json()["error"]["code"] == "unsupported_type"

    me = await client.get("/users/me")
    assert me.status_code == 200
    async with session_factory() as database:
        user = await database.scalar(select(User).where(User.username == "plugin-noise"))
        assert user is not None
        assert user.is_active is True
        assert (await database.scalars(select(PersonalUpload))).all() == []
        actions = set((await database.scalars(select(AuditEvent.action))).all())
    assert "ingest.white_noise_lock" not in actions


async def test_connected_git_does_not_disable_plugin_write(
    auth_test_context: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
    monkeypatch,
) -> None:
    from tests.test_ingest import _connect_pair, _github, _install

    client, _ = auth_test_context
    _install(monkeypatch, _github())
    await _author(client, "git-plugin-user")
    await _connect_pair(client, "vgdnet/guide_psy")
    secret = (await _token(client))["token"]
    caps = await client.get(f"{PREFIX}/capabilities", headers=_auth(secret))
    assert caps.status_code == 200
    assert caps.json()["write_allowed"] is True
    assert caps.json()["write_block_reason"] is None
    note = "# From plugin\nwith git connected\n".encode()
    done = await _transfer_note(client, secret, "plugin-with-git.md", note)
    assert done.status_code == 202, done.text
    assert done.json()["state"] == "succeeded"
    found = await client.get("/search", params={"q": "plugin-with-git", "layer": "personal"})
    assert found.status_code == 200
    paths = {item["path"] for item in found.json()["hits"]}
    assert "personal:plugin-with-git.md" in paths
    graph = await client.get("/graph/personal")
    assert graph.status_code == 200
    assert "plugin-with-git.md" in {node["path"] for node in graph.json()["nodes"]}
    shared = await client.get("/graph/shared")
    assert "plugin-with-git.md" not in {node["path"] for node in shared.json()["nodes"]}
