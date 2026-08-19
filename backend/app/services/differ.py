from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository, SharedRepository
from app.models.user import User
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
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    if shared is None or not published_sha(shared):
        raise ProposalError(409, "the shared rhizome is not connected")
    if personal is None or not personal.observed_sha:
        raise ProposalError(409, "connect your git first")
    shared_ref = published_sha(shared)
    assert shared_ref is not None
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
