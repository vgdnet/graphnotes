from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.graph import router as graph_router
from app.api.health import router as health_router
from app.api.notes import router as notes_router
from app.api.proposals import router as proposals_router
from app.api.repository import router as repository_router
from app.api.users import router as users_router
from app.api.webhooks import router as webhooks_router
from app.core.config import settings
from app.db.session import engine


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(repository_router)
app.include_router(notes_router)
app.include_router(graph_router)
app.include_router(proposals_router)
app.include_router(webhooks_router)
