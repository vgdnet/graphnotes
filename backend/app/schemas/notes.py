from datetime import datetime

from pydantic import BaseModel, Field


class TakeFromSharedRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=50)
    expected_sha: str | None = Field(default=None, max_length=40)


class NoteProjection(BaseModel):
    path: str
    title: str
    tags: list[str]
    aliases: list[str]
    links: list[str]
    unresolved_links: list[str]
    warnings: list[str]


class NoteDetail(NoteProjection):
    body: str
    content_hash: str


class NoteListResponse(BaseModel):
    notes: list[NoteProjection]
    revision: str | None = None
    updated_at: datetime | None = None


class IngestReport(BaseModel):
    accepted: list[str]
    rejected: list[dict[str, str]]
    skipped: list[str]
    conflicted: list[str]
    warnings: list[str]
    revision: str | None = None
