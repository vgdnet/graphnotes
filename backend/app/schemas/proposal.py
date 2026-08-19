from datetime import datetime

from pydantic import BaseModel, Field


class ProposalCreateRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=50)
    summary: str = Field(min_length=3, max_length=200)
    expected_sha: str | None = Field(default=None, max_length=40)


class ProposalDecisionRequest(BaseModel):
    reason: str = Field(default="", max_length=255)


class ProposalAuthor(BaseModel):
    id: str
    username: str
    display_name: str


class ProposalFileDiff(BaseModel):
    path: str
    diff: str


class ProposalResponse(BaseModel):
    id: str
    status: str
    summary: str
    paths: list[str]
    added: list[str] = []
    changed: list[str] = []
    author: ProposalAuthor
    reason: str | None = None
    created_at: datetime
    updated_at: datetime
    diff: list[ProposalFileDiff] = []


class ProposalListResponse(BaseModel):
    proposals: list[ProposalResponse]
