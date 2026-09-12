from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository, SharedRepository
from app.models.user import User
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.markdown import parse_markdown
from app.services.proposal import ProposalError, _github
from app.services.repository import SHARED_SINGLETON_ID, published_sha


def published_sha(shared: SharedRepository) -> str | None:
    return shared.indexed_sha or shared.observed_sha


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
        personal_paths = await client.list_markdown_files(
            personal.owner, personal.name, personal.observed_sha
        )
        shared_paths = set(
            await client.list_markdown_files(shared.owner, shared.name, shared_ref)
        )
        differences: list[dict[str, str]] = []
        for path in personal_paths:
            personal_text = await client.get_file(
                personal.owner, personal.name, path, personal.observed_sha
            )
            title = parse_markdown(path, personal_text).title
            if path not in shared_paths:
                differences.append({"path": path, "title": title, "kind": "added"})
                continue
            shared_text = await client.get_file(shared.owner, shared.name, path, shared_ref)
            if personal_text != shared_text:
                differences.append({"path": path, "title": title, "kind": "changed"})
    except GitHubAppError as exc:
        raise _github(exc) from exc
    return {"differences": differences}
