from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.github import PersonalRepository, SharedRepository
from app.models.user import User
from app.services.archive import ArchiveError, read_markdown_bytes, read_zip_markdown
from app.services.audit import record_audit_event
from app.services.git_paths import PathError, normalize_git_path
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.markdown import parse_markdown, unresolved_links
from app.services.repository import SHARED_SINGLETON_ID, apply_error, apply_snapshot


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


async def _shared(database: AsyncSession) -> SharedRepository:
    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None:
        raise IngestError(409, "the shared rhizome is not connected")
    return row


async def _personal(database: AsyncSession, user_id) -> PersonalRepository:
    row = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user_id)
    )
    if row is None:
        raise IngestError(409, "connect your git first")
    return row


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
    row = await _personal(database, user.id)
    if not row.observed_sha:
        return {"notes": [], "revision": None, "updated_at": row.observed_at}
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
    row = await _personal(database, user.id)
    if not row.observed_sha:
        raise IngestError(404, "note was not found")
    try:
        text = await client.get_file(row.owner, row.name, normalized, row.observed_sha)
        paths = set(await client.list_markdown_files(row.owner, row.name, row.observed_sha))
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
        "warnings": list(parsed.warnings),
        "body": parsed.body,
        "content_hash": parsed.content_hash,
    }


async def take_from_shared(
    database: AsyncSession,
    *,
    user: User,
    paths: list[str],
    expected_sha: str | None,
    client: GitHubAppClient,
) -> dict[str, object]:
    if len(paths) > settings.take_max_paths:
        raise IngestError(400, "too many notes in one take")
    shared = await _shared(database)
    personal = await _personal(database, user.id)
    if not shared.observed_sha:
        raise IngestError(409, "the shared rhizome has no notes yet")

    normalized_paths: list[str] = []
    rejected: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in paths:
        try:
            path = normalize_git_path(raw)
        except PathError as exc:
            rejected.append({"path": raw, "reason": str(exc)})
            continue
        if path in seen:
            continue
        seen.add(path)
        normalized_paths.append(path)

    try:
        shared_files = set(
            await client.list_markdown_files(shared.owner, shared.name, shared.observed_sha)
        )
    except GitHubAppError as exc:
        apply_error(shared, exc)
        await database.commit()
        raise _github_to_ingest(exc) from exc

    accepted: list[str] = []
    skipped: list[str] = []
    conflicted: list[str] = []
    warnings: list[str] = []
    to_commit: dict[str, str] = {}

    for path in normalized_paths:
        if path not in shared_files:
            rejected.append({"path": path, "reason": "note is not in the shared rhizome"})
            continue
        try:
            shared_text = await client.get_file(
                shared.owner, shared.name, path, shared.observed_sha
            )
            existing = await _existing_file(client, personal, path)
        except GitHubAppError as exc:
            if exc.status in {"forbidden", "rate_limited", "unavailable", "stale"}:
                apply_error(personal, exc)
                await database.commit()
                raise _github_to_ingest(exc) from exc
            rejected.append({"path": path, "reason": exc.message})
            continue
        parsed = parse_markdown(path, shared_text)
        warnings.extend(f"{path}: {item}" for item in parsed.warnings)
        if existing is None:
            accepted.append(path)
            to_commit[path] = shared_text
        elif existing == shared_text:
            skipped.append(path)
        else:
            conflicted.append(path)

    revision = personal.observed_sha
    if to_commit:
        try:
            revision = await client.commit_markdown(
                personal.owner,
                personal.name,
                personal.default_branch,
                to_commit,
                "Take notes from the shared rhizome",
                expected_sha,
            )
        except GitHubAppError as exc:
            apply_error(personal, exc)
            await database.commit()
            raise _github_to_ingest(exc) from exc
        personal.observed_sha = revision
        personal.observed_at = datetime.now(UTC)
        personal.sync_status = "ready"
        personal.last_error = None
        record_audit_event(
            database,
            action="notes.take_from_shared",
            actor_user_id=user.id,
            target_user_id=user.id,
            subject_username=user.username,
            details={
                "accepted": accepted,
                "conflicted": conflicted,
                "skipped": skipped,
                "revision": revision,
            },
        )
        await database.commit()
        await database.refresh(personal)
        try:
            from app.services.index import IndexerError, rebuild_personal

            await rebuild_personal(database, user.id, client, actor_user_id=user.id)
        except IndexerError:
            pass

    return {
        "accepted": accepted,
        "rejected": rejected,
        "skipped": skipped,
        "conflicted": conflicted,
        "warnings": warnings,
        "revision": revision,
    }


async def import_markdown(
    database: AsyncSession,
    *,
    user: User,
    filename: str,
    data: bytes,
    expected_sha: str | None,
    client: GitHubAppClient,
) -> dict[str, object]:
    personal = await _personal(database, user.id)
    try:
        if filename.lower().endswith(".zip") or data.startswith(b"PK"):
            incoming = read_zip_markdown(data)
        elif filename.lower().endswith(".md"):
            incoming = read_markdown_bytes(data, filename)
        else:
            raise IngestError(400, "upload a Markdown file or a ZIP archive")
    except (ArchiveError, PathError) as exc:
        raise IngestError(400, str(exc)) from exc

    accepted: list[str] = []
    skipped: list[str] = []
    conflicted: list[str] = []
    rejected: list[dict[str, str]] = []
    warnings: list[str] = []
    to_commit: dict[str, str] = {}

    for path, text in incoming:
        parsed = parse_markdown(path, text)
        warnings.extend(f"{path}: {item}" for item in parsed.warnings)
        try:
            existing = await _existing_file(client, personal, path)
        except GitHubAppError as exc:
            apply_error(personal, exc)
            await database.commit()
            raise _github_to_ingest(exc) from exc
        if existing is None:
            accepted.append(path)
            to_commit[path] = text
        elif existing == text:
            skipped.append(path)
        else:
            conflicted.append(path)

    revision = personal.observed_sha
    if to_commit:
        try:
            revision = await client.commit_markdown(
                personal.owner,
                personal.name,
                personal.default_branch,
                to_commit,
                "Import Markdown into personal git",
                expected_sha,
            )
        except GitHubAppError as exc:
            apply_error(personal, exc)
            await database.commit()
            raise _github_to_ingest(exc) from exc
        personal.observed_sha = revision
        personal.observed_at = datetime.now(UTC)
        personal.sync_status = "ready"
        personal.last_error = None
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
                "revision": revision,
            },
        )
        await database.commit()
        await database.refresh(personal)
        try:
            from app.services.index import IndexerError, rebuild_personal

            await rebuild_personal(database, user.id, client, actor_user_id=user.id)
        except IndexerError:
            pass

    return {
        "accepted": accepted,
        "rejected": rejected,
        "skipped": skipped,
        "conflicted": conflicted,
        "warnings": warnings,
        "revision": revision,
    }


async def _existing_file(
    client: GitHubAppClient,
    personal: PersonalRepository,
    path: str,
) -> str | None:
    if not personal.observed_sha:
        return None
    try:
        return await client.get_file(
            personal.owner, personal.name, path, personal.observed_sha
        )
    except GitHubAppError as exc:
        if exc.status == "not_found":
            return None
        raise


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
