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
