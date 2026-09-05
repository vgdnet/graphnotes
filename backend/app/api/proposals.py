from typing import NoReturn
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.dependencies import CurrentAuthor, CurrentUser, DatabaseSession
from app.schemas.differ import DifferResponse
from app.schemas.proposal import (
    ProposalCreateRequest,
    ProposalDecisionRequest,
    ProposalListResponse,
    ProposalResponse,
)
from app.services.differ import list_differences
from app.services.github import GitHubAppClient
from app.services.proposal import ProposalError, create_proposal, decide, get_proposal, list_proposals

router = APIRouter(tags=["proposals"])


def _client() -> GitHubAppClient:
    return GitHubAppClient()


def _raise(error: ProposalError) -> NoReturn:
    raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/differ", response_model=DifferResponse)
async def differ_endpoint(
    user: CurrentAuthor,
    database: DatabaseSession,
) -> DifferResponse:
    try:
        body = await list_differences(database, user, _client())
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
    user: CurrentAuthor,
    database: DatabaseSession,
) -> ProposalResponse:
    try:
        body = await create_proposal(
            database,
            user=user,
            paths=payload.paths,
            summary=payload.summary,
            expected_sha=payload.expected_sha,
            client=_client(),
        )
    except ProposalError as exc:
        _raise(exc)
    return ProposalResponse.model_validate(body)


@router.get("/proposals", response_model=ProposalListResponse)
async def list_proposals_endpoint(
    user: CurrentUser,
    database: DatabaseSession,
) -> ProposalListResponse:
    try:
        body = await list_proposals(database, user, _client())
    except ProposalError as exc:
        _raise(exc)
    return ProposalListResponse.model_validate(body)


@router.get("/proposals/{proposal_id}", response_model=ProposalResponse)
async def get_proposal_endpoint(
    proposal_id: UUID,
    user: CurrentUser,
    database: DatabaseSession,
) -> ProposalResponse:
    try:
        body = await get_proposal(database, user, proposal_id, _client())
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
            client=_client(),
        )
    except ProposalError as exc:
        _raise(exc)
    return ProposalResponse.model_validate(body)
