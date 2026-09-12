import re
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
    normalize_username,
)
from app.schemas.contributions import UserCardResponse
from app.schemas.integration import IntegrationTokenCreateRequest
from app.services.audit import record_audit_event
from app.services.author_contract import (
    AUTHOR_CONTRACT,
    apply_accept,
    apply_withdraw,
)
from app.services.contributions import get_user_card
from app.services.github import GitHubAppClient
from app.services.integration_errors import IntegrationError
from app.services.integration_tokens import (
    access_retention_days,
    access_view,
    create_integration_token,
    list_integration_tokens,
    list_token_access,
    revoke_integration_token,
)
from app.services.mail import smtp_configured
from app.services.obsidian_transfers import iso

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


def _http_from_integration(exc: IntegrationError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _token_view(row, *, token: str | None = None) -> dict[str, object]:
    return {
        "id": str(row.id),
        "name": row.name,
        "token": token if token is not None else row.token,
        "token_prefix": row.token_prefix,
        "scopes": list(row.scopes or []),
        "expires_at": iso(row.expires_at),
        "last_used_at": iso(row.last_used_at),
        "created_at": iso(row.created_at),
        "revoked_at": iso(row.revoked_at),
    }


@router.post("/me/integration-tokens", status_code=status.HTTP_201_CREATED)
async def create_my_integration_token(
    payload: IntegrationTokenCreateRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> dict[str, object]:
    try:
        row, secret = await create_integration_token(
            database,
            user=user,
            name=payload.name,
            scopes=payload.scopes,
            expires_at=payload.expires_at,
        )
    except IntegrationError as exc:
        raise _http_from_integration(exc) from exc
    return _token_view(row, token=secret)


@router.get("/me/integration-tokens")
async def list_my_integration_tokens(
    user: CurrentUser,
    database: DatabaseSession,
) -> dict[str, object]:
    rows = await list_integration_tokens(database, user=user)
    return {"tokens": [_token_view(row) for row in rows]}


@router.get("/me/integration-tokens/access")
async def list_my_integration_token_access(
    user: CurrentUser,
    database: DatabaseSession,
) -> dict[str, object]:
    rows = await list_token_access(database, user_id=user.id)
    return {
        "access": [access_view(row) for row in rows],
        "retention_days": access_retention_days(),
    }


@router.delete(
    "/me/integration-tokens/{token_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_my_integration_token(
    token_id: uuid.UUID,
    user: CurrentUser,
    database: DatabaseSession,
) -> None:
    try:
        await revoke_integration_token(database, user=user, token_id=token_id)
    except IntegrationError as exc:
        raise _http_from_integration(exc) from exc


_PUBLIC_UUID_KEY = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


async def _public_card_user(database: DatabaseSession, user_key: str) -> User:
    key = user_key.strip()
    if _PUBLIC_UUID_KEY.fullmatch(key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    try:
        login = normalize_username(key)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found") from None
    target = await database.scalar(select(User).where(User.username == login))
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    return target


@router.get("/{user_key}/card", response_model=UserCardResponse)
async def user_card(
    user_key: str,
    database: DatabaseSession,
    viewer: OptionalUser,
) -> UserCardResponse:
    target = await _public_card_user(database, user_key)
    body = await get_user_card(
        database,
        target=target,
        viewer=viewer,
        client=GitHubAppClient(),
    )
    return UserCardResponse.model_validate(body)
