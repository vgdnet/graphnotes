from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.integration import (
    IntegrationBlob,
    IntegrationIdempotency,
    IntegrationSnapshot,
    IntegrationToken,
    IntegrationTransfer,
    PersonalAsset,
)
from app.models.personal_upload import PersonalUpload, UploadEvent
from app.models.proposal import Proposal, ProposalStatus
from app.models.user import User, can_propose_to_rhizome, can_see_queue
from app.services.grants import queue_scope
from app.services.audit import record_audit_event
from app.services.index import IndexerError, reindex_personal_uploads
from app.services.integration_errors import IntegrationError
from app.services.integration_paths import (
    IntegrationPathError,
    kind_for_path,
    normalize_integration_path,
)
from app.services.markdown import notes_lookup_map, parse_markdown, resolve_link_target
from app.services.noise import inspect_markdown_bytes
from app.services.provenance import record_personal_edit_events

PROTOCOL_VERSION = "1.0"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
IDEMPOTENCY_ROUTE = "POST /transfers"
ACTIVE_PROPOSALS = {
    ProposalStatus.OPEN.value,
    ProposalStatus.CHANGES_REQUESTED.value,
    ProposalStatus.CONFLICTED.value,
    ProposalStatus.FAILED.value,
    ProposalStatus.ACCEPTED_PENDING_MERGE.value,
    ProposalStatus.MERGED_INDEXING.value,
}
BUSY_STATES = {"applying", "indexing"}
TERMINAL_UNAPPLIED = {"conflict", "failed", "cancelled", "expired"}
MAGIC = {
    "png": b"\x89PNG\r\n\x1a\n",
    "jpeg": b"\xff\xd8\xff",
    "gif87": b"GIF87a",
    "gif89": b"GIF89a",
    "pdf": b"%PDF",
}


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    stamp = value if value.tzinfo else value.replace(tzinfo=UTC)
    return stamp.astimezone(UTC).isoformat().replace("+00:00", "Z")


def write_block_reason(user: User) -> str | None:
    if not user.is_active:
        return "account_inactive"
    if not user.is_author:
        return "author_contract_required"
    return None


def assert_write_allowed(user: User) -> None:
    reason = write_block_reason(user)
    if reason == "author_contract_required":
        raise IntegrationError(
            403,
            "author_contract_required",
            "нужно принять договор автора",
        )
    if reason == "account_inactive":
        raise IntegrationError(403, "write_disabled", "учётка заблокирована")


def canonical_body_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sniff_kind(payload: bytes, declared: str) -> str:
    if declared == "markdown":
        if b"\x00" in payload:
            raise IntegrationError(422, "invalid_utf8", "Markdown не должен содержать NUL")
        try:
            payload.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise IntegrationError(422, "invalid_utf8", "Markdown должен быть UTF-8") from exc
        return "markdown"
    if declared == "png" and payload.startswith(MAGIC["png"]):
        return "png"
    if declared == "jpeg" and payload.startswith(MAGIC["jpeg"]):
        return "jpeg"
    if declared == "gif" and (
        payload.startswith(MAGIC["gif87"]) or payload.startswith(MAGIC["gif89"])
    ):
        return "gif"
    if declared == "webp" and len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return "webp"
    if declared == "pdf" and payload.startswith(MAGIC["pdf"]):
        return "pdf"
    raise IntegrationError(415, "unsupported_type", "содержимое не совпадает с заявленным типом")


async def personal_used_bytes(database: AsyncSession, user_id: uuid.UUID) -> int:
    items = await list_manifest_items(database, user_id)
    return sum(int(item["size"]) for item in items)


async def list_manifest_items(
    database: AsyncSession, user_id: uuid.UUID
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    notes = (
        await database.scalars(
            select(PersonalUpload)
            .where(PersonalUpload.user_id == user_id)
            .order_by(PersonalUpload.path)
        )
    ).all()
    for row in notes:
        payload = row.body.encode("utf-8")
        items.append(
            {
                "path": row.path,
                "kind": "markdown",
                "sha256": row.content_hash,
                "version": row.object_version,
                "size": len(payload),
            }
        )
    assets = (
        await database.scalars(
            select(PersonalAsset)
            .where(PersonalAsset.user_id == user_id)
            .order_by(PersonalAsset.path)
        )
    ).all()
    for row in assets:
        items.append(
            {
                "path": row.path,
                "kind": row.kind,
                "sha256": row.sha256,
                "version": row.object_version,
                "size": row.size,
            }
        )
    items.sort(key=lambda item: str(item["path"]).casefold())
    return items


async def capabilities_payload(
    database: AsyncSession,
    *,
    user: User,
    token: IntegrationToken,
    public_base_url: str,
) -> dict[str, Any]:
    used = await personal_used_bytes(database, user.id)
    quota = settings.integration_personal_quota_bytes
    reason = write_block_reason(user)
    base = public_base_url.rstrip("/")
    queue_mode, has_grants = await queue_scope(database, user)
    return {
        "protocol_version": PROTOCOL_VERSION,
        "api_prefix": "/api/integrations/obsidian/v1",
        "user": {
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
        },
        "write_allowed": reason is None,
        "write_block_reason": reason,
        "can_see_queue": can_see_queue(user),
        "can_propose_to_rhizome": can_propose_to_rhizome(user),
        "editorial_queue_mode": queue_mode,
        "has_editorial_grants": has_grants,
        "scopes": list(token.scopes or []),
        "formats": ["md", "png", "jpeg", "gif", "webp", "pdf"],
        "limits": {
            "markdown_max_bytes": settings.integration_markdown_max_bytes,
            "attachment_max_bytes": settings.integration_attachment_max_bytes,
            "batch_max_operations": settings.integration_batch_max_operations,
            "batch_max_bytes": settings.integration_batch_max_bytes,
            "manifest_page_max": settings.integration_manifest_page_max,
            "path_max_length": settings.ingest_max_path_length,
            "path_max_depth": settings.ingest_max_path_depth,
        },
        "quota": {
            "personal_max_bytes": quota,
            "personal_used_bytes": used,
            "personal_remaining_bytes": max(0, quota - used),
        },
        "links": {
            "personal_graph": f"{base}/#/graph",
            "differ": f"{base}/#/offer",
        },
    }


async def read_manifest_page(
    database: AsyncSession,
    *,
    user: User,
    cursor: str | None,
    limit: int | None,
) -> dict[str, Any]:
    page = settings.integration_manifest_page_max
    if limit is not None:
        if limit < 1:
            raise IntegrationError(400, "invalid_request", "limit должен быть больше 0")
        page = min(limit, settings.integration_manifest_page_max)
    now = datetime.now(UTC)
    offset = 0
    snapshot: IntegrationSnapshot | None = None
    if cursor:
        snapshot_id, offset = _parse_cursor(cursor)
        snapshot = await database.get(IntegrationSnapshot, snapshot_id)
        if (
            snapshot is None
            or snapshot.user_id != user.id
            or snapshot.expires_at <= now
        ):
            raise IntegrationError(410, "snapshot_expired", "снимок манифеста истёк")
    else:
        items = await list_manifest_items(database, user.id)
        snapshot = IntegrationSnapshot(
            user_id=user.id,
            items=items,
            expires_at=now + timedelta(hours=settings.integration_plan_ttl_hours),
        )
        database.add(snapshot)
        await database.commit()
        await database.refresh(snapshot)
    assert snapshot is not None
    window = list(snapshot.items)[offset : offset + page]
    next_offset = offset + len(window)
    next_cursor = None
    if next_offset < len(snapshot.items):
        next_cursor = f"{snapshot.id}:{next_offset}"
    return {
        "snapshot_id": str(snapshot.id),
        "items": window,
        "next_cursor": next_cursor,
    }


def _parse_cursor(cursor: str) -> tuple[uuid.UUID, int]:
    try:
        raw_id, raw_offset = cursor.split(":", 1)
        snapshot_id = uuid.UUID(raw_id)
        offset = int(raw_offset)
    except (ValueError, TypeError) as exc:
        raise IntegrationError(410, "snapshot_expired", "снимок манифеста истёк") from exc
    if offset < 0:
        raise IntegrationError(410, "snapshot_expired", "снимок манифеста истёк")
    return snapshot_id, offset


async def file_content(
    database: AsyncSession, *, user: User, path: str
) -> tuple[bytes, dict[str, str]]:
    try:
        normalized = normalize_integration_path(path)
    except IntegrationPathError as exc:
        raise IntegrationError(400, "invalid_path", "путь недопустим") from exc
    kind = kind_for_path(normalized)
    if kind == "markdown":
        row = await database.scalar(
            select(PersonalUpload).where(
                PersonalUpload.user_id == user.id, PersonalUpload.path == normalized
            )
        )
        if row is None:
            raise IntegrationError(404, "not_found", "файл не найден")
        payload = row.body.encode("utf-8")
        headers = {
            "Content-Type": "text/markdown; charset=utf-8",
            "X-GraphNotes-Path": quote(normalized, safe="/"),
            "X-GraphNotes-Kind": "markdown",
            "X-GraphNotes-SHA256": row.content_hash,
            "X-GraphNotes-Version": row.object_version,
            "X-GraphNotes-Size": str(len(payload)),
            "Cache-Control": "no-store",
        }
        return payload, headers
    row = await database.scalar(
        select(PersonalAsset).where(
            PersonalAsset.user_id == user.id, PersonalAsset.path == normalized
        )
    )
    if row is None:
        raise IntegrationError(404, "not_found", "файл не найден")
    headers = {
        "Content-Type": _asset_content_type(row.kind),
        "X-GraphNotes-Path": quote(normalized, safe="/"),
        "X-GraphNotes-Kind": row.kind,
        "X-GraphNotes-SHA256": row.sha256,
        "X-GraphNotes-Version": row.object_version,
        "X-GraphNotes-Size": str(row.size),
        "Cache-Control": "no-store",
    }
    return row.payload, headers


def _asset_content_type(kind: str) -> str:
    return {
        "png": "image/png",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "pdf": "application/pdf",
    }.get(kind, "application/octet-stream")


def _normalize_operation(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise IntegrationError(400, "invalid_request", "операция должна быть объектом")
    op = raw.get("op")
    if op not in {"upsert", "delete"}:
        raise IntegrationError(400, "invalid_request", "op должен быть upsert или delete")
    try:
        path = normalize_integration_path(str(raw.get("path") or ""))
    except IntegrationPathError as exc:
        raise IntegrationError(
            400,
            "invalid_path",
            "путь недопустим",
            details=[{"path": raw.get("path")}],
        ) from exc
    inferred = kind_for_path(path)
    declared = raw.get("kind")
    if op == "upsert":
        if declared not in {None, "", inferred}:
            raise IntegrationError(
                400,
                "invalid_request",
                "kind не совпадает с расширением пути",
                details=[{"path": path, "kind": declared}],
            )
        sha256 = str(raw.get("sha256") or "").casefold()
        if not SHA256_RE.match(sha256):
            raise IntegrationError(
                400,
                "invalid_request",
                "sha256 должен быть 64 шестнадцатеричными символами",
                details=[{"path": path}],
            )
        try:
            size = int(raw.get("size"))
        except (TypeError, ValueError) as exc:
            raise IntegrationError(
                400, "invalid_request", "size должен быть числом", details=[{"path": path}]
            ) from exc
        if size < 0:
            raise IntegrationError(400, "invalid_request", "size отрицательный")
        limit = (
            settings.integration_markdown_max_bytes
            if inferred == "markdown"
            else settings.integration_attachment_max_bytes
        )
        if size > limit:
            raise IntegrationError(
                413,
                "file_too_large",
                "файл слишком большой",
                details=[{"path": path, "size": size, "limit": limit}],
            )
        expected = raw.get("expected_version")
        if expected is not None and not isinstance(expected, str):
            raise IntegrationError(400, "invalid_request", "expected_version должна быть строкой или null")
        return {
            "op": "upsert",
            "path": path,
            "kind": inferred,
            "expected_version": expected,
            "sha256": sha256,
            "size": size,
        }
    expected = raw.get("expected_version")
    if not isinstance(expected, str) or not expected:
        raise IntegrationError(
            400,
            "invalid_request",
            "для удаления нужна текущая expected_version",
            details=[{"path": path}],
        )
    return {
        "op": "delete",
        "path": path,
        "kind": inferred,
        "expected_version": expected,
        "sha256": None,
        "size": 0,
    }


def _validate_plan(raw: dict[str, Any], *, token: IntegrationToken) -> tuple[str, list[dict[str, Any]]]:
    client_id = str(raw.get("client_id") or "").strip()
    if not client_id or len(client_id) > 64:
        raise IntegrationError(400, "invalid_request", "нужен client_id")
    operations = raw.get("operations")
    if not isinstance(operations, list) or not operations:
        raise IntegrationError(400, "invalid_request", "нужен непустой список operations")
    if len(operations) > settings.integration_batch_max_operations:
        raise IntegrationError(413, "batch_too_large", "слишком много операций в пакете")
    normalized: list[dict[str, Any]] = []
    seen: dict[str, str] = {}
    batch_bytes = 0
    for item in operations:
        op = _normalize_operation(item)
        folded = op["path"].casefold()
        if folded in seen:
            raise IntegrationError(
                400,
                "invalid_path",
                "один путь в пакете допускается только один раз",
                details=[{"path": op["path"], "conflicts_with": seen[folded]}],
            )
        seen[folded] = op["path"]
        if op["op"] == "delete":
            if "personal:delete" not in set(token.scopes or []):
                raise IntegrationError(
                    403,
                    "insufficient_scope",
                    "удаление требует scope personal:delete",
                    details=[{"path": op["path"]}],
                )
        else:
            batch_bytes += int(op["size"])
        normalized.append(op)
    if batch_bytes > settings.integration_batch_max_bytes:
        raise IntegrationError(413, "batch_too_large", "пакет слишком большой")
    return client_id, normalized


def required_blobs_for(operations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    blobs: dict[str, int] = {}
    for op in operations:
        if op["op"] != "upsert":
            continue
        previous = blobs.get(op["sha256"])
        if previous is not None and previous != op["size"]:
            raise IntegrationError(
                400,
                "invalid_request",
                "один хеш в пакете указан с разными размерами",
            )
        blobs[op["sha256"]] = int(op["size"])
    return [{"sha256": digest, "size": size} for digest, size in blobs.items()]


def transfer_public(row: IntegrationTransfer, remaining: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "transfer_id": str(row.id),
        "state": row.state,
        "files_applied": row.files_applied,
        "expires_at": iso(row.expires_at),
        "required_blobs": list(row.required_blobs or []),
        "remaining_blobs": remaining if remaining is not None else [],
        "results": list(row.results or []),
        "errors": list(row.errors or []),
        "index_revision": row.index_revision,
        "client_id": row.client_id,
    }


async def remaining_blobs(
    database: AsyncSession, transfer: IntegrationTransfer
) -> list[dict[str, Any]]:
    uploaded = set(
        (
            await database.scalars(
                select(IntegrationBlob.sha256).where(
                    IntegrationBlob.transfer_id == transfer.id
                )
            )
        ).all()
    )
    return [
        item
        for item in list(transfer.required_blobs or [])
        if item.get("sha256") not in uploaded
    ]


async def create_transfer(
    database: AsyncSession,
    *,
    user: User,
    token: IntegrationToken,
    payload: dict[str, Any],
    idempotency_key: str | None,
) -> IntegrationTransfer:
    from app.services.integration_tokens import require_scopes

    require_scopes(token, "personal:read", "personal:write")
    assert_write_allowed(user)
    client_id, operations = _validate_plan(payload, token=token)
    await _reject_case_collisions(database, user.id, operations)
    blobs = required_blobs_for(operations)
    body_hash = canonical_body_hash({"client_id": client_id, "operations": operations})
    if idempotency_key:
        if len(idempotency_key) > 80:
            raise IntegrationError(400, "invalid_request", "Idempotency-Key слишком длинный")
        existing = await database.scalar(
            select(IntegrationIdempotency).where(
                IntegrationIdempotency.user_id == user.id,
                IntegrationIdempotency.route == IDEMPOTENCY_ROUTE,
                IntegrationIdempotency.key == idempotency_key,
            )
        )
        if existing is not None:
            if existing.body_hash != body_hash:
                raise IntegrationError(
                    409,
                    "idempotency_mismatch",
                    "тот же Idempotency-Key уже использован с другим телом",
                )
            row = await database.get(IntegrationTransfer, existing.transfer_id)
            if row is None:
                raise IntegrationError(404, "not_found", "передача не найдена")
            return row
    now = datetime.now(UTC)
    state = "ready" if not blobs else "awaiting_upload"
    row = IntegrationTransfer(
        user_id=user.id,
        token_id=token.id,
        client_id=client_id,
        state=state,
        files_applied=False,
        operations=operations,
        required_blobs=blobs,
        results=[],
        errors=[],
        expires_at=now + timedelta(hours=settings.integration_plan_ttl_hours),
        result_expires_at=now + timedelta(days=settings.integration_result_ttl_days),
    )
    database.add(row)
    await database.flush()
    if idempotency_key:
        database.add(
            IntegrationIdempotency(
                user_id=user.id,
                route=IDEMPOTENCY_ROUTE,
                key=idempotency_key,
                body_hash=body_hash,
                transfer_id=row.id,
            )
        )
    record_audit_event(
        database,
        action="integration.transfer_created",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={
            "token_id": str(token.id),
            "client_id": client_id,
            "transfer_id": str(row.id),
            "operations": [item["path"] for item in operations],
        },
    )
    await database.commit()
    await database.refresh(row)
    return row


async def _reject_case_collisions(
    database: AsyncSession, user_id: uuid.UUID, operations: list[dict[str, Any]]
) -> None:
    existing = await list_manifest_items(database, user_id)
    by_fold = {str(item["path"]).casefold(): str(item["path"]) for item in existing}
    for op in operations:
        other = by_fold.get(op["path"].casefold())
        if other and other != op["path"]:
            raise IntegrationError(
                400,
                "invalid_path",
                "путь совпадает с существующим без учёта регистра",
                details=[{"path": op["path"], "conflicts_with": other}],
            )


async def get_owned_transfer(
    database: AsyncSession, *, user: User, transfer_id: uuid.UUID
) -> IntegrationTransfer:
    row = await database.get(IntegrationTransfer, transfer_id)
    if row is None or row.user_id != user.id:
        raise IntegrationError(404, "not_found", "передача не найдена")
    await maybe_expire(database, row)
    return row


async def maybe_expire(database: AsyncSession, row: IntegrationTransfer) -> None:
    if row.state in TERMINAL_UNAPPLIED | {"succeeded", "indexing_failed"}:
        return
    if row.files_applied:
        return
    now = datetime.now(UTC)
    stamp = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if stamp > now:
        return
    row.state = "expired"
    row.files_applied = False
    await database.execute(
        delete(IntegrationBlob).where(IntegrationBlob.transfer_id == row.id)
    )
    await database.commit()
    await database.refresh(row)


async def put_blob(
    database: AsyncSession,
    *,
    user: User,
    transfer: IntegrationTransfer,
    sha256: str,
    payload: bytes,
) -> None:
    digest = sha256.casefold()
    if not SHA256_RE.match(digest):
        raise IntegrationError(400, "invalid_request", "sha256 в пути недопустим")
    if transfer.state == "expired":
        raise IntegrationError(410, "transfer_expired", "план передачи истёк")
    if transfer.state not in {"awaiting_upload", "ready"}:
        raise IntegrationError(409, "invalid_state", "загрузка в этом состоянии недоступна")
    allowed = {item["sha256"]: int(item["size"]) for item in list(transfer.required_blobs or [])}
    if digest not in allowed:
        raise IntegrationError(400, "invalid_request", "этот хеш не входит в план")
    expected_size = allowed[digest]
    if len(payload) != expected_size:
        raise IntegrationError(
            422,
            "hash_mismatch",
            "размер загруженных байтов не совпадает с планом",
            details=[{"sha256": digest, "size": len(payload), "expected_size": expected_size}],
        )
    actual = sha256_bytes(payload)
    if actual != digest:
        raise IntegrationError(422, "hash_mismatch", "SHA-256 содержимого не совпадает")
    kinds = {op["kind"] for op in list(transfer.operations or []) if op.get("sha256") == digest}
    for kind in kinds:
        sniff_kind(payload, str(kind))
    existing = await database.scalar(
        select(IntegrationBlob).where(
            IntegrationBlob.transfer_id == transfer.id,
            IntegrationBlob.sha256 == digest,
        )
    )
    if existing is None:
        database.add(
            IntegrationBlob(
                transfer_id=transfer.id,
                user_id=user.id,
                sha256=digest,
                size=len(payload),
                payload=payload,
            )
        )
    await database.flush()
    leftover = await remaining_blobs(database, transfer)
    if not leftover:
        transfer.state = "ready"
    await database.commit()


async def cancel_transfer(
    database: AsyncSession, *, user: User, transfer: IntegrationTransfer
) -> None:
    if transfer.state in BUSY_STATES:
        raise IntegrationError(409, "invalid_state", "пакет уже применяется")
    if transfer.files_applied:
        raise IntegrationError(409, "invalid_state", "пакет уже применён")
    if transfer.state not in {"cancelled", "expired"}:
        transfer.state = "cancelled"
        await database.execute(
            delete(IntegrationBlob).where(IntegrationBlob.transfer_id == transfer.id)
        )
        record_audit_event(
            database,
            action="integration.transfer_cancelled",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={"transfer_id": str(transfer.id), "client_id": transfer.client_id},
        )
        await database.commit()


async def commit_transfer(
    database: AsyncSession,
    *,
    user: User,
    token: IntegrationToken,
    transfer: IntegrationTransfer,
) -> IntegrationTransfer:
    from app.services.integration_tokens import require_scopes

    if transfer.state == "expired":
        raise IntegrationError(410, "transfer_expired", "план передачи истёк")
    if transfer.state == "indexing_failed":
        return await _retry_index(database, user=user, token=token, transfer=transfer)
    if transfer.state in {"succeeded", "conflict", "failed", "cancelled"}:
        return transfer
    if transfer.state in BUSY_STATES:
        return transfer
    require_scopes(token, "personal:read", "personal:write")
    if any(op.get("op") == "delete" for op in list(transfer.operations or [])):
        require_scopes(token, "personal:delete")
    assert_write_allowed(user)
    leftover = await remaining_blobs(database, transfer)
    if leftover:
        raise IntegrationError(
            409,
            "invalid_state",
            "сначала загрузите все файлы плана",
            details=leftover,
        )
    busy = await database.scalar(
        select(IntegrationTransfer.id).where(
            IntegrationTransfer.user_id == user.id,
            IntegrationTransfer.state.in_(tuple(BUSY_STATES)),
            IntegrationTransfer.id != transfer.id,
        )
    )
    if busy is not None:
        raise IntegrationError(409, "transfer_busy", "уже выполняется другая фиксация")

    await _lock_user(database, user.id)
    conflicts = await _collect_conflicts(database, user, transfer)
    if conflicts:
        transfer.state = "conflict"
        transfer.files_applied = False
        transfer.errors = conflicts
        record_audit_event(
            database,
            action="integration.transfer_conflict",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={
                "token_id": str(token.id),
                "client_id": transfer.client_id,
                "transfer_id": str(transfer.id),
                "paths": [item.get("path") for item in conflicts],
            },
        )
        await database.commit()
        await database.refresh(transfer)
        raise IntegrationError(
            409,
            "version_conflict",
            "файл изменён на сервере после последней сверки",
            details=conflicts,
        )
    in_use = await _collect_resource_in_use(database, user, transfer)
    if in_use:
        transfer.state = "failed"
        transfer.files_applied = False
        transfer.errors = in_use
        await database.commit()
        await database.refresh(transfer)
        raise IntegrationError(
            409,
            "resource_in_use",
            "путь используется и не может быть удалён",
            details=in_use,
        )
    quota_error = await _quota_error(database, user, transfer)
    if quota_error is not None:
        transfer.state = "failed"
        transfer.files_applied = False
        transfer.errors = [quota_error]
        await database.commit()
        await database.refresh(transfer)
        remaining = max(
            0, settings.integration_personal_quota_bytes - await personal_used_bytes(database, user.id)
        )
        raise IntegrationError(
            409,
            "quota_exceeded",
            "недостаточно места в личном хранилище",
            details=[{**quota_error, "remaining_bytes": remaining}],
        )

    transfer_id = transfer.id
    try:
        results = await _apply_operations(database, user=user, transfer=transfer)
    except IntegrationError as exc:
        await database.rollback()
        fresh = await database.get(IntegrationTransfer, transfer_id)
        if fresh is not None:
            fresh.state = "failed"
            fresh.files_applied = False
            fresh.errors = exc.details or [{"code": exc.code, "message": exc.message}]
            await database.commit()
            await database.refresh(fresh)
        raise

    transfer.state = "indexing"
    transfer.files_applied = True
    transfer.results = results
    transfer.errors = []
    await database.execute(
        delete(IntegrationBlob).where(IntegrationBlob.transfer_id == transfer.id)
    )
    record_audit_event(
        database,
        action="integration.transfer_applied",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={
            "token_id": str(token.id),
            "client_id": transfer.client_id,
            "transfer_id": str(transfer.id),
            "paths": [item.get("path") for item in results],
            "versions": [item.get("version") for item in results],
            "sizes": [item.get("size") for item in results],
            "result": "applied",
        },
    )
    await database.commit()
    await database.refresh(transfer)
    return await _retry_index(database, user=user, token=token, transfer=transfer)


async def _retry_index(
    database: AsyncSession,
    *,
    user: User,
    token: IntegrationToken,
    transfer: IntegrationTransfer,
) -> IntegrationTransfer:
    if not transfer.files_applied:
        return transfer
    try:
        revision = await reindex_personal_uploads(database, user.id)
        transfer.state = "succeeded"
        transfer.index_revision = revision
        record_audit_event(
            database,
            action="integration.transfer_indexed",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={
                "token_id": str(token.id),
                "client_id": transfer.client_id,
                "transfer_id": str(transfer.id),
                "index_revision": revision,
                "result": "succeeded",
            },
        )
        await database.commit()
    except (IndexerError, ValueError) as exc:
        transfer.state = "indexing_failed"
        transfer.errors = [{"code": "indexing_failed", "message": str(exc)[:255]}]
        record_audit_event(
            database,
            action="integration.transfer_index_failed",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={
                "token_id": str(token.id),
                "client_id": transfer.client_id,
                "transfer_id": str(transfer.id),
                "result": "indexing_failed",
            },
        )
        await database.commit()
    await database.refresh(transfer)
    return transfer


async def _lock_user(database: AsyncSession, user_id: uuid.UUID) -> None:
    bind = database.get_bind()
    stmt = select(User).where(User.id == user_id)
    if bind is not None and bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update()
    await database.scalar(stmt)


async def _current_objects(
    database: AsyncSession, user_id: uuid.UUID
) -> dict[str, tuple[str, str, int, str]]:
    """path -> (kind, version, size, sha256)"""
    found: dict[str, tuple[str, str, int, str]] = {}
    for row in (
        await database.scalars(
            select(PersonalUpload).where(PersonalUpload.user_id == user_id)
        )
    ).all():
        payload = row.body.encode("utf-8")
        found[row.path] = ("markdown", row.object_version, len(payload), row.content_hash)
    for row in (
        await database.scalars(select(PersonalAsset).where(PersonalAsset.user_id == user_id))
    ).all():
        found[row.path] = (row.kind, row.object_version, row.size, row.sha256)
    return found


async def _collect_conflicts(
    database: AsyncSession, user: User, transfer: IntegrationTransfer
) -> list[dict[str, Any]]:
    current = await _current_objects(database, user.id)
    conflicts: list[dict[str, Any]] = []
    for op in list(transfer.operations or []):
        row = current.get(op["path"])
        expected = op.get("expected_version")
        if op["op"] == "upsert":
            if expected is None:
                if row is not None:
                    conflicts.append(
                        {
                            "path": op["path"],
                            "current_version": row[1],
                            "current_sha256": row[3],
                        }
                    )
                continue
            if row is None or row[1] != expected:
                conflicts.append(
                    {
                        "path": op["path"],
                        "current_version": None if row is None else row[1],
                        "current_sha256": None if row is None else row[3],
                    }
                )
            continue
        if row is None or row[1] != expected:
            conflicts.append(
                {
                    "path": op["path"],
                    "current_version": None if row is None else row[1],
                    "current_sha256": None if row is None else row[3],
                }
            )
    return conflicts


async def _collect_resource_in_use(
    database: AsyncSession, user: User, transfer: IntegrationTransfer
) -> list[dict[str, Any]]:
    deletes = [op for op in list(transfer.operations or []) if op["op"] == "delete"]
    if not deletes:
        return []
    delete_paths = {op["path"] for op in deletes}
    in_use: list[dict[str, Any]] = []
    proposals = (
        await database.scalars(
            select(Proposal).where(
                Proposal.author_user_id == user.id,
                Proposal.status.in_(tuple(ACTIVE_PROPOSALS)),
            )
        )
    ).all()
    proposed: set[str] = set()
    for row in proposals:
        try:
            paths = json.loads(row.scope_paths)
        except json.JSONDecodeError:
            paths = []
        if isinstance(paths, list):
            proposed.update(str(item) for item in paths)
    for path in sorted(delete_paths & proposed):
        in_use.append({"path": path, "reason": "open_proposal"})

    notes = {
        row.path: row.body
        for row in (
            await database.scalars(
                select(PersonalUpload).where(PersonalUpload.user_id == user.id)
            )
        ).all()
    }
    for op in list(transfer.operations or []):
        if op["op"] == "delete" and op["kind"] == "markdown":
            notes.pop(op["path"], None)
        elif op["op"] == "upsert" and op["kind"] == "markdown":
            blob = await _blob_payload(database, transfer.id, op["sha256"])
            notes[op["path"]] = blob.decode("utf-8")
    lookup = notes_lookup_map(set(notes))
    referenced: set[str] = set()
    for text in notes.values():
        parsed = parse_markdown("note.md", text)
        for raw in parsed.links:
            target = resolve_link_target(raw, lookup) or raw
            referenced.add(target)
            referenced.add(raw)
    for path in sorted(delete_paths):
        if path in referenced:
            in_use.append({"path": path, "reason": "referenced"})
    # unique by path
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in in_use:
        key = str(item["path"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


async def _quota_error(
    database: AsyncSession, user: User, transfer: IntegrationTransfer
) -> dict[str, Any] | None:
    current = await _current_objects(database, user.id)
    used = sum(item[2] for item in current.values())
    projected = used
    for op in list(transfer.operations or []):
        existing = current.get(op["path"])
        if op["op"] == "delete":
            if existing:
                projected -= existing[2]
            continue
        if existing:
            projected -= existing[2]
        projected += int(op["size"])
    if projected > settings.integration_personal_quota_bytes:
        return {
            "path": None,
            "projected_bytes": projected,
            "limit_bytes": settings.integration_personal_quota_bytes,
        }
    return None


async def _blob_payload(
    database: AsyncSession, transfer_id: uuid.UUID, sha256: str
) -> bytes:
    row = await database.scalar(
        select(IntegrationBlob).where(
            IntegrationBlob.transfer_id == transfer_id,
            IntegrationBlob.sha256 == sha256,
        )
    )
    if row is None:
        raise IntegrationError(409, "invalid_state", "байты плана не загружены")
    return row.payload


async def _apply_operations(
    database: AsyncSession, *, user: User, transfer: IntegrationTransfer
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for op in list(transfer.operations or []):
        if op["op"] == "delete":
            results.append(await _apply_delete(database, user=user, path=op["path"], kind=op["kind"]))
            continue
        payload = await _blob_payload(database, transfer.id, op["sha256"])
        sniff_kind(payload, op["kind"])
        if op["kind"] == "markdown":
            verdict = inspect_markdown_bytes(payload)
            if verdict.is_noise:
                raise IntegrationError(
                    415,
                    "unsupported_type",
                    "содержимое не похоже на Markdown-заметку",
                    details=[{"path": op["path"], "reasons": list(verdict.reasons)}],
                )
            results.append(
                await _apply_markdown(
                    database,
                    user=user,
                    path=op["path"],
                    payload=payload,
                    sha256=op["sha256"],
                )
            )
            continue
        results.append(
            await _apply_asset(
                database,
                user=user,
                path=op["path"],
                kind=op["kind"],
                payload=payload,
                sha256=op["sha256"],
            )
        )
    return results


async def _apply_markdown(
    database: AsyncSession,
    *,
    user: User,
    path: str,
    payload: bytes,
    sha256: str,
) -> dict[str, Any]:
    text = payload.decode("utf-8")
    parsed = parse_markdown(path, text)
    if parsed.content_hash != sha256:
        # parse_markdown hashes UTF-8 text; well-formed UTF-8 matches raw bytes.
        raise IntegrationError(422, "hash_mismatch", "хеш Markdown не совпал после декодирования")
    row = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == user.id, PersonalUpload.path == path
        )
    )
    version = uuid.uuid4().hex
    if row is None:
        database.add(
            PersonalUpload(
                user_id=user.id,
                path=path,
                body=text,
                content_hash=sha256,
                object_version=version,
            )
        )
        before = ""
    else:
        before = row.body
        if row.content_hash == sha256:
            version = row.object_version
        else:
            row.body = text
            row.content_hash = sha256
            row.object_version = version
    if before != text:
        database.add(UploadEvent(user_id=user.id, path=path, content_hash=sha256))
        await record_personal_edit_events(
            database,
            user=user,
            path=path,
            before_text=before,
            after_text=text,
        )
    await database.flush()
    return {
        "path": path,
        "op": "upsert",
        "kind": "markdown",
        "version": version,
        "sha256": sha256,
        "size": len(payload),
    }


async def _apply_asset(
    database: AsyncSession,
    *,
    user: User,
    path: str,
    kind: str,
    payload: bytes,
    sha256: str,
) -> dict[str, Any]:
    row = await database.scalar(
        select(PersonalAsset).where(
            PersonalAsset.user_id == user.id, PersonalAsset.path == path
        )
    )
    version = uuid.uuid4().hex
    if row is None:
        database.add(
            PersonalAsset(
                user_id=user.id,
                path=path,
                kind=kind,
                sha256=sha256,
                size=len(payload),
                object_version=version,
                payload=payload,
            )
        )
    elif row.sha256 == sha256:
        version = row.object_version
    else:
        row.kind = kind
        row.sha256 = sha256
        row.size = len(payload)
        row.object_version = version
        row.payload = payload
    await database.flush()
    return {
        "path": path,
        "op": "upsert",
        "kind": kind,
        "version": version,
        "sha256": sha256,
        "size": len(payload),
    }


async def _apply_delete(
    database: AsyncSession, *, user: User, path: str, kind: str
) -> dict[str, Any]:
    if kind == "markdown":
        row = await database.scalar(
            select(PersonalUpload).where(
                PersonalUpload.user_id == user.id, PersonalUpload.path == path
            )
        )
        if row is not None:
            await record_personal_edit_events(
                database,
                user=user,
                path=path,
                before_text=row.body,
                after_text="",
            )
            await database.delete(row)
    else:
        row = await database.scalar(
            select(PersonalAsset).where(
                PersonalAsset.user_id == user.id, PersonalAsset.path == path
            )
        )
        if row is not None:
            await database.delete(row)
    await database.flush()
    return {"path": path, "op": "delete", "kind": kind, "version": None, "sha256": None, "size": 0}
