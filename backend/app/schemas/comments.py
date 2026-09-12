from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CommentAuthor(BaseModel):
    id: UUID
    username: str
    display_name: str


class CommentItem(BaseModel):
    id: UUID
    path: str
    body: str
    status: str
    created_at: datetime
    author: CommentAuthor


class CommentListResponse(BaseModel):
    comments: list[CommentItem]


class CommentCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentModerateRequest(BaseModel):
    status: Literal["approved", "rejected"]
