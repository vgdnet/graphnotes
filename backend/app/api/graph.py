from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.dependencies import CurrentAdmin, CurrentUser, DatabaseSession, OptionalUser
from app.core.config import settings
from app.models.github import PersonalRepository, SharedRepository
from app.models.graph import NoteLayer
from app.schemas.graph import GraphDiffResponse, GraphResponse, RebuildRequest
from app.schemas.search import SearchResponse
from app.services.github import GitHubAppClient
from app.services.graph_diff import proposal_graph_diff
from app.services.index import (
    IndexerError,
    ensure_personal_current,
    ensure_shared_current,
    index_status_label,
    load_graph,
    load_overlay,
    load_overlay_from_uploads,
    load_personal_from_uploads,
    rebuild_derived_indexes,
)
from app.services.proposal import ProposalError
from app.services.repository import SHARED_SINGLETON_ID, refresh_personal, refresh_shared
from app.services.search import search_visible_cards

router = APIRouter(tags=["graph"])


def _client() -> GitHubAppClient:
    return GitHubAppClient()


def _raise(error: IndexerError) -> None:
    raise HTTPException(status_code=error.status_code, detail=error.detail) from error


def _limit(limit: int) -> int:
    return max(1, min(limit, settings.graph_page_max))


@router.get("/search", response_model=SearchResponse)
async def search_cards(
    database: DatabaseSession,
    viewer: OptionalUser,
    q: Annotated[str, Query(max_length=200)] = "",
    tag: Annotated[str, Query(max_length=80)] = "",
    limit: Annotated[int, Query(ge=1, le=80)] = 40,
    layer: Annotated[str, Query(pattern="^(overlay|personal|shared)$")] = "overlay",
) -> SearchResponse:
    payload = await search_visible_cards(
        database, q, user=viewer, tag=tag, limit=limit, layer=layer, client=_client()
    )
    return SearchResponse.model_validate(payload)


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
        uploads = await load_personal_from_uploads(
            database,
            owner_id=user.id,
            limit=_limit(limit),
            center=center,
            depth=depth,
        )
        return GraphResponse.model_validate(uploads)
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
        overlay = await load_overlay_from_uploads(
            database,
            owner_id=user.id,
            shared_payload=payload,
            overlay_limit=_limit(limit),
        )
        return GraphResponse.model_validate(overlay)
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


@router.get("/graph/diff", response_model=GraphDiffResponse)
async def graph_diff(
    user: CurrentUser,
    database: DatabaseSession,
    proposal_id: UUID,
    limit: Annotated[int, Query(ge=1, le=200)] = settings.graph_page_limit,
) -> GraphDiffResponse:
    try:
        payload = await proposal_graph_diff(
            database,
            user,
            proposal_id,
            _client(),
            limit=_limit(limit),
        )
    except ProposalError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return GraphDiffResponse.model_validate(payload)


@router.post("/index/rebuild", response_model=GraphResponse)
async def rebuild_index(
    payload: RebuildRequest,
    admin: CurrentAdmin,
    database: DatabaseSession,
) -> GraphResponse:
    client = _client()
    try:
        await rebuild_derived_indexes(database, client, actor_user_id=admin.id)
        if payload.target == "shared":
            return await shared_graph(database)
        return await personal_graph(admin, database)
    except IndexerError as exc:
        _raise(exc)
        raise
