from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.dependencies import CurrentAdmin, CurrentUser, DatabaseSession, OptionalUser
from app.core.config import settings
from app.models.github import PersonalRepository, SharedRepository
from app.models.graph import NoteLayer
from app.models.personal_upload import PersonalUpload
from app.schemas.graph import GraphDiffResponse, GraphResponse, RebuildRequest
from app.schemas.invites import InviteGraphResponse
from app.schemas.search import SearchResponse
from app.services.invites import list_invite_graph
from app.services.graph_diff import proposal_graph_diff
from app.services.index import (
    IndexerError,
    bound_graph_payload,
    index_status_label,
    load_graph,
    load_overlay,
    load_overlay_from_uploads,
    load_personal_from_uploads,
    overlay_local_shared_seeds,
    rebuild_derived_indexes,
)
from app.services.proposal import ProposalError
from app.services.repository import SHARED_SINGLETON_ID
from app.services.search import search_visible_cards

router = APIRouter(tags=["graph"])


def _raise(error: IndexerError) -> None:
    raise HTTPException(status_code=error.status_code, detail=error.detail) from error


def _limit(limit: int) -> int:
    return max(1, min(limit, settings.graph_page_max))


async def _has_uploads(database, user_id: UUID) -> bool:
    return (
        await database.scalar(
            select(PersonalUpload.id).where(PersonalUpload.user_id == user_id).limit(1)
        )
    ) is not None


@router.get("/search", response_model=SearchResponse)
async def search_cards(
    database: DatabaseSession,
    viewer: OptionalUser,
    q: Annotated[str, Query(max_length=200)] = "",
    tag: Annotated[str, Query(max_length=80)] = "",
    limit: Annotated[int, Query(ge=1, le=80)] = 40,
    layer: Annotated[str, Query(pattern="^(overlay|personal|shared|visible)$")] = "visible",
) -> SearchResponse:
    payload = await search_visible_cards(
        database, q, user=viewer, tag=tag, limit=limit, layer=layer
    )
    return SearchResponse.model_validate(payload)


@router.get("/graph/shared", response_model=GraphResponse)
async def shared_graph(
    database: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = settings.graph_page_limit,
    center: str | None = None,
    depth: Annotated[int, Query(ge=0, le=4)] = 1,
) -> GraphResponse:
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


@router.get("/graph/invites", response_model=InviteGraphResponse)
async def invite_graph(_: CurrentAdmin, database: DatabaseSession) -> InviteGraphResponse:
    payload = await list_invite_graph(database)
    return InviteGraphResponse.model_validate(payload)


@router.get("/graph/personal", response_model=GraphResponse)
async def personal_graph(
    user: CurrentUser,
    database: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = settings.graph_page_limit,
    center: str | None = None,
    depth: Annotated[int, Query(ge=0, le=4)] = 1,
) -> GraphResponse:
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    uploads = await load_personal_from_uploads(
        database,
        owner_id=user.id,
        limit=_limit(limit),
        center=center,
        depth=depth,
    )
    if uploads.get("nodes") or personal is None or not personal.indexed_sha:
        return GraphResponse.model_validate(uploads)
    graph_center = center[len("personal:") :] if center and center.startswith("personal:") else center
    payload = await load_graph(
        database,
        layer=NoteLayer.PERSONAL.value,
        owner_id=user.id,
        revision=personal.indexed_sha,
        limit=_limit(limit),
        center=graph_center,
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
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not shared.indexed_sha:
        return GraphResponse(layer="overlay", index_status="empty", nodes=[], edges=[])
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    use_uploads = await _has_uploads(database, user.id)
    personal_revision = (
        None
        if use_uploads
        else (personal.indexed_sha if personal is not None else None)
    )
    seeds = await overlay_local_shared_seeds(
        database,
        owner_id=user.id,
        personal_revision=personal_revision,
        center=center,
    )
    page_limit = _limit(limit)
    payload = await load_graph(
        database,
        layer=NoteLayer.SHARED.value,
        owner_id=None,
        revision=shared.indexed_sha,
        limit=page_limit,
        center=seeds[0] if seeds else None,
        depth=depth,
        extra_centers=seeds[1:] or None,
    )
    payload["index_status"] = index_status_label(
        shared.observed_sha, shared.indexed_sha, shared.index_status
    )
    if personal is None or not personal.indexed_sha or use_uploads:
        overlay = await load_overlay_from_uploads(
            database,
            owner_id=user.id,
            shared_payload=payload,
            overlay_limit=page_limit,
        )
    else:
        overlay = await load_overlay(
            database,
            owner_id=user.id,
            personal_revision=personal.indexed_sha,
            shared_payload=payload,
            overlay_limit=page_limit,
        )
        if personal.index_status == "error" or shared.index_status == "error":
            overlay["index_status"] = "error"
    if center:
        overlay = bound_graph_payload(overlay, center, depth, page_limit)
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
    try:
        await rebuild_derived_indexes(database, actor_user_id=admin.id)
        if payload.target == "shared":
            return await shared_graph(database)
        return await personal_graph(admin, database)
    except IndexerError as exc:
        _raise(exc)
        raise
