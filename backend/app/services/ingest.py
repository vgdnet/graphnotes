from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.auth_session import AuthSession
from app.models.github import PersonalRepository, SharedRepository
from app.models.personal_upload import PersonalUpload, UploadEvent
from app.models.shared_note import SharedNote
from app.models.proposal import Proposal, ProposalStatus
from app.models.user import User, UserRole
from app.services.archive import ArchiveError, read_markdown_bytes, read_zip_markdown
from app.services.audit import record_audit_event
from app.services.closed_corpus import (
    all_closed_keys,
    closed_paths_for_user,
    is_globally_closed,
    lock_stub,
    matches_closed,
)
from app.services.git_paths import PathError, normalize_git_path
from app.services.github import GitHubAppClient
from app.services.index import IndexerError
from app.services.markdown import parse_markdown, unresolved_links
from app.services.provenance import record_card_revision, record_personal_edit_events
from app.services.noise import (
    WhiteNoiseContentError,
    inspect_markdown_text,
)
from app.services.notify import notify_admins_white_noise
from app.services.repository import SHARED_SINGLETON_ID


class IngestError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


CONTENT_NOT_NOTES = "content is not Markdown notes"


async def _active_admin_count(database: AsyncSession) -> int:
    count = await database.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == UserRole.ADMIN.value, User.is_active.is_(True))
    )
    return int(count or 0)


async def lock_for_white_noise(
    database: AsyncSession,
    user: User,
    *,
    paths: list[str],
    reasons: list[str],
    source: str,
) -> bool:
    """Reject noise: lock the account (not the last admin), audit, mail admins.

    Already-indexed notes stay. Mail failure must not undo the lock.
    """
    locked = False
    if user.is_active:
        last_admin = (
            user.role == UserRole.ADMIN.value and await _active_admin_count(database) <= 1
        )
        if not last_admin:
            user.is_active = False
            locked = True
            await database.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    when = datetime.now(UTC).isoformat()
    record_audit_event(
        database,
        action="ingest.white_noise_lock",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={
            "paths": paths,
            "reasons": reasons,
            "source": source,
            "locked": locked,
        },
    )
    await database.commit()
    try:
        await notify_admins_white_noise(
            database,
            username=user.username,
            locked_email=user.email,
            when=when,
            reasons=reasons,
            paths=paths,
            locked=locked,
            exclude_user_id=user.id,
        )
        await database.commit()
    except Exception:
        await database.rollback()
    return locked


async def _reject_white_noise(
    database: AsyncSession,
    user: User,
    *,
    paths: list[str],
    reasons: list[str],
    source: str,
) -> None:
    await lock_for_white_noise(
        database, user, paths=paths, reasons=reasons, source=source
    )
    raise IngestError(400, CONTENT_NOT_NOTES)


async def _personal_or_none(database: AsyncSession, user_id) -> PersonalRepository | None:
    return await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user_id)
    )


async def list_upload_events(database: AsyncSession, user: User) -> dict[str, object]:
    rows = (
        await database.scalars(
            select(UploadEvent)
            .where(UploadEvent.user_id == user.id)
            .order_by(UploadEvent.created_at.desc())
            .limit(100)
        )
    ).all()
    proposals = (
        await database.scalars(
            select(Proposal)
            .where(Proposal.author_user_id == user.id)
            .order_by(Proposal.created_at.desc())
        )
    ).all()
    latest_by_path: dict[str, Proposal] = {}
    for row in proposals:
        try:
            paths = json.loads(row.scope_paths)
        except json.JSONDecodeError:
            paths = []
        if not isinstance(paths, list):
            continue
        for path in paths:
            key = str(path)
            if key not in latest_by_path:
                latest_by_path[key] = row
    outcome_map = {
        ProposalStatus.PUBLISHED.value: "accepted",
        ProposalStatus.REJECTED.value: "rejected",
        ProposalStatus.CHANGES_REQUESTED.value: "returned",
        ProposalStatus.OPEN.value: "proposed",
        ProposalStatus.ACCEPTED_PENDING_MERGE.value: "proposed",
        ProposalStatus.MERGED_INDEXING.value: "proposed",
        ProposalStatus.CONFLICTED.value: "proposed",
        ProposalStatus.FAILED.value: "proposed",
    }
    return {
        "events": [
            {
                "path": row.path,
                "content_hash": row.content_hash,
                "created_at": row.created_at,
                "differed": row.path in latest_by_path,
                "proposed": row.path in latest_by_path,
                "outcome": outcome_map.get(latest_by_path[row.path].status)
                if row.path in latest_by_path
                else None,
            }
            for row in rows
        ]
    }


async def _upsert_personal_upload(
    database: AsyncSession, user_id, path: str, text: str, content_hash: str
) -> None:
    current = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == user_id, PersonalUpload.path == path
        )
    )
    before = current.body if current is not None else ""
    if current is None:
        try:
            async with database.begin_nested():
                database.add(
                    PersonalUpload(
                        user_id=user_id,
                        path=path,
                        body=text,
                        content_hash=content_hash,
                    )
                )
                await database.flush()
            await record_card_revision(
                database,
                path=path,
                source=text,
                owner_user_id=user_id,
                actor_user_id=user_id,
                before_text="",
            )
            return
        except IntegrityError:
            current = await database.scalar(
                select(PersonalUpload).where(
                    PersonalUpload.user_id == user_id, PersonalUpload.path == path
                )
            )
            if current is None:
                raise
            before = current.body
    if current.body != text:
        current.body = text
        current.content_hash = content_hash
        current.updated_at = datetime.now(UTC)
        await record_card_revision(
            database,
            path=path,
            source=text,
            owner_user_id=user_id,
            actor_user_id=user_id,
            before_text=before,
        )


async def _upsert_shared_note(
    database: AsyncSession,
    path: str,
    text: str,
    content_hash: str,
    *,
    actor_user_id=None,
) -> None:
    current = await database.scalar(select(SharedNote).where(SharedNote.path == path))
    before = current.body if current is not None else ""
    if current is None:
        try:
            async with database.begin_nested():
                database.add(
                    SharedNote(path=path, body=text, content_hash=content_hash)
                )
                await database.flush()
            await record_card_revision(
                database,
                path=path,
                source=text,
                owner_user_id=None,
                actor_user_id=actor_user_id,
                before_text="",
            )
            return
        except IntegrityError:
            current = await database.scalar(
                select(SharedNote).where(SharedNote.path == path)
            )
            if current is None:
                raise
            before = current.body
    if current.body != text:
        current.body = text
        current.content_hash = content_hash
        current.updated_at = datetime.now(UTC)
        await record_card_revision(
            database,
            path=path,
            source=text,
            owner_user_id=None,
            actor_user_id=actor_user_id,
            before_text=before,
        )


async def _uploads_for(database: AsyncSession, user_id) -> list[PersonalUpload]:
    return list(
        (
            await database.scalars(
                select(PersonalUpload)
                .where(PersonalUpload.user_id == user_id)
                .order_by(PersonalUpload.path)
            )
        ).all()
    )


def _projection_from_text(path: str, text: str, available: set[str]) -> dict[str, object]:
    parsed = parse_markdown(path, text)
    return {
        "path": path,
        "title": parsed.title,
        "tags": list(parsed.tags),
        "aliases": list(parsed.aliases),
        "links": list(parsed.links),
        "unresolved_links": list(unresolved_links(parsed.links, available)),
        "locked_links": [],
        "warnings": list(parsed.warnings),
        "locked": False,
        "closed": False,
    }


async def list_shared_notes(
    database: AsyncSession,
    client: GitHubAppClient | None = None,
) -> dict[str, object]:
    del client
    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None:
        return {"notes": [], "revision": None, "updated_at": None}
    notes_rows = list((await database.scalars(select(SharedNote).order_by(SharedNote.path))).all())
    available = {item.path for item in notes_rows}
    return {
        "notes": [_projection_from_text(item.path, item.body, available) for item in notes_rows],
        "revision": None if row is None else row.observed_sha,
        "updated_at": None if row is None else row.observed_at,
    }


async def list_personal_notes(
    database: AsyncSession,
    user: User,
    client: GitHubAppClient | None = None,
) -> dict[str, object]:
    del client
    row = await _personal_or_none(database, user.id)
    uploads = await _uploads_for(database, user.id)
    if uploads:
        available = {item.path for item in uploads}
        latest = max((item.updated_at for item in uploads), default=None)
        closed = await closed_paths_for_user(database, user.id)
        return {
            "notes": [
                {
                    **_projection_from_text(item.path, item.body, available),
                    "closed": item.path in closed,
                }
                for item in uploads
            ],
            "revision": row.observed_sha if row is not None else None,
            "updated_at": latest,
        }
    return {
        "notes": [],
        "revision": row.observed_sha if row is not None else None,
        "updated_at": None,
    }


async def get_personal_note(
    database: AsyncSession,
    user: User,
    path: str,
    client: GitHubAppClient | None = None,
    *,
    owner_id=None,
) -> dict[str, object]:
    del client
    try:
        normalized = normalize_git_path(path)
    except PathError as exc:
        raise IngestError(400, str(exc)) from exc
    target_id = user.id
    if owner_id is not None and owner_id != user.id:
        if user.role != UserRole.ADMIN.value:
            raise IngestError(404, "note was not found")
        target_id = owner_id
    upload = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == target_id,
            PersonalUpload.path == normalized,
        )
    )
    if upload is not None:
        available = {item.path for item in await _uploads_for(database, target_id)}
        parsed = parse_markdown(normalized, upload.body)
        return {
            "path": normalized,
            "title": parsed.title,
            "tags": list(parsed.tags),
            "aliases": list(parsed.aliases),
            "links": list(parsed.links),
            "unresolved_links": list(unresolved_links(parsed.links, available)),
            "locked_links": [],
            "warnings": list(parsed.warnings),
            "body": parsed.body,
            "content_hash": parsed.content_hash,
            "locked": False,
            "closed": normalized in await closed_paths_for_user(database, target_id),
            "source": upload.body,
        }
    raise IngestError(404, "note was not found")


async def save_personal_note(
    database: AsyncSession,
    *,
    user: User,
    path: str,
    source: str,
    expected_hash: str,
    client: GitHubAppClient | None = None,
) -> dict[str, object]:
    del client  # leftover git write; working copy is personal_uploads
    try:
        normalized = normalize_git_path(path)
    except PathError as exc:
        raise IngestError(400, str(exc)) from exc
    encoded = source.encode("utf-8")
    if len(encoded) > settings.ingest_max_file_bytes:
        raise IngestError(400, "file is too large")
    verdict = inspect_markdown_text(source)
    if verdict.is_noise:
        await _reject_white_noise(
            database,
            user,
            paths=[normalized],
            reasons=list(verdict.reasons),
            source="editor",
        )
    try:
        parsed = parse_markdown(normalized, source)
    except ValueError as exc:
        raise IngestError(400, str(exc)) from exc

    return await _save_personal_upload(
        database,
        user=user,
        path=normalized,
        source=source,
        parsed_hash=parsed.content_hash,
        expected_hash=expected_hash,
    )


async def _save_personal_upload(
    database: AsyncSession,
    *,
    user: User,
    path: str,
    source: str,
    parsed_hash: str,
    expected_hash: str,
    client: GitHubAppClient | None = None,
) -> dict[str, object]:
    del client
    from app.services.index import reindex_personal_uploads
    upload = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == user.id,
            PersonalUpload.path == path,
        )
    )
    if upload is None:
        database.add(
            PersonalUpload(
                user_id=user.id,
                path=path,
                body=source,
                content_hash=parsed_hash,
            )
        )
        database.add(UploadEvent(user_id=user.id, path=path, content_hash=parsed_hash))
        await record_personal_edit_events(
            database,
            user=user,
            path=path,
            before_text="",
            after_text=source,
        )
        record_audit_event(
            database,
            action="notes.create_personal",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={"path": path, "source": "upload"},
        )
        await database.commit()
        try:
            await reindex_personal_uploads(database, user.id)
            await database.commit()
        except IndexerError:
            pass
        return await get_personal_note(database, user, path)
    if expected_hash != upload.content_hash:
        raise IngestError(409, "note changed, reload the card")
    if upload.body != source:
        before_text = upload.body
        upload.body = source
        upload.content_hash = parsed_hash
        database.add(
            UploadEvent(user_id=user.id, path=path, content_hash=parsed_hash)
        )
        await record_personal_edit_events(
            database,
            user=user,
            path=path,
            before_text=before_text,
            after_text=source,
        )
        record_audit_event(
            database,
            action="notes.edit_personal",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={"path": path, "source": "upload"},
        )
        await database.commit()
    try:
        await reindex_personal_uploads(database, user.id)
        await database.commit()
    except IndexerError:
        pass
    return await get_personal_note(database, user, path)


async def get_shared_note(
    database: AsyncSession,
    path: str,
    client: GitHubAppClient | None = None,
) -> dict[str, object]:
    del client
    try:
        normalized = normalize_git_path(path)
    except PathError as exc:
        raise IngestError(400, str(exc)) from exc
    stored = await database.scalar(select(SharedNote).where(SharedNote.path == normalized))
    if stored is None:
        if await is_globally_closed(database, normalized):
            return lock_stub(normalized)
        raise IngestError(404, "note was not found")
    notes_rows = list((await database.scalars(select(SharedNote))).all())
    paths = {item.path for item in notes_rows}
    parsed = parse_markdown(normalized, stored.body)
    missing = list(unresolved_links(parsed.links, paths))
    closed_keys = await all_closed_keys(database)
    locked = [item for item in missing if matches_closed(item, closed_keys)]
    unresolved = [item for item in missing if item not in locked]
    return {
        "path": normalized,
        "title": parsed.title,
        "tags": list(parsed.tags),
        "aliases": list(parsed.aliases),
        "links": list(parsed.links),
        "unresolved_links": unresolved,
        "locked_links": locked,
        "warnings": list(parsed.warnings),
        "body": parsed.body,
        "content_hash": parsed.content_hash,
        "locked": False,
        "closed": False,
    }


async def import_markdown(
    database: AsyncSession,
    *,
    user: User,
    filename: str,
    data: bytes,
    expected_sha: str | None = None,
    client: GitHubAppClient | None = None,
) -> dict[str, object]:
    del expected_sha, client
    try:
        if filename.lower().endswith(".zip") or data.startswith(b"PK"):
            incoming = read_zip_markdown(data)
        elif filename.lower().endswith(".md"):
            incoming = read_markdown_bytes(data, filename)
        else:
            raise IngestError(400, "upload a Markdown file or a ZIP archive")
    except WhiteNoiseContentError as exc:
        await _reject_white_noise(
            database,
            user,
            paths=exc.paths,
            reasons=list(exc.reasons),
            source="upload",
        )
    except (ArchiveError, PathError) as exc:
        raise IngestError(400, str(exc)) from exc

    return await _import_without_git(
        database,
        user=user,
        incoming=incoming,
    )


async def _import_without_git(
    database: AsyncSession,
    *,
    user: User,
    incoming: list[tuple[str, str]],
) -> dict[str, object]:
    accepted: list[str] = []
    skipped: list[str] = []
    conflicted: list[str] = []
    warnings: list[str] = []
    existing_rows = {
        row.path: row
        for row in await _uploads_for(database, user.id)
    }
    for path, text in incoming:
        parsed = parse_markdown(path, text)
        warnings.extend(f"{path}: {item}" for item in parsed.warnings)
        current = existing_rows.get(path)
        database.add(
            UploadEvent(user_id=user.id, path=path, content_hash=parsed.content_hash)
        )
        if current is None:
            row = PersonalUpload(
                user_id=user.id,
                path=path,
                body=text,
                content_hash=parsed.content_hash,
            )
            database.add(row)
            existing_rows[path] = row
            accepted.append(path)
            await record_card_revision(
                database,
                path=path,
                source=text,
                owner_user_id=user.id,
                actor_user_id=user.id,
                before_text="",
            )
        elif current.body == text:
            skipped.append(path)
        else:
            before_text = current.body
            current.body = text
            current.content_hash = parsed.content_hash
            accepted.append(path)
            await record_card_revision(
                database,
                path=path,
                source=text,
                owner_user_id=user.id,
                actor_user_id=user.id,
                before_text=before_text,
            )
    from app.services.index import reindex_personal_uploads

    record_audit_event(
        database,
        action="notes.import_md",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={
            "accepted": accepted,
            "conflicted": conflicted,
            "skipped": skipped,
            "source": "upload",
        },
    )
    await database.commit()
    try:
        await reindex_personal_uploads(database, user.id)
        await database.commit()
    except IndexerError:
        pass
    return {
        "accepted": accepted,
        "rejected": [],
        "skipped": skipped,
        "conflicted": conflicted,
        "warnings": warnings,
        "revision": None,
    }
