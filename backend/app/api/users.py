import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentUser, DatabaseSession, OptionalUser
from app.models.user import User
from app.schemas.auth import (
    AuthorAcceptRequest,
    AuthorContractResponse,
    ProfileUpdateRequest,
    UserResponse,
)
from app.schemas.contributions import UserCardResponse
from app.services.audit import record_audit_event
from app.services.author_contract import (
    AUTHOR_CONTRACT,
    apply_accept,
    apply_withdraw,
)
from app.services.contributions import get_user_card
from app.services.github import GitHubAppClient
from app.services.mail import smtp_configured

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def current_user(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    payload: ProfileUpdateRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> User:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no profile fields to update")
    if "email" in data and data["email"] != user.email:
        taken = await database.scalar(
            select(User.id).where(User.email == data["email"], User.id != user.id)
        )
        if taken is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="email is already registered",
            )
        if smtp_configured():
            user.email_verified_at = None
    for field, value in data.items():
        setattr(user, field, value)
    record_audit_event(
        database,
        action="users.profile_updated",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"fields": sorted(data)},
    )
    try:
        await database.commit()
    except IntegrityError:
        await database.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email is already registered",
        ) from None
    await database.refresh(user)
    return user


@router.get("/me/author-contract", response_model=AuthorContractResponse)
async def author_contract_text() -> AuthorContractResponse:
    return AuthorContractResponse.model_validate(AUTHOR_CONTRACT)


@router.post("/me/author-contract", response_model=UserResponse)
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


@router.post("/me/author-contract/withdraw", response_model=UserResponse)
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


@router.get("/{user_id}/card", response_model=UserCardResponse)
async def user_card(
    user_id: uuid.UUID,
    database: DatabaseSession,
    viewer: OptionalUser,
) -> UserCardResponse:
    target = await database.scalar(select(User).where(User.id == user_id))
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    body = await get_user_card(
        database,
        target=target,
        viewer=viewer,
        client=GitHubAppClient(),
    )
    return UserCardResponse.model_validate(body)
