from typing import NoReturn

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.api.dependencies import CurrentUser, DatabaseSession
from app.schemas.notes import (
    IngestReport,
    NoteDetail,
    NoteListResponse,
    TakeFromSharedRequest,
)
from app.services.github import GitHubAppClient
from app.services.ingest import (
    IngestError,
    get_personal_note,
    get_shared_note,
    import_markdown,
    list_personal_notes,
    list_shared_notes,
    take_from_shared,
)

router = APIRouter(tags=["notes"])


def _client() -> GitHubAppClient:
    return GitHubAppClient()


def _raise(error: IngestError) -> NoReturn:
    raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/shared/notes", response_model=NoteListResponse)
async def shared_notes(database: DatabaseSession) -> NoteListResponse:
    try:
        payload = await list_shared_notes(database, _client())
    except IngestError as exc:
        _raise(exc)
    return NoteListResponse.model_validate(payload)


@router.get("/shared/notes/{note_path:path}", response_model=NoteDetail)
async def shared_note(note_path: str, database: DatabaseSession) -> NoteDetail:
    try:
        payload = await get_shared_note(database, note_path, _client())
    except IngestError as exc:
        _raise(exc)
    return NoteDetail.model_validate(payload)


@router.get("/personal/notes", response_model=NoteListResponse)
async def personal_notes(
    user: CurrentUser,
    database: DatabaseSession,
) -> NoteListResponse:
    try:
        payload = await list_personal_notes(database, user, _client())
    except IngestError as exc:
        _raise(exc)
    return NoteListResponse.model_validate(payload)


@router.get("/personal/notes/{note_path:path}", response_model=NoteDetail)
async def personal_note(
    note_path: str,
    user: CurrentUser,
    database: DatabaseSession,
) -> NoteDetail:
    try:
        payload = await get_personal_note(database, user, note_path, _client())
    except IngestError as exc:
        _raise(exc)
    return NoteDetail.model_validate(payload)


@router.post("/personal/take-from-shared", response_model=IngestReport)
async def take_shared_notes(
    payload: TakeFromSharedRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> IngestReport:
    try:
        report = await take_from_shared(
            database,
            user=user,
            paths=payload.paths,
            expected_sha=payload.expected_sha,
            client=_client(),
        )
    except IngestError as exc:
        _raise(exc)
    return IngestReport.model_validate(report)


@router.post("/personal/import-md", response_model=IngestReport)
async def import_md(
    user: CurrentUser,
    database: DatabaseSession,
    file: UploadFile = File(...),
    expected_sha: str | None = Form(default=None),
) -> IngestReport:
    data = await file.read()
    try:
        report = await import_markdown(
            database,
            user=user,
            filename=file.filename or "upload.md",
            data=data,
            expected_sha=expected_sha or None,
            client=_client(),
        )
    except IngestError as exc:
        _raise(exc)
    return IngestReport.model_validate(report)
