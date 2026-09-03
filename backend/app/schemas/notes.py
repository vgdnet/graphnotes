from datetime import datetime

from pydantic import BaseModel


class NoteProjection(BaseModel):
    path: str
    title: str
    tags: list[str]
    aliases: list[str]
    links: list[str]
    unresolved_links: list[str]
    locked_links: list[str] = []
    warnings: list[str]
    locked: bool = False
    closed: bool = False


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


class UploadEventItem(BaseModel):
    path: str
    content_hash: str
    created_at: datetime


class UploadHistoryResponse(BaseModel):
    events: list[UploadEventItem]


class ClosedPathItem(BaseModel):
    path: str
    created_at: datetime | None = None
    closed: bool = True


class ClosedPathListResponse(BaseModel):
    paths: list[ClosedPathItem]


class ClosePathRequest(BaseModel):
    path: str
