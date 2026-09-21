import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.user import UserRole
from app.schemas.auth import UserResponse, normalize_username
from app.services.grants import normalize_tag_list


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None
    notify_queue_email: bool | None = None
    notify_queue_telegram: bool | None = None
    notify_card_changes: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> "AdminUserUpdate":
        if (
            self.role is None
            and self.is_active is None
            and self.notify_queue_email is None
            and self.notify_queue_telegram is None
            and self.notify_card_changes is None
        ):
            raise ValueError("a user field to update must be provided")
        return self


class AdminEditorTagsUpdate(BaseModel):
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        return normalize_tag_list(value)


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


class AdminUserGrantItem(BaseModel):
    id: uuid.UUID
    kind: str
    value: str


class AdminUserItem(UserResponse):
    session_count: int = 0
    invited_at: datetime | None = None
    inviter_username: str | None = None
    grants: list[AdminUserGrantItem] = Field(default_factory=list)


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
    telegram: dict[str, object] = {"configured": False}
    health: dict[str, str]
    shared_repository: dict[str, object] | None = None
    public_base_url: str | None = None
    start_card_path: str | None = None
    mail_code_ttl_minutes: int = 30


class AdminOperatorUpdate(BaseModel):
    public_base_url: str = Field(min_length=8, max_length=300)
    start_card_path: str | None = Field(default=None, max_length=300)

    @field_validator("public_base_url")
    @classmethod
    def validate_public_base_url(cls, value: str) -> str:
        from app.services.installation import normalize_public_base_url

        return normalize_public_base_url(value)


class AdminSessionRevokeResponse(BaseModel):
    revoked: int
    user_id: uuid.UUID


AdminSection = Literal["users", "journal", "operator", "grants"]


class AdminGrantCreate(BaseModel):
    user_id: uuid.UUID
    kind: Literal["path", "tag", "prefix"]
    value: str = Field(min_length=1, max_length=180)


class AdminGrantItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str | None = None
    kind: str
    value: str
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None


class AdminGrantListResponse(BaseModel):
    grants: list[AdminGrantItem]
    total: int = 0


class AdminCatalogCard(BaseModel):
    path: str
    title: str


class AdminGrantCatalogResponse(BaseModel):
    paths: list[str]
    tags: list[str]
    prefixes: list[str]
    cards: list[AdminCatalogCard] = Field(default_factory=list)

