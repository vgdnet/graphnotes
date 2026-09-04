from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
import asyncio
import logging

from fastapi import FastAPI

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.author import router as author_router
from app.api.graph import router as graph_router
from app.api.health import router as health_router
from app.api.notes import router as notes_router
from app.api.contributions import router as contributions_router
from app.api.proposals import router as proposals_router
from app.api.repository import router as repository_router
from app.api.users import router as users_router
from app.api.webhooks import router as webhooks_router
from app.core.config import settings
from app.db.session import async_session_factory, engine
from app.services.github import GitHubAppClient
from app.services.sync import pull_connected_gits

logger = logging.getLogger(__name__)


async def _personal_sync_loop() -> None:
    interval = settings.personal_sync_interval_seconds
    if interval <= 0:
        return
    while True:
        await asyncio.sleep(interval)
        try:
            async with async_session_factory() as database:
                await pull_connected_gits(database, GitHubAppClient())
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("periodic personal git pull failed", exc_info=True)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(_personal_sync_loop())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        await engine.dispose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(author_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(repository_router)
app.include_router(notes_router)
app.include_router(graph_router)
app.include_router(proposals_router)
app.include_router(contributions_router)
app.include_router(webhooks_router)
