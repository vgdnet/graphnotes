from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.dependencies import CurrentAdmin, CurrentUser, DatabaseSession
from app.core.config import settings
from app.models.github import PersonalRepository, SharedRepository
from app.models.graph import NoteLayer
from app.schemas.graph import GraphResponse, RebuildRequest
from app.services.github import GitHubAppClient
from app.services.index import (
    IndexerError,
    ensure_personal_current,
    ensure_shared_current,
    index_status_label,
    load_graph,
    load_overlay,
    rebuild_personal,
    rebuild_shared,
)
from app.services.repository import SHARED_SINGLETON_ID, refresh_personal, refresh_shared

router = APIRouter(tags=["graph"])


def _client() -> GitHubAppClient:
    return GitHubAppClient()


def _raise(error: IndexerError) -> None:
    raise HTTPException(status_code=error.status_code, detail=error.detail) from error


def _limit(limit: int) -> int:
    return max(1, min(limit, settings.graph_page_max))


@router.get("/graph/shared", response_model=GraphResponse)
async def shared_graph(
    database: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = settings.graph_page_limit,
    center: str | None = None,
    depth: Annotated[int, Query(ge=0, le=4)] = 1,
) -> GraphResponse:
    client = _client()
    await refresh_shared(database, client)
    try:
        await ensure_shared_current(database, client)
    except IndexerError:
        pass
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not shared.indexed_sha:
        return GraphResponse(layer="shared", index_status="empty", nodes=[], edges=[])
    payload = await load_graph(
        database,
        layer=NoteLayer.SHARED.value,
        owner_id=None,
        revision=shared.indexed_sha,
        limit=_limit(limit),
        center=center,
        depth=depth,
    )
    payload["index_status"] = index_status_label(
        shared.observed_sha, shared.indexed_sha, shared.index_status
    )
    return GraphResponse.model_validate(payload)


@router.get("/graph/personal", response_model=GraphResponse)
async def personal_graph(
    user: CurrentUser,
    database: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = settings.graph_page_limit,
    center: str | None = None,
    depth: Annotated[int, Query(ge=0, le=4)] = 1,
) -> GraphResponse:
    client = _client()
    await refresh_personal(database, user.id, client)
    try:
        await ensure_personal_current(database, user.id, client)
    except IndexerError:
        pass
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    if personal is None or not personal.indexed_sha:
        return GraphResponse(layer="personal", index_status="empty", nodes=[], edges=[])
    payload = await load_graph(
        database,
        layer=NoteLayer.PERSONAL.value,
        owner_id=user.id,
        revision=personal.indexed_sha,
        limit=_limit(limit),
        center=center,
        depth=depth,
    )
    payload["index_status"] = index_status_label(
        personal.observed_sha, personal.indexed_sha, personal.index_status
    )
    return GraphResponse.model_validate(payload)


@router.get("/graph/personal-overlay", response_model=GraphResponse)
async def personal_overlay(
    user: CurrentUser,
    database: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = settings.graph_page_limit,
    center: str | None = None,
    depth: Annotated[int, Query(ge=0, le=4)] = 1,
) -> GraphResponse:
    client = _client()
    await refresh_shared(database, client)
    await refresh_personal(database, user.id, client)
    try:
        await ensure_shared_current(database, client)
        await ensure_personal_current(database, user.id, client)
    except IndexerError:
        pass
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not shared.indexed_sha:
        return GraphResponse(layer="overlay", index_status="empty", nodes=[], edges=[])
    payload = await load_graph(
        database,
        layer=NoteLayer.SHARED.value,
        owner_id=None,
        revision=shared.indexed_sha,
        limit=_limit(limit),
        center=center,
        depth=depth,
    )
    payload["index_status"] = index_status_label(
        shared.observed_sha, shared.indexed_sha, shared.index_status
    )
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    if personal is None or not personal.indexed_sha:
        payload["layer"] = "overlay"
        return GraphResponse.model_validate(payload)
    overlay = await load_overlay(
        database,
        owner_id=user.id,
        personal_revision=personal.indexed_sha,
        shared_payload=payload,
        overlay_limit=_limit(limit),
    )
    if personal.index_status == "error" or shared.index_status == "error":
        overlay["index_status"] = "error"
    return GraphResponse.model_validate(overlay)


@router.post("/index/rebuild", response_model=GraphResponse)
async def rebuild_index(
    payload: RebuildRequest,
    admin: CurrentAdmin,
    database: DatabaseSession,
) -> GraphResponse:
    client = _client()
    try:
        if payload.target == "shared":
            await refresh_shared(database, client)
            await rebuild_shared(database, client, actor_user_id=admin.id)
            return await shared_graph(database)
        await refresh_personal(database, admin.id, client)
        await rebuild_personal(database, admin.id, client, actor_user_id=admin.id)
        return await personal_graph(admin, database)
    except IndexerError as exc:
        _raise(exc)
        raise
