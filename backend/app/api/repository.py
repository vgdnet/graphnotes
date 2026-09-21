from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.dependencies import CurrentAdmin, CurrentUser, DatabaseSession, OptionalUser
from app.models.github import PersonalRepository, SharedRepository
from app.schemas.repository import (
    RepositoryStatus,
    RepositoryStatusResponse,
)
from app.services.repository import (
    SHARED_SINGLETON_ID,
    RepositoryBindError,
    connect_shared_repository,
    public_status,
)

router = APIRouter(tags=["repository"])


def _shared_payload(row: SharedRepository | None) -> RepositoryStatus:
    payload = public_status(row)
    if payload is None:
        return RepositoryStatus(connected=False, status="not_connected")
    return RepositoryStatus.model_validate(payload)


def _personal_payload(row: PersonalRepository | None) -> RepositoryStatus | None:
    payload = public_status(row)
    if payload is None:
        return None
    return RepositoryStatus.model_validate(payload)


@router.get("/repository/status", response_model=RepositoryStatusResponse)
async def repository_status(
    database: DatabaseSession,
    user: OptionalUser,
) -> RepositoryStatusResponse:
    """Last stored connector status. No GitHub live-pull (TZ 3.37)."""
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    personal = None
    if user is not None:
        personal = await database.scalar(
            select(PersonalRepository).where(PersonalRepository.user_id == user.id)
        )
    return RepositoryStatusResponse(
        shared=_shared_payload(shared),
        personal=_personal_payload(personal) if user is not None else None,
    )


@router.post("/repository/connect", response_model=RepositoryStatusResponse)
async def connect_shared(
    admin: CurrentAdmin,
    database: DatabaseSession,
) -> RepositoryStatusResponse:
    try:
        shared = await connect_shared_repository(
            database,
            admin=admin,
        )
    except RepositoryBindError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return RepositoryStatusResponse(shared=_shared_payload(shared), personal=None)


@router.post("/personal/connect")
async def connect_personal(user: CurrentUser) -> None:
    del user
    raise HTTPException(
        status_code=410,
        detail="personal git connect is not offered; ingest is the Obsidian plugin",
    )


@router.delete("/personal/connect")
async def disconnect_personal(user: CurrentUser) -> None:
    del user
    raise HTTPException(
        status_code=410,
        detail="personal git connect is not offered; ingest is the Obsidian plugin",
    )
