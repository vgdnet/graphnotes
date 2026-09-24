from __future__ import annotations

import uuid
from time import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import JSONResponse, Response as FastAPIResponse

from app.api.dependencies import DatabaseSession
from app.core.config import settings
from app.models.integration import IntegrationToken
from app.models.user import User
from app.schemas.integration import TransferPlanRequest
from app.services.installation import resolve_public_base_url
from app.services.integration_errors import IntegrationError
from app.services.integration_tokens import (
    authenticate_integration_token,
    record_token_access,
    require_scopes,
)
from app.services.obsidian_transfers import (
    cancel_transfer,
    capabilities_payload,
    commit_transfer,
    create_transfer,
    file_content,
    get_owned_transfer,
    put_blob,
    read_manifest_page,
    remaining_blobs,
    transfer_public,
)
from app.services.git_paths import PathError, normalize_git_path
from app.services.grants import (
    GrantError,
    file_headers,
    granted_shared_notes,
    require_write_grant,
    write_shared_body,
)
from app.services.integration_paths import IntegrationPathError, normalize_integration_path
import hashlib
from urllib.parse import quote

router = APIRouter(
    prefix="/integrations/obsidian/v1",
    tags=["obsidian-integration"],
)

_RATE: dict[tuple[str, int], int] = {}


def reset_rate_limiter() -> None:
    _RATE.clear()


async def current_integration(
    database: DatabaseSession,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> tuple[User, IntegrationToken]:
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    user, token = await authenticate_integration_token(database, authorization)
    await record_token_access(database, user=user, token=token, request=request)
    _check_rate(user)
    return user, token


IntegrationAuth = Annotated[tuple[User, IntegrationToken], Depends(current_integration)]


def _check_rate(user: User) -> None:
    minute = int(time() // 60)
    key = (str(user.id), minute)
    _RATE[key] = _RATE.get(key, 0) + 1
    stale = [item for item in _RATE if item[1] < minute - 2]
    for item in stale:
        _RATE.pop(item, None)
    if _RATE[key] > settings.integration_rate_limit_per_minute:
        raise IntegrationError(
            429,
            "rate_limited",
            "слишком много запросов, повторите позже",
            retryable=True,
            retry_after=60,
        )


def _json(payload: dict[str, Any], *, status_code: int = 200, request: Request) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "") or ""
    return JSONResponse(
        status_code=status_code,
        content=payload,
        headers={"Cache-Control": "no-store", "X-Request-ID": request_id},
    )


@router.get("/capabilities")
async def capabilities(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
) -> JSONResponse:
    user, token = auth
    require_scopes(token, "personal:read")
    base = await resolve_public_base_url(database)
    payload = await capabilities_payload(
        database, user=user, token=token, public_base_url=base
    )
    return _json(payload, request=request)


@router.get("/manifest")
async def manifest(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    cursor: str | None = None,
    limit: Annotated[int | None, Query(ge=1)] = None,
) -> JSONResponse:
    user, token = auth
    require_scopes(token, "personal:read")
    payload = await read_manifest_page(
        database, user=user, cursor=cursor, limit=limit
    )
    return _json(payload, request=request)


@router.get("/files/content")
async def files_content(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    path: str = Query(..., min_length=1),
) -> FastAPIResponse:
    user, token = auth
    require_scopes(token, "personal:read")
    body, headers = await file_content(database, user=user, path=path)
    request_id = getattr(request.state, "request_id", "") or ""
    headers["X-Request-ID"] = request_id
    return FastAPIResponse(content=body, headers=headers)


def _grant_error(exc: GrantError) -> IntegrationError:
    code = "forbidden" if exc.status == 403 else "not_found" if exc.status == 404 else "invalid_request"
    return IntegrationError(exc.status, code, exc.detail)


@router.get("/granted")
async def granted_manifest(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
) -> JSONResponse:
    user, token = auth
    require_scopes(token, "personal:read")
    notes = await granted_shared_notes(database, user)
    items = []
    for note in notes:
        payload = note.body.encode("utf-8")
        digest = note.content_hash or hashlib.sha256(payload).hexdigest()
        items.append(
            {
                "path": note.path,
                "kind": "markdown",
                "sha256": digest,
                "version": digest,
                "size": len(payload),
            }
        )
    return _json({"items": items}, request=request)


@router.get("/granted/files/content")
async def granted_file_content(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    path: str = Query(..., min_length=1),
) -> FastAPIResponse:
    user, token = auth
    require_scopes(token, "personal:read")
    try:
        normalized = normalize_git_path(path)
        note = await require_write_grant(database, user, normalized)
    except PathError as exc:
        raise IntegrationError(400, "invalid_path", "путь недопустим") from exc
    except GrantError as exc:
        raise _grant_error(exc) from exc
    if note is None:
        raise IntegrationError(404, "not_found", "файл не найден")
    body, headers = file_headers(note)
    request_id = getattr(request.state, "request_id", "") or ""
    headers["X-Request-ID"] = request_id
    headers["X-GraphNotes-Path"] = quote(note.path, safe="/")
    return FastAPIResponse(content=body, headers=headers)


@router.put("/granted/files")
async def put_granted_file(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    path: str = Query(..., min_length=1),
) -> JSONResponse:
    user, token = auth
    require_scopes(token, "personal:read", "personal:write")
    payload = await request.body()
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise IntegrationError(422, "invalid_utf8", "Markdown должен быть UTF-8") from exc
    try:
        note = await write_shared_body(database, user=user, path=path, body=text)
    except PathError as exc:
        raise IntegrationError(400, "invalid_path", "путь недопустим") from exc
    except GrantError as exc:
        raise _grant_error(exc) from exc
    await database.commit()
    body, _headers = file_headers(note)
    digest = note.content_hash
    return _json(
        {
            "path": note.path,
            "kind": "markdown",
            "sha256": digest,
            "version": digest,
            "size": len(body),
        },
        request=request,
    )


@router.post("/transfers")
async def post_transfers(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    payload: TransferPlanRequest,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JSONResponse:
    user, token = auth
    row = await create_transfer(
        database,
        user=user,
        token=token,
        payload=payload.model_dump(),
        idempotency_key=idempotency_key,
    )
    leftover = await remaining_blobs(database, row)
    return _json(transfer_public(row, leftover), status_code=201, request=request)


@router.put("/transfers/{transfer_id}/blobs/{sha256}")
async def put_transfer_blob(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    transfer_id: uuid.UUID,
    sha256: str,
) -> Response:
    user, token = auth
    require_scopes(token, "personal:read", "personal:write")
    transfer = await get_owned_transfer(database, user=user, transfer_id=transfer_id)
    payload = await request.body()
    limit = settings.integration_attachment_max_bytes
    if len(payload) > limit:
        raise IntegrationError(413, "file_too_large", "файл слишком большой")
    await put_blob(
        database, user=user, transfer=transfer, sha256=sha256, payload=payload
    )
    request_id = getattr(request.state, "request_id", "") or ""
    return Response(
        status_code=204,
        headers={"Cache-Control": "no-store", "X-Request-ID": request_id},
    )


@router.post("/transfers/{transfer_id}/commit")
async def post_commit(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    transfer_id: uuid.UUID,
) -> JSONResponse:
    user, token = auth
    transfer = await get_owned_transfer(database, user=user, transfer_id=transfer_id)
    row = await commit_transfer(database, user=user, token=token, transfer=transfer)
    leftover = await remaining_blobs(database, row)
    return _json(transfer_public(row, leftover), status_code=202, request=request)


@router.get("/transfers/{transfer_id}")
async def get_transfer(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    transfer_id: uuid.UUID,
) -> JSONResponse:
    user, token = auth
    require_scopes(token, "personal:read")
    row = await get_owned_transfer(database, user=user, transfer_id=transfer_id)
    leftover = await remaining_blobs(database, row)
    return _json(transfer_public(row, leftover), request=request)


@router.delete("/transfers/{transfer_id}")
async def delete_transfer(
    request: Request,
    database: DatabaseSession,
    auth: IntegrationAuth,
    transfer_id: uuid.UUID,
) -> Response:
    user, token = auth
    require_scopes(token, "personal:read", "personal:write")
    row = await get_owned_transfer(database, user=user, transfer_id=transfer_id)
    await cancel_transfer(database, user=user, transfer=row)
    request_id = getattr(request.state, "request_id", "") or ""
    return Response(
        status_code=204,
        headers={"Cache-Control": "no-store", "X-Request-ID": request_id},
    )
