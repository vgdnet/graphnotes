from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository
from app.services.github import GitHubAppClient
from app.services.index import IndexerError, ensure_personal_current, ensure_shared_current
from app.services.repository import refresh_personal, refresh_shared

logger = logging.getLogger(__name__)


async def refresh_caller_git(
    database: AsyncSession,
    user_id: uuid.UUID,
    client: GitHubAppClient,
) -> PersonalRepository | None:
    """Update stored HEADs from GitHub. Differ compares trees at this SHA."""
    await refresh_shared(database, client)
    return await refresh_personal(database, user_id, client)


async def pull_personal_git(
    database: AsyncSession,
    user_id: uuid.UUID,
    client: GitHubAppClient,
) -> PersonalRepository | None:
    """Refresh HEADs and rebuild the personal index when the SHA moved."""
    personal = await refresh_caller_git(database, user_id, client)
    try:
        await ensure_shared_current(database, client)
    except IndexerError:
        pass
    if personal is None:
        return None
    try:
        await ensure_personal_current(database, user_id, client)
    except IndexerError:
        pass
    return await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user_id)
    )


async def pull_connected_gits(database: AsyncSession, client: GitHubAppClient) -> None:
    """Refresh shared plus every connected personal git. Used by the in-process poller."""
    await refresh_shared(database, client)
    try:
        await ensure_shared_current(database, client)
    except IndexerError:
        pass
    user_ids = list(await database.scalars(select(PersonalRepository.user_id)))
    for user_id in user_ids:
        try:
            await refresh_personal(database, user_id, client)
            await ensure_personal_current(database, user_id, client)
        except IndexerError:
            continue
        except Exception:
            logger.warning("personal git pull failed for %s", user_id, exc_info=True)
