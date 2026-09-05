import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.user import UserRole
from app.schemas.auth import UserResponse, normalize_username


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


class AdminUserCreate(BaseModel):
    username: str
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    role: UserRole = UserRole.USER
    is_active: bool = True

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("display name must not be blank")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).casefold()


class AdminUserItem(UserResponse):
    session_count: int = 0


class AdminUserListResponse(BaseModel):
    users: list[AdminUserItem]
    total: int = 0


class AuditEventItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    actor_user_id: uuid.UUID | None
    actor_username: str | None = None
    target_user_id: uuid.UUID | None
    subject_username: str | None
    details: dict[str, Any]
    created_at: datetime


class AuditEventListResponse(BaseModel):
    events: list[AuditEventItem]
    total: int = 0


class AdminMailTestRequest(BaseModel):
    to: EmailStr

    @field_validator("to")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).casefold()


class AdminMailTestResponse(BaseModel):
    sent: bool
    to: str


class AdminOperatorResponse(BaseModel):
    smtp: dict[str, object]
    health: dict[str, str]
    shared_repository: dict[str, object] | None = None
    public_base_url: str | None = None


class AdminSessionRevokeResponse(BaseModel):
    revoked: int
    user_id: uuid.UUID


AdminSection = Literal["users", "journal", "operator"]
