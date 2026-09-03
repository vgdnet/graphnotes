from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository, SharedRepository
from app.models.personal_upload import PersonalUpload
from app.models.user import User
from app.services.closed_corpus import closed_paths_for_user
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.proposal import ProposalError, _github
from app.services.repository import SHARED_SINGLETON_ID, published_sha


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
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    closed = await closed_paths_for_user(database, user.id)
    if personal is not None and personal.observed_sha:
        payload = await _differ_from_git(client, shared, personal)
    else:
        uploads = list(
            (
                await database.scalars(
                    select(PersonalUpload).where(PersonalUpload.user_id == user.id)
                )
            ).all()
        )
        if not uploads:
            return {"differences": []}
        payload = await _differ_from_uploads(client, shared, uploads)
    payload["differences"] = [
        item for item in payload["differences"] if item["path"] not in closed
    ]
    return payload


async def _differ_from_git(
    client: GitHubAppClient,
    shared: SharedRepository,
    personal: PersonalRepository,
) -> dict[str, object]:
    shared_ref = published_sha(shared)
    assert shared_ref is not None
    assert personal.observed_sha is not None
    try:
        personal_blobs = await client.list_markdown_blobs(
            personal.owner, personal.name, personal.observed_sha
        )
        shared_blobs = await client.list_markdown_blobs(
            shared.owner, shared.name, shared_ref
        )
    except GitHubAppError as exc:
        raise _github(exc) from exc
    differences: list[dict[str, str]] = []
    for path, blob in sorted(personal_blobs.items()):
        if path not in shared_blobs:
            differences.append({"path": path, "title": _title_from_path(path), "kind": "added"})
            continue
        if blob != shared_blobs[path]:
            differences.append({"path": path, "title": _title_from_path(path), "kind": "changed"})
    return {"differences": differences}


async def _differ_from_uploads(
    client: GitHubAppClient,
    shared: SharedRepository,
    uploads: list[PersonalUpload],
) -> dict[str, object]:
    shared_ref = published_sha(shared)
    assert shared_ref is not None
    try:
        shared_listed = set(await client.list_markdown_files(shared.owner, shared.name, shared_ref))
    except GitHubAppError as exc:
        raise _github(exc) from exc
    differences: list[dict[str, str]] = []
    for row in sorted(uploads, key=lambda item: item.path):
        if row.path not in shared_listed:
            differences.append({"path": row.path, "title": _title_from_path(row.path), "kind": "added"})
            continue
        try:
            current = await client.get_file(shared.owner, shared.name, row.path, shared_ref)
        except GitHubAppError as exc:
            raise _github(exc) from exc
        if current != row.body:
            differences.append({"path": row.path, "title": _title_from_path(row.path), "kind": "changed"})
    return {"differences": differences}
