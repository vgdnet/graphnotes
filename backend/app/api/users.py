from fastapi import APIRouter

from app.api.dependencies import CurrentUser
from app.models.user import User
from app.schemas.auth import UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def current_user(user: CurrentUser) -> User:
    return user
