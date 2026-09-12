from collections.abc import AsyncIterator
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app import models  # noqa: F401

# Tests use http://testserver. Secure cookies would be dropped on HTTP.
settings.cookie_secure = False


@pytest_asyncio.fixture
async def auth_test_context(
    tmp_path: Path,
) -> AsyncIterator[tuple[AsyncClient, async_sessionmaker[AsyncSession]]]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_database() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_database
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client, session_factory

    app.dependency_overrides.clear()
    await engine.dispose()
