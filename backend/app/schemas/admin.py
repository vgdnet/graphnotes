from pydantic import BaseModel, model_validator

from app.models.user import UserRole
from app.schemas.auth import UserResponse


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> "AdminUserUpdate":
        if self.role is None and self.is_active is None:
            raise ValueError("role or is_active must be provided")
        return self


class AdminUserListResponse(BaseModel):
    users: list[UserResponse]
