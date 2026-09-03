from __future__ import annotations

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
from app.models.user import User, UserRole
from app.services.audit import record_audit_event
from app.services.git_paths import PathError, normalize_git_path
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.index import IndexerError, rebuild_shared
from app.services.repository import SHARED_SINGLETON_ID, apply_snapshot, published_sha


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
    client: GitHubAppClient,
    user_id: uuid.UUID,
    personal: PersonalRepository | None,
    path: str,
) -> str | None:
    if personal is not None and personal.observed_sha:
        try:
            return await client.get_file(
                personal.owner, personal.name, path, personal.observed_sha
            )
        except GitHubAppError as exc:
            if exc.status != "not_found":
                raise
    row = await database.scalar(
        select(PersonalUpload).where(
            PersonalUpload.user_id == user_id,
            PersonalUpload.path == path,
        )
    )
    return None if row is None else row.body


def _is_editor(user: User) -> bool:
    return user.role in {UserRole.EDITOR.value, UserRole.ADMIN.value}


def _public(
    row: Proposal,
    author: User,
    *,
    added: list[str] | None = None,
    changed: list[str] | None = None,
    diffs: list[dict[str, str]] | None = None,
) -> dict[str, object]:
    return {
        "id": str(row.id),
        "status": row.status,
        "summary": row.summary,
        "paths": _paths(row.scope_paths),
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
    if len(paths) > settings.take_max_paths:
        raise ProposalError(400, "too many notes in one proposal")
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
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

    added: list[str] = []
    changed: list[str] = []
    files: dict[str, str] = {}
    try:
        shared_listed = set(
            await client.list_markdown_files(shared.owner, shared.name, shared_ref)
        )
        for path in normalized:
            text = await _personal_layer_file(
                database, client, user.id, personal, path
            )
            if text is None:
                raise ProposalError(404, "note was not found")
            files[path] = text
            if path not in shared_listed:
                added.append(path)
                continue
            current = await client.get_file(shared.owner, shared.name, path, shared_ref)
            if current == text:
                continue
            changed.append(path)
    except GitHubAppError as exc:
        raise _github(exc) from exc
    if not added and not changed:
        raise ProposalError(400, "those notes already match the shared rhizome")
    to_commit = {path: files[path] for path in added + changed}
    label = _summary(summary, list(to_commit))

    proposal_id = uuid.uuid4()
    branch = f"gn-p-{proposal_id.hex[:16]}"
    try:
        await client.create_branch(shared.owner, shared.name, branch, shared_ref)
        head = await client.commit_markdown(
            shared.owner,
            shared.name,
            branch,
            to_commit,
            label,
            shared_ref,
        )
    except GitHubAppError as exc:
        raise _github(exc) from exc

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
    record_audit_event(
        database,
        action="proposal.created",
        actor_user_id=user.id,
        subject_username=user.username,
        details={"proposal_id": str(proposal_id), "paths": sorted(to_commit)},
    )
    await database.commit()
    await database.refresh(row)
    return _public(row, user, added=added, changed=changed)


async def list_proposals(
    database: AsyncSession, user: User, client: GitHubAppClient
) -> dict[str, object]:
    await reconcile_proposals(database, client)
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
    return {
        "proposals": [
            _public(row, authors[row.author_user_id])
            for row in rows
            if row.author_user_id in authors
        ]
    }


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
    await reconcile_proposals(database, client)
    row = await proposal_for_viewer(database, user, proposal_id)
    author = await database.get(User, row.author_user_id)
    if author is None:
        raise ProposalError(404, "proposal was not found")
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    added: list[str] = []
    changed: list[str] = []
    diffs: list[dict[str, str]] = []
    if shared is not None:
        for path in _paths(row.scope_paths):
            after = await _file(client, shared.owner, shared.name, path, row.head_sha)
            before = await _file(client, shared.owner, shared.name, path, row.base_sha)
            if before is None:
                added.append(path)
            elif before != after:
                changed.append(path)
            diffs.append({"path": path, "diff": _diff(path, before or "", after or "")})
    return _public(row, author, added=added, changed=changed, diffs=diffs)


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


async def _approve(
    database: AsyncSession,
    user: User,
    row: Proposal,
    reason: str,
    client: GitHubAppClient,
) -> dict[str, object]:
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
