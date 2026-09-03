import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DatabaseSession, OptionalUser
from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.contributions import UserCardResponse
from app.services.contributions import get_user_card
from app.services.github import GitHubAppClient

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def current_user(user: CurrentUser) -> User:
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
