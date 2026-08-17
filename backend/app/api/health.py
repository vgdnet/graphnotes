from asyncpg import PostgresError
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import async_session_factory

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
async def database_health() -> dict[str, str]:
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
    except (OSError, PostgresError, SQLAlchemyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database unavailable",
        ) from exc

    return {"status": "ok", "database": "reachable"}
