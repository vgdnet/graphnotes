from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository
from app.services.github import GitHubAppClient

logger = logging.getLogger(__name__)


async def refresh_caller_git(
    database: AsyncSession,
    user_id: uuid.UUID,
    client: GitHubAppClient | None = None,
) -> PersonalRepository | None:
    """Leftover no-op (TZ 3.37). Must not copy GitHub into local stores."""
    del database, user_id, client
    return None


async def pull_personal_git(
    database: AsyncSession,
    user_id: uuid.UUID,
    client: GitHubAppClient | None = None,
) -> PersonalRepository | None:
    """Leftover no-op (TZ 3.37)."""
    del database, user_id, client
    return None


async def pull_connected_gits(database: AsyncSession, client: GitHubAppClient | None = None) -> None:
    """Leftover poller. Disabled: git copy-in would overwrite plugin writes."""
    del database, client
    return None
