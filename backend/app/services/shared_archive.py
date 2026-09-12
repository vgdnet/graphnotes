from __future__ import annotations

import io
import zipfile

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.github import SharedRepository
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.proposal import ProposalError, _github
from app.services.repository import SHARED_SINGLETON_ID, published_sha


async def shared_archive(
    database: AsyncSession,
    client: GitHubAppClient,
) -> bytes:
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    ref = published_sha(shared) if shared is not None else None
    if shared is None or not ref:
        raise ProposalError(409, "the shared rhizome is not connected")
    try:
        paths = await client.list_markdown_files(shared.owner, shared.name, ref)
        if len(paths) > settings.ingest_max_files:
            raise ProposalError(400, "too many notes to download")
        buffer = io.BytesIO()
        unpacked = 0
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in paths:
                text = await client.get_file(shared.owner, shared.name, path, ref)
                payload = text.encode("utf-8")
                unpacked += len(payload)
                if unpacked > settings.ingest_max_unpacked_bytes:
                    raise ProposalError(400, "the shared rhizome is too large to download")
                archive.writestr(path, payload)
    except GitHubAppError as exc:
        raise _github(exc) from exc
    return buffer.getvalue()
