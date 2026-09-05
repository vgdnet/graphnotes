from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DatabaseSession
from app.models.user import User
from app.schemas.auth import AuthorAcceptRequest, AuthorContractResponse, UserResponse
from app.services.audit import record_audit_event
from app.services.author_contract import (
    AUTHOR_CONTRACT,
    apply_accept,
    apply_withdraw,
)

router = APIRouter(prefix="/author", tags=["author"])


@router.get("/contract", response_model=AuthorContractResponse)
async def author_contract() -> AuthorContractResponse:
    return AuthorContractResponse.model_validate(AUTHOR_CONTRACT)


@router.post("/accept", response_model=UserResponse)
async def accept_author_contract(
    payload: AuthorAcceptRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> User:
    if not payload.accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="the author contract checkbox must be accepted",
        )
    apply_accept(user)
    record_audit_event(
        database,
        action="author.contract_accepted",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"version": user.author_contract_version},
    )
    await database.commit()
    await database.refresh(user)
    return user


@router.post("/withdraw", response_model=UserResponse)
async def withdraw_author_contract(
    user: CurrentUser,
    database: DatabaseSession,
) -> User:
    if not user.is_author:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="author status is not active",
        )
    apply_withdraw(user)
    record_audit_event(
        database,
        action="author.contract_withdrawn",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"version": user.author_contract_version},
    )
    await database.commit()
    await database.refresh(user)
    return user
