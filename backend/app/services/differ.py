from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import SharedRepository
from app.models.personal_upload import PersonalUpload
from app.models.shared_note import SharedNote
from app.models.user import User
from app.services.closed_corpus import closed_paths_for_user
from app.services.github import GitHubAppClient
from app.services.proposal import ProposalError
from app.services.repository import SHARED_SINGLETON_ID, published_sha
from app.services.sync import refresh_caller_git


def _title_from_path(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    if name.lower().endswith(".md"):
        name = name[:-3]
    return name[:200] or "note"


async def list_differences(
    database: AsyncSession,
    user: User,
    client: GitHubAppClient,
) -> dict[str, object]:
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not published_sha(shared):
        raise ProposalError(409, "the shared rhizome is not connected")
    await refresh_caller_git(database, user.id, client)
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not published_sha(shared):
        raise ProposalError(409, "the shared rhizome is not connected")
    closed = await closed_paths_for_user(database, user.id)
    # Working copy only (TZ 2.96). card_revisions are rollback history, not Differ.
    uploads = list(
        (
            await database.scalars(
                select(PersonalUpload).where(PersonalUpload.user_id == user.id)
            )
        ).all()
    )
    if not uploads:
        return {"differences": []}
    payload = await _differ_from_uploads(database, uploads)
    payload["differences"] = [
        item for item in payload["differences"] if item["path"] not in closed
    ]
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
    client: GitHubAppClient,
) -> dict[str, object]:
    note_path = _safe_differ_path(path)
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not published_sha(shared):
        raise ProposalError(409, "the shared rhizome is not connected")
    await refresh_caller_git(database, user.id, client)
    closed = await closed_paths_for_user(database, user.id)
    if note_path in closed:
        raise ProposalError(404, "path is closed")
    upload = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == user.id,
            PersonalUpload.path == note_path,
        )
    )
    if upload is None:
        raise ProposalError(404, "personal card not found")
    shared_note = await database.scalar(select(SharedNote).where(SharedNote.path == note_path))
    if shared_note is None:
        kind = "added"
        incoming_body = ""
        incoming_updated = None
    elif shared_note.body != upload.body:
        kind = "changed"
        incoming_body = shared_note.body
        incoming_updated = shared_note.updated_at
    else:
        kind = "same"
        incoming_body = shared_note.body
        incoming_updated = shared_note.updated_at
    author = {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name or user.username,
    }
    return {
        "path": upload.path,
        "title": _title_from_path(upload.path),
        "kind": kind,
        "incoming": {
            "layer": "shared",
            "path": upload.path,
            "body": incoming_body,
            "author": None,
            "updated_at": incoming_updated,
        },
        "current": {
            "layer": "personal",
            "path": upload.path,
            "body": upload.body,
            "author": author,
            "updated_at": upload.updated_at,
        },
    }


async def _differ_from_uploads(
    database: AsyncSession,
    uploads: list[PersonalUpload],
) -> dict[str, object]:
    shared_rows = {
        item.path: item.body
        for item in (await database.scalars(select(SharedNote))).all()
    }
    differences: list[dict[str, str]] = []
    for row in sorted(uploads, key=lambda item: item.path):
        if row.path not in shared_rows:
            differences.append({"path": row.path, "title": _title_from_path(row.path), "kind": "added"})
            continue
        if shared_rows[row.path] != row.body:
            differences.append({"path": row.path, "title": _title_from_path(row.path), "kind": "changed"})
    return {"differences": differences}
