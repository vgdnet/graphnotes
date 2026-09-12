from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.auth import normalize_username


class InviteCreateRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).casefold()


class InvitePreviewResponse(BaseModel):
    email: str
    expires_at: datetime
    inviter_username: str


class InviteAcceptRequest(BaseModel):
    token: str = Field(min_length=8, max_length=128)
    username: str
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)
    accept_author_contract: bool = False

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


class InviteItem(BaseModel):
    id: UUID
    email: str
    expires_at: datetime
    created_at: datetime


class InviteListResponse(BaseModel):
    invites: list[InviteItem]


class InviteCreateResponse(BaseModel):
    id: UUID
    email: str
    expires_at: datetime


class InviteGraphNode(BaseModel):
    id: UUID
    username: str
    display_name: str
    role: str
    is_active: bool
    invited_by_id: UUID | None = None
    invited_at: datetime | None = None
    invited_count: int = 0


class InviteGraphEdge(BaseModel):
    source: UUID
    target: UUID


class InviteGraphResponse(BaseModel):
    nodes: list[InviteGraphNode]
    edges: list[InviteGraphEdge]
