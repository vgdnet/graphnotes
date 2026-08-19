from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.api.dependencies import CurrentAdmin, CurrentUser, DatabaseSession
from app.core.config import settings
from app.models.graph import NoteLayer
from app.schemas.graph import GraphResponse, RebuildRequest
from app.services.github import GitHubAppClient
from app.services.index import (
    IndexerError,
    ensure_personal_current,
    ensure_shared_current,
    load_graph,
    rebuild_personal,
    rebuild_shared,
)
from app.services.repository import refresh_personal, refresh_shared

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
    shared = await refresh_shared(database, client)
    try:
        await ensure_shared_current(database, client)
    except IndexerError as exc:
        _raise(exc)
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
    payload["index_status"] = "current" if shared.indexed_sha == shared.observed_sha else "updating"
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
    personal = await refresh_personal(database, user.id, client)
    try:
        await ensure_personal_current(database, user.id, client)
    except IndexerError as exc:
        _raise(exc)
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
    payload["index_status"] = (
        "current" if personal.indexed_sha == personal.observed_sha else "updating"
    )
    return GraphResponse.model_validate(payload)


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
