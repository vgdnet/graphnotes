from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
import difflib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.github import PersonalRepository, SharedRepository
from app.models.personal_upload import PersonalUpload
from app.models.proposal import Proposal, ProposalStatus
from app.models.shared_note import SharedNote
from app.models.user import User, UserRole, can_propose_to_rhizome
from app.services.audit import record_audit_event
from app.services.closed_corpus import closed_paths_for_user
from app.services.git_paths import PathError, normalize_git_path
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.grants import editorial_path_allowed, filter_editorial_paths
from app.services.index import IndexerError, drop_proposal_notes, index_proposal_notes, rebuild_shared, reindex_shared_store
from app.services.markdown import parse_markdown, unresolved_links
from app.services.notify import notify_new_proposal
from app.services.repository import SHARED_SINGLETON_ID, apply_snapshot, published_sha
from app.services.wikidiff2 import Wikidiff2Error, table_diff


class ProposalError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _paths(raw: str) -> list[str]:
    loaded = json.loads(raw)
    if not isinstance(loaded, list):
        return []
    return [str(item) for item in loaded]


def _github(error: GitHubAppError) -> ProposalError:
    status = {
        "not_found": 404,
        "stale": 409,
        "conflict": 409,
        "forbidden": 403,
        "unavailable": 503,
        "rate_limited": 503,
        "empty": 409,
    }.get(error.status, 502)
    if error.status == "conflict":
        return ProposalError(409, "this proposal conflicts with the current shared rhizome")
    if error.status == "stale":
        return ProposalError(409, "git changed, retry")
    return ProposalError(status, error.message)


async def _personal_layer_file(
    database: AsyncSession,
    user_id: uuid.UUID,
    path: str,
) -> str | None:
    row = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == user_id,
            PersonalUpload.path == path,
        )
    )
    if row is not None:
        return row.body
    return None


async def _shared_body(database: AsyncSession, path: str) -> str:
    row = await database.scalar(select(SharedNote).where(SharedNote.path == path))
    return row.body if row is not None else ""


async def _proposal_pair(
    database: AsyncSession, author_user_id: uuid.UUID, path: str
) -> tuple[str, str]:
    """Queue/offer pair from GraphNotes stores. No GitHub."""
    after = await _personal_layer_file(database, author_user_id, path)
    return await _shared_body(database, path), after or ""


async def _apply_shared_files(
    database: AsyncSession,
    *,
    user: User,
    files: dict[str, str],
) -> str:
    from app.services.ingest import _upsert_shared_note

    for path, text in files.items():
        parsed = parse_markdown(path, text)
        await _upsert_shared_note(
            database,
            path,
            text,
            parsed.content_hash,
            actor_user_id=user.id,
        )
    revision = await reindex_shared_store(database)
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is not None:
        shared.indexed_sha = revision
        shared.index_status = "current"
        shared.sync_status = "ready"
        shared.last_error = None
    return revision


def _is_editor(user: User) -> bool:
    return user.role in {UserRole.EDITOR.value, UserRole.ADMIN.value}


def _public(
    row: Proposal,
    author: User,
    *,
    added: list[str] | None = None,
    changed: list[str] | None = None,
    diffs: list[dict[str, object]] | None = None,
    paths: list[str] | None = None,
) -> dict[str, object]:
    return {
        "id": str(row.id),
        "status": row.status,
        "summary": row.summary,
        "paths": paths if paths is not None else _paths(row.scope_paths),
        "added": added or [],
        "changed": changed or [],
        "author": {
            "id": str(author.id),
            "username": author.username,
            "display_name": author.display_name,
        },
        "reason": row.reason,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "diff": diffs or [],
    }


def _summary(raw: str, paths: list[str]) -> str:
    cleaned = raw.strip()
    if len(cleaned) >= 3:
        return cleaned[:200]
    if len(paths) == 1:
        return paths[0][:200]
    return f"{len(paths)} notes"


async def create_proposal(
    database: AsyncSession,
    *,
    user: User,
    paths: list[str],
    summary: str,
    expected_sha: str | None,
    client: GitHubAppClient,
) -> dict[str, object]:
    del client  # leftover merge-out only; offer compares local stores
    if not can_propose_to_rhizome(user):
        raise ProposalError(403, "this account cannot propose to the shared rhizome")
    if len(paths) > settings.take_max_paths:
        raise ProposalError(400, "too many notes in one proposal")
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not published_sha(shared):
        raise ProposalError(409, "the shared rhizome is not connected")
    if personal is not None and expected_sha is not None and expected_sha != personal.observed_sha:
        raise ProposalError(409, "your git changed, retry")
    if (personal is None or not personal.observed_sha) and expected_sha is not None:
        raise ProposalError(409, "your git changed, retry")
    shared_ref = published_sha(shared)
    assert shared_ref is not None

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in paths:
        try:
            path = normalize_git_path(raw)
        except PathError as exc:
            raise ProposalError(400, str(exc)) from exc
        if path not in seen:
            seen.add(path)
            normalized.append(path)
    if not normalized:
        raise ProposalError(400, "choose notes to propose")
    closed = await closed_paths_for_user(database, user.id)
    if any(path in closed for path in normalized):
        raise ProposalError(403, "closed notes cannot be proposed")

    added: list[str] = []
    changed: list[str] = []
    files: dict[str, str] = {}
    shared_bodies = {
        item.path: item.body
        for item in (
            await database.scalars(select(SharedNote).where(SharedNote.path.in_(normalized)))
        ).all()
    }
    for path in normalized:
        text = await _personal_layer_file(database, user.id, path)
        if text is None:
            raise ProposalError(404, "note was not found")
        files[path] = text
        if path not in shared_bodies:
            added.append(path)
            continue
        if shared_bodies[path] != text:
            changed.append(path)
    if not added and not changed:
        raise ProposalError(400, "those notes already match the shared rhizome")
    to_commit = {path: files[path] for path in added + changed}
    label = _summary(summary, list(to_commit))

    proposal_id = uuid.uuid4()
    branch = f"gn-p-{proposal_id.hex[:16]}"
    digest = hashlib.sha1()
    for path, text in sorted(to_commit.items()):
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(text.encode("utf-8"))
    head = digest.hexdigest()

    row = Proposal(
        id=proposal_id,
        author_user_id=user.id,
        status=ProposalStatus.OPEN.value,
        summary=label,
        scope_paths=json.dumps(sorted(to_commit)),
        branch_name=branch,
        base_sha=shared_ref,
        head_sha=head,
    )
    database.add(row)
    await index_proposal_notes(
        database,
        proposal_id=proposal_id,
        owner_id=user.id,
        revision=head,
        files=to_commit,
    )
    record_audit_event(
        database,
        action="proposal.created",
        actor_user_id=user.id,
        subject_username=user.username,
        details={"proposal_id": str(proposal_id), "paths": sorted(to_commit)},
    )
    await database.commit()
    await database.refresh(row)
    await database.refresh(user)
    payload = _public(row, user, added=added, changed=changed)
    try:
        await notify_new_proposal(
            database,
            author=user,
            summary=label,
            proposal_id=str(proposal_id),
        )
        await database.commit()
    except Exception:
        await database.rollback()
    return payload


async def list_proposals(
    database: AsyncSession, user: User
) -> dict[str, object]:
    # Offer/queue path list is local rows. GitHub reconcile is leftover merge-out
    # on detail/approve, not GET /proposals (plugin marks queued offers here).
    query = select(Proposal).order_by(Proposal.created_at.desc())
    if not _is_editor(user):
        query = query.where(Proposal.author_user_id == user.id)
    rows = (await database.scalars(query)).all()
    authors = {
        item.id: item
        for item in (
            await database.scalars(select(User).where(User.id.in_({row.author_user_id for row in rows})))
        ).all()
    } if rows else {}
    items: list[dict[str, object]] = []
    for row in rows:
        author = authors.get(row.author_user_id)
        if author is None:
            continue
        visible = await filter_editorial_paths(database, user, _paths(row.scope_paths))
        if not visible:
            continue
        items.append(_public(row, author, paths=visible))
    return {"proposals": items}


async def proposal_for_viewer(
    database: AsyncSession, user: User, proposal_id: uuid.UUID
) -> Proposal:
    row = await database.get(Proposal, proposal_id)
    if row is None:
        raise ProposalError(404, "proposal was not found")
    if row.author_user_id != user.id and not _is_editor(user):
        raise ProposalError(404, "proposal was not found")
    return row


async def get_proposal(
    database: AsyncSession,
    user: User,
    proposal_id: uuid.UUID,
    client: GitHubAppClient,
) -> dict[str, object]:
    del client  # leftover merge-out; queue detail is store pair + wikidiff2
    row = await proposal_for_viewer(database, user, proposal_id)
    author = await database.get(User, row.author_user_id)
    if author is None:
        raise ProposalError(404, "proposal was not found")
    visible = await filter_editorial_paths(database, user, _paths(row.scope_paths))
    if not visible:
        raise ProposalError(404, "proposal was not found")
    added: list[str] = []
    changed: list[str] = []
    diffs: list[dict[str, object]] = []
    for path in visible:
        before, after = await _proposal_pair(database, row.author_user_id, path)
        if not before:
            added.append(path)
        elif before != after:
            changed.append(path)
        try:
            wiki = table_diff(before, after)
        except Wikidiff2Error as exc:
            raise ProposalError(503, exc.detail) from exc
        diffs.append(
            {
                "path": path,
                "diff": _diff(path, before, after),
                "body": after,
                "before": before,
                "html": wiki.html,
                "engine": wiki.engine,
                "engine_version": wiki.version,
                "rows": wiki.rows,
            }
        )
    return _public(row, author, added=added, changed=changed, diffs=diffs, paths=visible)


async def get_proposal_card(
    database: AsyncSession,
    user: User,
    proposal_id: uuid.UUID,
    path: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    try:
        normalized = normalize_git_path(path)
    except PathError as exc:
        raise ProposalError(400, str(exc)) from exc
    row = await proposal_for_viewer(database, user, proposal_id)
    if normalized not in _paths(row.scope_paths):
        raise ProposalError(404, "note was not found")
    if not await editorial_path_allowed(database, user, normalized):
        raise ProposalError(403, "editorial grant does not include this note")
    del client
    _before, text = await _proposal_pair(database, row.author_user_id, normalized)
    if not text:
        raise ProposalError(404, "note was not found")
    shared_rows = list((await database.scalars(select(SharedNote))).all())
    paths = {item.path for item in shared_rows}
    personal_paths = {
        item.path
        for item in (
            await database.scalars(
                select(PersonalUpload).where(PersonalUpload.user_id == row.author_user_id)
            )
        ).all()
    }
    paths.update(personal_paths)
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
        "closed": False,
        "source": text,
    }


async def get_proposal_work_file(
    database: AsyncSession,
    user: User,
    proposal_id: uuid.UUID,
    path: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    try:
        normalized = normalize_git_path(path)
    except PathError as exc:
        raise ProposalError(400, str(exc)) from exc
    row = await proposal_for_viewer(database, user, proposal_id)
    if normalized not in _paths(row.scope_paths):
        raise ProposalError(404, "note was not found")
    if not await editorial_path_allowed(database, user, normalized):
        raise ProposalError(403, "editorial grant does not include this note")
    del client
    before, after = await _proposal_pair(database, row.author_user_id, normalized)
    return {
        "path": normalized,
        "before": before,
        "body": after,
    }


async def resolve_proposal(
    database: AsyncSession,
    *,
    user: User,
    proposal_id: uuid.UUID,
    files: list[tuple[str, str]],
    reason: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    if not _is_editor(user):
        raise ProposalError(403, "editor access required")
    row = await database.get(Proposal, proposal_id)
    if row is None:
        raise ProposalError(404, "proposal was not found")
    if row.author_user_id == user.id:
        raise ProposalError(403, "you cannot decide on your own proposal")
    already = await _finish_if_already_accepted(database, row, user, client)
    if already is not None:
        return already
    if row.status not in {
        ProposalStatus.OPEN.value,
        ProposalStatus.CONFLICTED.value,
        ProposalStatus.FAILED.value,
        ProposalStatus.CHANGES_REQUESTED.value,
    }:
        raise ProposalError(409, "this proposal cannot be accepted now")
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not shared.observed_sha:
        raise ProposalError(409, "the shared rhizome is not connected")
    scope = set(_paths(row.scope_paths))
    to_commit: dict[str, str] = {}
    for raw_path, source in files:
        try:
            path = normalize_git_path(raw_path)
        except PathError as exc:
            raise ProposalError(400, str(exc)) from exc
        if path not in scope:
            raise ProposalError(400, "note is not in this proposal")
        if not await editorial_path_allowed(database, user, path):
            raise ProposalError(403, "editorial grant does not include this note")
        to_commit[path] = source
    if not to_commit:
        raise ProposalError(400, "choose notes to resolve")
    remaining = sorted(scope - set(to_commit))
    cleaned = reason.strip()[:255]
    return await _publish_paths(
        database, user, row, to_commit, remaining, cleaned, client
    )


async def decide(
    database: AsyncSession,
    *,
    user: User,
    proposal_id: uuid.UUID,
    action: str,
    reason: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    if not _is_editor(user):
        raise ProposalError(403, "editor access required")
    row = await database.get(Proposal, proposal_id)
    if row is None:
        raise ProposalError(404, "proposal was not found")
    if row.author_user_id == user.id:
        raise ProposalError(403, "you cannot decide on your own proposal")
    visible = await filter_editorial_paths(database, user, _paths(row.scope_paths))
    if set(visible) != set(_paths(row.scope_paths)):
        raise ProposalError(403, "editorial grant does not include every note in this proposal")
    cleaned = reason.strip()[:255]
    if action in {"reject", "request_changes", "rollback"} and not cleaned:
        raise ProposalError(400, "a reason is required")
    if action == "approve":
        return await _approve(database, user, row, cleaned, client)
    if action == "reject":
        return await _set_status(
            database, user, row, ProposalStatus.REJECTED.value, cleaned, "proposal.rejected"
        )
    if action == "request_changes":
        return await _set_status(
            database,
            user,
            row,
            ProposalStatus.CHANGES_REQUESTED.value,
            cleaned,
            "proposal.changes_requested",
        )
    if action == "rollback":
        return await _rollback(database, user, row, cleaned, client)
    raise ProposalError(400, "unknown decision")


async def reconcile_proposals(database: AsyncSession, client: GitHubAppClient) -> None:
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None:
        return
    rows = (
        await database.scalars(
            select(Proposal).where(
                Proposal.status.in_(
                    [
                        ProposalStatus.ACCEPTED_PENDING_MERGE.value,
                        ProposalStatus.MERGED_INDEXING.value,
                        ProposalStatus.FAILED.value,
                    ]
                )
            )
        )
    ).all()
    for row in rows:
        if row.status == ProposalStatus.ACCEPTED_PENDING_MERGE.value:
            try:
                merged = await client.merge_branch(
                    shared.owner,
                    shared.name,
                    base=shared.default_branch,
                    head=row.branch_name,
                    message=row.summary,
                )
                row.merged_sha = merged
                row.status = ProposalStatus.MERGED_INDEXING.value
            except GitHubAppError as exc:
                row.status = (
                    ProposalStatus.CONFLICTED.value
                    if exc.status == "conflict"
                    else ProposalStatus.FAILED.value
                )
                row.error = exc.message[:255]
                continue
        if row.merged_sha and shared.indexed_sha == row.merged_sha and shared.index_status == "current":
            row.status = ProposalStatus.PUBLISHED.value
            row.published_at = datetime.now(UTC)
            continue
        if row.merged_sha:
            try:
                snapshot = await client.get_repository(shared.owner, shared.name)
                apply_snapshot(shared, snapshot)
                await rebuild_shared(database, client)
                shared = await database.get(SharedRepository, SHARED_SINGLETON_ID) or shared
                if shared.indexed_sha == row.merged_sha:
                    row.status = ProposalStatus.PUBLISHED.value
                    row.published_at = datetime.now(UTC)
                    row.error = None
            except (GitHubAppError, IndexerError) as exc:
                row.status = ProposalStatus.FAILED.value
                row.error = str(getattr(exc, "detail", exc))[:255]
    await database.commit()


async def _viewer_payload(database: AsyncSession, row: Proposal, fallback: User) -> dict[str, object]:
    author = await database.get(User, row.author_user_id)
    return _public(row, author or fallback)


async def _finish_if_already_accepted(
    database: AsyncSession,
    row: Proposal,
    user: User,
    client: GitHubAppClient,
) -> dict[str, object] | None:
    del client
    if row.status == ProposalStatus.PUBLISHED.value:
        return await _viewer_payload(database, row, user)
    if row.status in {
        ProposalStatus.ACCEPTED_PENDING_MERGE.value,
        ProposalStatus.MERGED_INDEXING.value,
    }:
        return await _viewer_payload(database, row, user)
    return None


async def _publish_paths(
    database: AsyncSession,
    user: User,
    row: Proposal,
    to_commit: dict[str, str],
    remaining: list[str],
    reason: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    del client  # leftover merge-out; live resolve writes shared_notes
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not published_sha(shared):
        raise ProposalError(409, "the shared rhizome is not connected")
    from app.services.provenance import record_publication_events, _shared_edges, _shared_paths

    previous = published_sha(shared)
    assert previous is not None
    before_paths = await _shared_paths(database, previous)
    before_edges = await _shared_edges(database, previous, before_paths)
    try:
        merged = await _apply_shared_files(database, user=user, files=to_commit)
        row.error = None
        if remaining:
            row.scope_paths = json.dumps(remaining)
        else:
            row.scope_paths = json.dumps(sorted(to_commit))
            row.status = ProposalStatus.PUBLISHED.value
            row.published_at = datetime.now(UTC)
            row.reason = reason or None
            row.decided_by_user_id = user.id
            row.decided_at = datetime.now(UTC)
            row.previous_sha = previous
            row.merged_sha = merged
            await record_publication_events(
                database, row, before_paths=before_paths, before_edges=before_edges
            )
            await drop_proposal_notes(database, row.id)
    except IndexerError as exc:
        row.error = str(exc.detail)[:255]
        if not remaining:
            row.status = ProposalStatus.FAILED.value
        else:
            raise ProposalError(exc.status_code, exc.detail) from exc
    if remaining:
        remaining_files: dict[str, str] = {}
        for path in remaining:
            text = await _personal_layer_file(database, row.author_user_id, path)
            if text is not None:
                remaining_files[path] = text
        await index_proposal_notes(
            database,
            proposal_id=row.id,
            owner_id=row.author_user_id,
            revision=row.head_sha,
            files=remaining_files,
        )
    record_audit_event(
        database,
        action="proposal.resolved_file" if remaining else "proposal.approved",
        actor_user_id=user.id,
        target_user_id=row.author_user_id,
        subject_username=user.username,
        details={"proposal_id": str(row.id), "paths": sorted(to_commit), "remaining": remaining, "status": row.status},
    )
    await database.commit()
    await database.refresh(row)
    author = await database.get(User, row.author_user_id)
    return _public(row, author or user)


async def _approve(
    database: AsyncSession,
    user: User,
    row: Proposal,
    reason: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    already = await _finish_if_already_accepted(database, row, user, client)
    if already is not None:
        return already
    if row.status not in {
        ProposalStatus.OPEN.value,
        ProposalStatus.CONFLICTED.value,
        ProposalStatus.FAILED.value,
        ProposalStatus.CHANGES_REQUESTED.value,
    }:
        raise ProposalError(409, "this proposal cannot be accepted now")
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not shared.observed_sha:
        raise ProposalError(409, "the shared rhizome is not connected")
    row.status = ProposalStatus.ACCEPTED_PENDING_MERGE.value
    row.reason = reason or None
    row.decided_by_user_id = user.id
    row.decided_at = datetime.now(UTC)
    row.previous_sha = shared.observed_sha
    await database.commit()
    await database.refresh(row)
    from app.services.provenance import record_publication_events, snapshot_shared_revision

    before_paths, before_edges = await snapshot_shared_revision(
        client, shared.owner, shared.name, shared.observed_sha
    )
    try:
        merged = await client.merge_branch(
            shared.owner,
            shared.name,
            base=shared.default_branch,
            head=row.branch_name,
            message=row.summary,
        )
    except GitHubAppError as exc:
        row.status = (
            ProposalStatus.CONFLICTED.value if exc.status == "conflict" else ProposalStatus.FAILED.value
        )
        row.error = exc.message[:255]
        await database.commit()
        if exc.status == "conflict":
            raise ProposalError(409, "this proposal conflicts with the current shared rhizome") from exc
        raise _github(exc) from exc
    row.merged_sha = merged
    row.status = ProposalStatus.MERGED_INDEXING.value
    await database.commit()
    try:
        snapshot = await client.get_repository(shared.owner, shared.name)
        apply_snapshot(shared, snapshot)
        await rebuild_shared(database, client, actor_user_id=user.id)
        shared = await database.get(SharedRepository, SHARED_SINGLETON_ID) or shared
        if shared.indexed_sha == merged:
            row.status = ProposalStatus.PUBLISHED.value
            row.published_at = datetime.now(UTC)
            row.error = None
            await record_publication_events(
                database, row, before_paths=before_paths, before_edges=before_edges
            )
            await drop_proposal_notes(database, row.id)
        else:
            row.status = ProposalStatus.FAILED.value
            row.error = "index rebuild did not reach the merged revision"
    except (GitHubAppError, IndexerError) as exc:
        row.status = ProposalStatus.FAILED.value
        row.error = str(getattr(exc, "detail", exc))[:255]
    record_audit_event(
        database,
        action="proposal.approved",
        actor_user_id=user.id,
        target_user_id=row.author_user_id,
        subject_username=user.username,
        details={"proposal_id": str(row.id), "status": row.status},
    )
    await database.commit()
    await database.refresh(row)
    author = await database.get(User, row.author_user_id)
    return _public(row, author or user)


async def _rollback(
    database: AsyncSession,
    user: User,
    row: Proposal,
    reason: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    if row.status != ProposalStatus.PUBLISHED.value or not row.previous_sha:
        raise ProposalError(409, "only a published proposal can be rolled back")
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not shared.observed_sha:
        raise ProposalError(409, "the shared rhizome is not connected")
    if row.merged_sha and shared.observed_sha != row.merged_sha:
        raise ProposalError(409, "the shared rhizome changed after this proposal")
    try:
        restored = await client.restore_revision(
            shared.owner,
            shared.name,
            shared.default_branch,
            row.previous_sha,
            reason,
        )
        snapshot = await client.get_repository(shared.owner, shared.name)
        apply_snapshot(shared, snapshot)
        await rebuild_shared(database, client, actor_user_id=user.id)
    except GitHubAppError as exc:
        raise _github(exc) from exc
    except IndexerError as exc:
        raise ProposalError(exc.status_code, exc.detail) from exc
    row.status = ProposalStatus.REJECTED.value
    row.reason = reason
    row.error = None
    row.decided_by_user_id = user.id
    row.decided_at = datetime.now(UTC)
    record_audit_event(
        database,
        action="proposal.rolled_back",
        actor_user_id=user.id,
        target_user_id=row.author_user_id,
        subject_username=user.username,
        details={"proposal_id": str(row.id), "revision": restored},
    )
    await database.commit()
    await database.refresh(row)
    author = await database.get(User, row.author_user_id)
    return _public(row, author or user)


async def _set_status(
    database: AsyncSession,
    user: User,
    row: Proposal,
    status: str,
    reason: str,
    action: str,
) -> dict[str, object]:
    if row.status not in {
        ProposalStatus.OPEN.value,
        ProposalStatus.CONFLICTED.value,
        ProposalStatus.CHANGES_REQUESTED.value,
        ProposalStatus.FAILED.value,
    }:
        raise ProposalError(409, "this proposal cannot be changed now")
    row.status = status
    row.reason = reason
    row.decided_by_user_id = user.id
    row.decided_at = datetime.now(UTC)
    record_audit_event(
        database,
        action=action,
        actor_user_id=user.id,
        target_user_id=row.author_user_id,
        subject_username=user.username,
        details={"proposal_id": str(row.id)},
    )
    await database.commit()
    await database.refresh(row)
    author = await database.get(User, row.author_user_id)
    return _public(row, author or user)


async def _file(
    client: GitHubAppClient, owner: str, name: str, path: str, ref: str
) -> str | None:
    try:
        return await client.get_file(owner, name, path, ref)
    except GitHubAppError as exc:
        if exc.status == "not_found":
            return None
        raise _github(exc) from exc


def _diff(path: str, before: str, after: str) -> str:
    return "".join(
        difflib.unified_diff(
            before.splitlines(keepends=True),
            after.splitlines(keepends=True),
            fromfile=f"shared/{path}",
            tofile=f"proposal/{path}",
            n=3,
        )
    )


