from typing import NoReturn
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.api.dependencies import (
    CurrentAuthor,
    CurrentEditor,
    CurrentUser,
    DatabaseSession,
    OptionalUser,
)
from app.schemas.notes import (
    ClosePathRequest,
    ClosedPathListResponse,
    IngestReport,
    NoteDetail,
    NoteListResponse,
    UploadHistoryResponse,
)
from app.schemas.comments import (
    CommentCreateRequest,
    CommentItem,
    CommentListResponse,
    CommentModerateRequest,
)
from app.schemas.provenance import NoteFeedResponse
from app.services.comments import CommentError, create_comment, list_comments, moderate_comment
from app.services.provenance import list_note_feed
from app.services.github import GitHubAppClient
from app.services.closed_corpus import (
    ClosedCorpusError,
    close_path,
    list_closed_paths,
    unclose_path,
)
from app.services.ingest import (
    IngestError,
    get_personal_note,
    get_shared_note,
    import_markdown,
    list_personal_notes,
    list_shared_notes,
    list_upload_events,
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


@router.get("/shared/notes/{note_path:path}/feed", response_model=NoteFeedResponse)
async def shared_note_feed(note_path: str, database: DatabaseSession) -> NoteFeedResponse:
    payload = await list_note_feed(database, note_path)
    return NoteFeedResponse.model_validate(payload)


@router.get("/shared/notes/{note_path:path}/comments", response_model=CommentListResponse)
async def shared_note_comments(
    note_path: str,
    database: DatabaseSession,
    viewer: OptionalUser,
) -> CommentListResponse:
    try:
        payload = await list_comments(database, note_path, viewer)
    except CommentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return CommentListResponse.model_validate(payload)


@router.post("/shared/notes/{note_path:path}/comments", response_model=CommentItem)
async def add_shared_note_comment(
    note_path: str,
    payload: CommentCreateRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> CommentItem:
    try:
        body = await create_comment(
            database,
            user=user,
            path=note_path,
            body=payload.body,
            client=_client(),
        )
    except CommentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return CommentItem.model_validate(body)


@router.post("/comments/{comment_id}/moderate", response_model=CommentItem)
async def moderate_shared_comment(
    comment_id: UUID,
    payload: CommentModerateRequest,
    editor: CurrentEditor,
    database: DatabaseSession,
) -> CommentItem:
    try:
        body = await moderate_comment(
            database,
            editor=editor,
            comment_id=comment_id,
            status=payload.status,
        )
    except CommentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return CommentItem.model_validate(body)


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


@router.post("/personal/take-from-shared", response_model=None)
async def take_shared_notes(_user: CurrentUser) -> None:
    raise HTTPException(
        status_code=410,
        detail="published shared is read in the app; GraphNotes does not write it into the personal layer",
    )


@router.get("/personal/uploads", response_model=UploadHistoryResponse)
async def personal_uploads(
    user: CurrentUser,
    database: DatabaseSession,
) -> UploadHistoryResponse:
    payload = await list_upload_events(database, user)
    return UploadHistoryResponse.model_validate(payload)


@router.get("/personal/closed-paths", response_model=ClosedPathListResponse)
async def personal_closed_paths(
    user: CurrentUser,
    database: DatabaseSession,
) -> ClosedPathListResponse:
    paths = await list_closed_paths(database, user)
    return ClosedPathListResponse.model_validate({"paths": paths})


@router.put("/personal/closed-paths", response_model=ClosedPathListResponse)
async def close_personal_path(
    payload: ClosePathRequest,
    user: CurrentAuthor,
    database: DatabaseSession,
) -> ClosedPathListResponse:
    try:
        await close_path(database, user, payload.path)
    except ClosedCorpusError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    paths = await list_closed_paths(database, user)
    return ClosedPathListResponse.model_validate({"paths": paths})


@router.delete("/personal/closed-paths/{note_path:path}", status_code=204)
async def unclose_personal_path(
    note_path: str,
    user: CurrentAuthor,
    database: DatabaseSession,
) -> None:
    try:
        await unclose_path(database, user, note_path)
    except ClosedCorpusError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/personal/import-md", response_model=IngestReport)
async def import_md(
    user: CurrentAuthor,
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
