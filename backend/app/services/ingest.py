from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository, SharedRepository
from app.models.personal_upload import PersonalUpload, UploadEvent
from app.models.user import User
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
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.index import IndexerError, ensure_personal_current, ensure_shared_current
from app.services.markdown import parse_markdown, unresolved_links
from app.services.repository import (
    SHARED_SINGLETON_ID,
    apply_error,
    apply_snapshot,
    refresh_personal,
    refresh_shared,
)


class IngestError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _http_status(error: GitHubAppError) -> int:
    return {
        "not_found": 404,
        "stale": 409,
        "forbidden": 403,
        "unavailable": 503,
        "rate_limited": 503,
        "empty": 409,
    }.get(error.status, 502)


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
    return {
        "events": [
            {
                "path": row.path,
                "content_hash": row.content_hash,
                "created_at": row.created_at,
            }
            for row in rows
        ]
    }


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


def _github_to_ingest(error: GitHubAppError) -> IngestError:
    return IngestError(_http_status(error), error.message)


async def list_shared_notes(
    database: AsyncSession,
    client: GitHubAppClient,
) -> dict[str, object]:
    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None or not row.observed_sha:
        return {"notes": [], "revision": None, "updated_at": None}
    try:
        notes = await _project_repo(client, row.owner, row.name, row.observed_sha)
        snapshot = await client.get_repository(row.owner, row.name)
        apply_snapshot(row, snapshot)
    except GitHubAppError as exc:
        apply_error(row, exc)
        await database.commit()
        raise _github_to_ingest(exc) from exc
    await database.commit()
    return {
        "notes": notes,
        "revision": row.observed_sha,
        "updated_at": row.observed_at,
    }


async def list_personal_notes(
    database: AsyncSession,
    user: User,
    client: GitHubAppClient,
) -> dict[str, object]:
    row = await _personal_or_none(database, user.id)
    if row is None or not row.observed_sha:
        uploads = await _uploads_for(database, user.id)
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
            "revision": None,
            "updated_at": latest,
        }
    try:
        notes = await _project_repo(client, row.owner, row.name, row.observed_sha)
        snapshot = await client.get_repository(row.owner, row.name)
        apply_snapshot(row, snapshot)
    except GitHubAppError as exc:
        apply_error(row, exc)
        await database.commit()
        raise _github_to_ingest(exc) from exc
    await database.commit()
    closed = await closed_paths_for_user(database, user.id)
    for note in notes:
        note["closed"] = note.get("path") in closed
    return {
        "notes": notes,
        "revision": row.observed_sha,
        "updated_at": row.observed_at,
    }


async def get_personal_note(
    database: AsyncSession,
    user: User,
    path: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    try:
        normalized = normalize_git_path(path)
    except PathError as exc:
        raise IngestError(400, str(exc)) from exc
    row = await _personal_or_none(database, user.id)
    if row is not None:
        await refresh_personal(database, user.id, client)
        try:
            await ensure_personal_current(database, user.id, client)
        except IndexerError:
            pass
        row = await _personal_or_none(database, user.id)
    if row is None or not row.observed_sha:
        upload = await database.scalar(
            select(PersonalUpload).where(
                PersonalUpload.user_id == user.id,
                PersonalUpload.path == normalized,
            )
        )
        if upload is None:
            raise IngestError(404, "note was not found")
        available = {item.path for item in await _uploads_for(database, user.id)}
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
            "closed": normalized in await closed_paths_for_user(database, user.id),
        }
    try:
        paths = set(await client.list_markdown_files(row.owner, row.name, row.observed_sha))
    except GitHubAppError as exc:
        raise _github_to_ingest(exc) from exc
    if normalized not in paths:
        raise IngestError(404, "note was not found")
    try:
        text = await client.get_file(row.owner, row.name, normalized, row.observed_sha)
    except GitHubAppError as exc:
        raise _github_to_ingest(exc) from exc
    parsed = parse_markdown(normalized, text)
    return {
        "path": normalized,
        "title": parsed.title,
        "tags": list(parsed.tags),
        "aliases": list(parsed.aliases),
        "links": list(parsed.links),
        "unresolved_links": list(unresolved_links(parsed.links, paths)),
        "locked_links": [],
        "warnings": list(parsed.warnings),
        "body": parsed.body,
        "content_hash": parsed.content_hash,
        "locked": False,
        "closed": normalized in await closed_paths_for_user(database, user.id),
    }


async def get_shared_note(
    database: AsyncSession,
    path: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    try:
        normalized = normalize_git_path(path)
    except PathError as exc:
        raise IngestError(400, str(exc)) from exc
    await refresh_shared(database, client)
    try:
        await ensure_shared_current(database, client)
    except IndexerError:
        pass
    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None or not row.observed_sha:
        if await is_globally_closed(database, normalized):
            return lock_stub(normalized)
        raise IngestError(404, "note was not found")
    try:
        paths = set(await client.list_markdown_files(row.owner, row.name, row.observed_sha))
    except GitHubAppError as exc:
        raise _github_to_ingest(exc) from exc
    if normalized not in paths:
        if await is_globally_closed(database, normalized):
            return lock_stub(normalized)
        raise IngestError(404, "note was not found")
    try:
        text = await client.get_file(row.owner, row.name, normalized, row.observed_sha)
    except GitHubAppError as exc:
        raise _github_to_ingest(exc) from exc
    parsed = parse_markdown(normalized, text)
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
    personal = await _personal_or_none(database, user.id)
    if personal is not None:
        raise IngestError(409, "disconnect your git before uploading files")
    try:
        if filename.lower().endswith(".zip") or data.startswith(b"PK"):
            incoming = read_zip_markdown(data)
        elif filename.lower().endswith(".md"):
            incoming = read_markdown_bytes(data, filename)
        else:
            raise IngestError(400, "upload a Markdown file or a ZIP archive")
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
        elif current.body == text:
            skipped.append(path)
        else:
            current.body = text
            current.content_hash = parsed.content_hash
            accepted.append(path)
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
    return {
        "accepted": accepted,
        "rejected": [],
        "skipped": skipped,
        "conflicted": conflicted,
        "warnings": warnings,
        "revision": None,
    }


async def _project_repo(
    client: GitHubAppClient,
    owner: str,
    name: str,
    revision: str,
) -> list[dict[str, object]]:
    paths = await client.list_markdown_files(owner, name, revision)
    available = set(paths)
    notes: list[dict[str, object]] = []
    for path in sorted(paths):
        text = await client.get_file(owner, name, path, revision)
        parsed = parse_markdown(path, text)
        notes.append(
            {
                "path": path,
                "title": parsed.title,
                "tags": list(parsed.tags),
                "aliases": list(parsed.aliases),
                "links": list(parsed.links),
                "unresolved_links": list(unresolved_links(parsed.links, available)),
                "warnings": list(parsed.warnings),
            }
        )
    return notes
