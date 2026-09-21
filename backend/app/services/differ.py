from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import SharedRepository
from app.models.inbound_notice import InboundNotice
from app.models.personal_upload import PersonalUpload, UploadEvent
from app.models.proposal import Proposal, ProposalStatus
from app.models.shared_note import SharedNote
from app.models.user import User
from app.services.audit import record_audit_event
from app.services.closed_corpus import closed_paths_for_user
from app.services.index import reindex_personal_uploads
from app.services.markdown import parse_markdown
from app.services.notify import notify_card_changes
from app.services.proposal import ProposalError, _paths
from app.services.provenance import record_personal_edit_events
from app.services.repository import SHARED_SINGLETON_ID, ensure_local_shared, published_sha


def _title_from_path(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    if name.lower().endswith(".md"):
        name = name[:-3]
    return name[:200] or "note"


async def list_differences(
    database: AsyncSession,
    user: User,
    *,
    include_inbound: bool = True,
) -> dict[str, object]:
    """Path list from local stores. Hashes only — no GitHub, no bodies, no wikidiff2."""
    shared = await ensure_local_shared(database)
    if not published_sha(shared):
        raise ProposalError(409, "the shared rhizome is not connected")
    closed = await closed_paths_for_user(database, user.id)
    # Working copy only (TZ 2.96). card_revisions are rollback history, not Differ.
    uploads = list(
        (
            await database.execute(
                select(
                    PersonalUpload.path,
                    PersonalUpload.content_hash,
                    PersonalUpload.updated_at,
                ).where(PersonalUpload.user_id == user.id)
            )
        ).all()
    )
    inbound: list[dict[str, object]] = []
    inbound_shown: set[str] = set()
    if include_inbound:
        inbound_paths = await subscribed_inbound_paths(database, user.id, closed)
        inbound = await _inbound_items(database, user.id, inbound_paths)
        inbound_shown = {item["path"] for item in inbound}
        await _record_inbound_notices(database, user, [item["path"] for item in inbound])
    if not uploads:
        return {"differences": [], "inbound": inbound}
    payload = await _differ_from_hashes(database, uploads)
    payload["differences"] = [
        item
        for item in payload["differences"]
        if item["path"] not in closed and item["path"] not in inbound_shown
    ]
    payload["inbound"] = inbound
    return payload


def _safe_differ_path(path: str) -> str:
    value = path.strip()
    parts = value.split("/")
    if (
        not value
        or value.startswith("/")
        or "\\" in value
        or any(part in {"", ".", ".."} or part.startswith(".") for part in parts)
    ):
        raise ProposalError(400, "path is invalid")
    return value


async def get_difference_file(
    database: AsyncSession,
    user: User,
    path: str,
) -> dict[str, object]:
    note_path = _safe_differ_path(path)
    shared = await ensure_local_shared(database)
    if not published_sha(shared):
        raise ProposalError(409, "the shared rhizome is not connected")
    closed = await closed_paths_for_user(database, user.id)
    if note_path in closed:
        raise ProposalError(404, "path is closed")
    upload = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == user.id,
            PersonalUpload.path == note_path,
        )
    )
    shared_note = await database.scalar(select(SharedNote).where(SharedNote.path == note_path))
    if upload is None and shared_note is None:
        raise ProposalError(404, "personal card not found")
    if upload is None:
        kind = "changed"
        incoming_body = shared_note.body
        incoming_updated = shared_note.updated_at
        current_body = ""
        current_updated = None
        path = shared_note.path
    elif shared_note is None:
        kind = "added"
        incoming_body = ""
        incoming_updated = None
        current_body = upload.body
        current_updated = upload.updated_at
        path = upload.path
    elif shared_note.body != upload.body:
        kind = "changed"
        incoming_body = shared_note.body
        incoming_updated = shared_note.updated_at
        current_body = upload.body
        current_updated = upload.updated_at
        path = upload.path
    else:
        kind = "same"
        incoming_body = shared_note.body
        incoming_updated = shared_note.updated_at
        current_body = upload.body
        current_updated = upload.updated_at
        path = upload.path
    author = {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name or user.username,
    }
    return {
        "path": path,
        "title": _title_from_path(path),
        "kind": kind,
        "incoming": {
            "layer": "shared",
            "path": path,
            "body": incoming_body,
            "author": None,
            "updated_at": incoming_updated,
        },
        "current": {
            "layer": "personal",
            "path": path,
            "body": current_body,
            "author": author,
            "updated_at": current_updated,
        },
    }


async def _differ_from_hashes(
    database: AsyncSession,
    uploads: list,
) -> dict[str, object]:
    shared_hashes = {
        row.path: row.content_hash
        for row in (await database.execute(select(SharedNote.path, SharedNote.content_hash))).all()
    }
    differences: list[dict[str, object]] = []
    for row in sorted(uploads, key=lambda item: item.path):
        stamp = row.updated_at
        if row.path not in shared_hashes:
            differences.append({
                "path": row.path,
                "title": _title_from_path(row.path),
                "kind": "added",
                "updated_at": stamp,
            })
            continue
        if shared_hashes[row.path] != row.content_hash:
            differences.append({
                "path": row.path,
                "title": _title_from_path(row.path),
                "kind": "changed",
                "updated_at": stamp,
            })
    return {"differences": differences}


async def subscribed_inbound_paths(
    database: AsyncSession,
    user_id,
    closed: set[str],
) -> set[str]:
    rows = (
        await database.scalars(
            select(Proposal).where(
                Proposal.author_user_id == user_id,
                Proposal.status == ProposalStatus.PUBLISHED.value,
            )
        )
    ).all()
    paths: set[str] = set()
    for row in rows:
        paths.update(_paths(row.scope_paths))
    return {path for path in paths if path not in closed}


async def _inbound_items(
    database: AsyncSession,
    user_id,
    inbound_paths: set[str],
) -> list[dict[str, object]]:
    if not inbound_paths:
        return []
    shared_rows = {
        item.path: item
        for item in (
            await database.execute(
                select(
                    SharedNote.path,
                    SharedNote.content_hash,
                    SharedNote.updated_at,
                ).where(SharedNote.path.in_(inbound_paths))
            )
        ).all()
    }
    personal_rows = {
        item.path: item
        for item in (
            await database.execute(
                select(
                    PersonalUpload.path,
                    PersonalUpload.content_hash,
                    PersonalUpload.updated_at,
                ).where(
                    PersonalUpload.user_id == user_id,
                    PersonalUpload.path.in_(inbound_paths),
                )
            )
        ).all()
    }
    items: list[dict[str, object]] = []
    for path in sorted(inbound_paths):
        shared = shared_rows.get(path)
        if shared is None:
            continue
        personal = personal_rows.get(path)
        if personal is not None and personal.content_hash == shared.content_hash:
            continue
        if (
            personal is not None
            and personal.updated_at is not None
            and shared.updated_at is not None
            and personal.updated_at >= shared.updated_at
        ):
            continue
        items.append({
            "path": path,
            "title": _title_from_path(path),
            "kind": "changed",
            "updated_at": shared.updated_at,
        })
    return items


async def _record_inbound_notices(
    database: AsyncSession,
    user: User,
    inbound_paths: list[str],
) -> None:
    current = set(inbound_paths)
    existing = {
        row.path: row
        for row in (
            await database.scalars(select(InboundNotice).where(InboundNotice.user_id == user.id))
        ).all()
    }
    fresh = [path for path in inbound_paths if path not in existing]
    stale = [row for path, row in existing.items() if path not in current]
    for row in stale:
        await database.delete(row)
    for path in fresh:
        database.add(InboundNotice(user_id=user.id, path=path))
    if fresh or stale:
        await database.commit()
    if fresh:
        await notify_card_changes(database, user=user, paths=fresh)
        await database.commit()


async def accept_inbound_file(
    database: AsyncSession,
    user: User,
    path: str,
) -> dict[str, object]:
    note_path = _safe_differ_path(path)
    closed = await closed_paths_for_user(database, user.id)
    inbound_paths = await subscribed_inbound_paths(database, user.id, closed)
    items = await _inbound_items(database, user.id, inbound_paths)
    if note_path not in {item["path"] for item in items}:
        raise ProposalError(404, "inbound card not found")
    shared = await database.scalar(select(SharedNote).where(SharedNote.path == note_path))
    if shared is None:
        raise ProposalError(404, "inbound card not found")
    parsed = parse_markdown(note_path, shared.body)
    upload = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == user.id,
            PersonalUpload.path == note_path,
        )
    )
    before = upload.body if upload is not None else ""
    if upload is None:
        database.add(
            PersonalUpload(
                user_id=user.id,
                path=note_path,
                body=shared.body,
                content_hash=parsed.content_hash,
            )
        )
    else:
        upload.body = shared.body
        upload.content_hash = parsed.content_hash
    database.add(UploadEvent(user_id=user.id, path=note_path, content_hash=parsed.content_hash))
    await record_personal_edit_events(
        database,
        user=user,
        path=note_path,
        before_text=before,
        after_text=shared.body,
    )
    record_audit_event(
        database,
        action="differ.accept_inbound",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"path": note_path},
    )
    notice = await database.scalar(
        select(InboundNotice).where(
            InboundNotice.user_id == user.id,
            InboundNotice.path == note_path,
        )
    )
    if notice is not None:
        await database.delete(notice)
    await database.commit()
    try:
        await reindex_personal_uploads(database, user.id)
    except Exception:
        pass
    return await list_differences(database, user)
