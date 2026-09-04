import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class AdminPasswordSet(BaseModel):
    password: str = Field(min_length=12, max_length=128)


class AdminUserListResponse(BaseModel):
    users: list[UserResponse]


class AuditEventItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    actor_user_id: uuid.UUID | None
    target_user_id: uuid.UUID | None
    subject_username: str | None
    details: dict[str, Any]
    created_at: datetime


class AuditEventListResponse(BaseModel):
    events: list[AuditEventItem]
