from typing import NoReturn
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.api.dependencies import (
    CurrentAuthor,
    CurrentAuthorReader,
    CurrentEditorReader,
    CurrentRequestUser,
    CurrentUser,
    DatabaseSession,
)
from app.schemas.differ import DifferFileResponse, DifferResponse
from app.schemas.proposal import (
    ProposalCreateRequest,
    ProposalDecisionRequest,
    ProposalListResponse,
    ProposalResolveRequest,
    ProposalResponse,
    ProposalWorkFileResponse,
)
from app.services.differ import accept_inbound_file, get_difference_file, list_differences
from app.services.proposal import (
    ProposalError,
    create_proposal,
    decide,
    get_proposal,
    get_proposal_work_file,
    list_proposals,
    resolve_proposal,
)

router = APIRouter(tags=["proposals"])


def _raise(error: ProposalError) -> NoReturn:
    raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/differ", response_model=DifferResponse)
async def differ_endpoint(
    user: CurrentAuthorReader,
    database: DatabaseSession,
    include_inbound: bool = Query(True),
) -> DifferResponse:
    try:
        body = await list_differences(database, user, include_inbound=include_inbound)
    except ProposalError as exc:
        _raise(exc)
    return DifferResponse.model_validate(body)


@router.get("/differ/files/{note_path:path}", response_model=DifferFileResponse)
async def differ_file_endpoint(
    note_path: str,
    user: CurrentAuthorReader,
    database: DatabaseSession,
) -> DifferFileResponse:
    try:
        body = await get_difference_file(database, user, note_path)
    except ProposalError as exc:
        _raise(exc)
    return DifferFileResponse.model_validate(body)


@router.post("/differ/inbound/{note_path:path}/accept", response_model=DifferResponse)
async def accept_inbound_endpoint(
    note_path: str,
    user: CurrentAuthor,
    database: DatabaseSession,
) -> DifferResponse:
    try:
        body = await accept_inbound_file(database, user, note_path)
    except ProposalError as exc:
        _raise(exc)
    return DifferResponse.model_validate(body)


@router.get("/shared/archive", response_model=None)
async def shared_archive_endpoint() -> None:
    raise HTTPException(
        status_code=410,
        detail="published shared is read in the app; ZIP download is not offered",
    )


@router.post("/proposals", response_model=ProposalResponse)
async def create_proposal_endpoint(
    payload: ProposalCreateRequest,
    user: CurrentAuthorReader,
    database: DatabaseSession,
) -> ProposalResponse:
    try:
        body = await create_proposal(
            database,
            user=user,
            paths=payload.paths,
            summary=payload.summary,
            expected_sha=payload.expected_sha,
            client=None,
        )
    except ProposalError as exc:
        _raise(exc)
    return ProposalResponse.model_validate(body)


@router.get("/proposals", response_model=ProposalListResponse)
async def list_proposals_endpoint(
    user: CurrentRequestUser,
    database: DatabaseSession,
) -> ProposalListResponse:
    try:
        body = await list_proposals(database, user)
    except ProposalError as exc:
        _raise(exc)
    return ProposalListResponse.model_validate(body)


@router.get("/proposals/{proposal_id}", response_model=ProposalResponse)
async def get_proposal_endpoint(
    proposal_id: UUID,
    user: CurrentRequestUser,
    database: DatabaseSession,
) -> ProposalResponse:
    try:
        body = await get_proposal(database, user, proposal_id, None)
    except ProposalError as exc:
        _raise(exc)
    return ProposalResponse.model_validate(body)


@router.get("/proposals/{proposal_id}/files/{note_path:path}", response_model=ProposalWorkFileResponse)
async def get_proposal_work_file_endpoint(
    proposal_id: UUID,
    note_path: str,
    user: CurrentRequestUser,
    database: DatabaseSession,
) -> ProposalWorkFileResponse:
    try:
        body = await get_proposal_work_file(database, user, proposal_id, note_path, None)
    except ProposalError as exc:
        _raise(exc)
    return ProposalWorkFileResponse.model_validate(body)


@router.post("/proposals/{proposal_id}/resolve", response_model=ProposalResponse)
async def resolve_proposal_endpoint(
    proposal_id: UUID,
    payload: ProposalResolveRequest,
    user: CurrentEditorReader,
    database: DatabaseSession,
) -> ProposalResponse:
    try:
        body = await resolve_proposal(
            database,
            user=user,
            proposal_id=proposal_id,
            files=[(item.path, item.source) for item in payload.files],
            reason=payload.reason,
            client=None,
        )
    except ProposalError as exc:
        _raise(exc)
    return ProposalResponse.model_validate(body)


@router.post("/proposals/{proposal_id}/approve", response_model=ProposalResponse)
async def approve_proposal(
    proposal_id: UUID,
    payload: ProposalDecisionRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> ProposalResponse:
    return await _decide(database, user, proposal_id, "approve", payload.reason)


@router.post("/proposals/{proposal_id}/reject", response_model=ProposalResponse)
async def reject_proposal(
    proposal_id: UUID,
    payload: ProposalDecisionRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> ProposalResponse:
    return await _decide(database, user, proposal_id, "reject", payload.reason)


@router.post("/proposals/{proposal_id}/request-changes", response_model=ProposalResponse)
async def request_proposal_changes(
    proposal_id: UUID,
    payload: ProposalDecisionRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> ProposalResponse:
    return await _decide(database, user, proposal_id, "request_changes", payload.reason)


@router.post("/proposals/{proposal_id}/rollback", response_model=ProposalResponse)
async def rollback_proposal(
    proposal_id: UUID,
    payload: ProposalDecisionRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> ProposalResponse:
    return await _decide(database, user, proposal_id, "rollback", payload.reason)


async def _decide(
    database: DatabaseSession,
    user: CurrentUser,
    proposal_id: UUID,
    action: str,
    reason: str,
) -> ProposalResponse:
    try:
        body = await decide(
            database,
            user=user,
            proposal_id=proposal_id,
            action=action,
            reason=reason,
            client=None,
        )
    except ProposalError as exc:
        _raise(exc)
    return ProposalResponse.model_validate(body)
