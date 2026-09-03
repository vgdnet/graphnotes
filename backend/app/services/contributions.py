import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.graph import NoteIndex, NoteLink, NoteLayer, NoteTag, Tag
from app.models.github import PersonalRepository, SharedRepository
from app.models.personal_upload import PersonalUpload
from app.models.proposal import Proposal, ProposalStatus
from app.models.user import User, UserRole
from app.services.github import GitHubAppClient
from app.services.index import ensure_personal_current, ensure_shared_current
from app.services.markdown import (
    notes_lookup_map,
    parse_markdown,
    resolve_link_target,
)
from app.services.proposal import reconcile_proposals
from app.services.closed_corpus import closed_paths_for_user
from app.services.repository import SHARED_SINGLETON_ID, refresh_personal, refresh_shared


PROPOSED_STATUSES: set[str] = {
    ProposalStatus.OPEN.value,
    ProposalStatus.CONFLICTED.value,
    ProposalStatus.CHANGES_REQUESTED.value,
    ProposalStatus.ACCEPTED_PENDING_MERGE.value,
    ProposalStatus.MERGED_INDEXING.value,
}

REVIEW_ACTIONS: dict[str, str] = {
    "proposal.approved": "approved",
    "proposal.rejected": "rejected",
    "proposal.changes_requested": "returned",
    "proposal.rolled_back": "rolled_back",
}

REVIEW_COUNT_KEYS: dict[str, str] = {
    "approved": "accepted",
    "rejected": "rejected",
    "returned": "returned",
    "rolled_back": "rolled_back",
}


async def _note_tags(database: AsyncSession, note_ids: set) -> dict[object, list[str]]:
    if not note_ids:
        return {}
    rows = (
        await database.execute(
            select(NoteTag.note_id, Tag.name)
            .join(Tag, Tag.id == NoteTag.tag_id)
            .where(NoteTag.note_id.in_(note_ids))
        )
    ).all()
    result: dict[object, list[str]] = {}
    for note_id, name in rows:
        result.setdefault(note_id, []).append(name)
    return result


def _parse_scope_paths(scope_paths: str) -> set[str]:
    try:
        raw = json.loads(scope_paths)
        if isinstance(raw, list):
            return set(str(item) for item in raw)
    except json.JSONDecodeError:
        pass
    return set()


def _stats(notes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, int]:
    return {
        "notes": len(notes),
        "added": sum(1 for note in notes if note["state"] in {"personal", "proposed"}),
        "accepted": sum(1 for note in notes if note["state"] == "accepted"),
        "links": len(edges),
        "links_accepted": sum(1 for edge in edges if edge["state"] == "accepted"),
    }


def _empty_review() -> dict[str, object]:
    return {
        "accepted": 0,
        "rejected": 0,
        "returned": 0,
        "rolled_back": 0,
        "decisions": [],
    }


async def _links_among_paths(
    database: AsyncSession,
    paths: set[str],
    *,
    owner_user_id: UUID,
    personal_sha: str | None,
    shared_sha: str | None,
    uploads: list[PersonalUpload] | None = None,
) -> list[dict[str, str]]:
    if not paths:
        return []
    note_rows: list[NoteIndex] = []
    if personal_sha:
        note_rows.extend(
            (
                await database.scalars(
                    select(NoteIndex).where(
                        NoteIndex.layer == NoteLayer.PERSONAL.value,
                        NoteIndex.owner_user_id == owner_user_id,
                        NoteIndex.revision_sha == personal_sha,
                        NoteIndex.path.in_(paths),
                    )
                )
            ).all()
        )
    if shared_sha:
        note_rows.extend(
            (
                await database.scalars(
                    select(NoteIndex).where(
                        NoteIndex.layer == NoteLayer.SHARED.value,
                        NoteIndex.owner_user_id.is_(None),
                        NoteIndex.revision_sha == shared_sha,
                        NoteIndex.path.in_(paths),
                    )
                )
            ).all()
        )

    id_to_path = {note.id: note.path for note in note_rows}
    seen: set[tuple[str, str]] = set()
    links: list[dict[str, str]] = []
    if id_to_path:
        rows = (
            await database.scalars(
                select(NoteLink).where(NoteLink.source_id.in_(id_to_path))
            )
        ).all()
        for row in rows:
            if row.unresolved or row.target_id is None:
                continue
            source = id_to_path.get(row.source_id)
            target = id_to_path.get(row.target_id)
            if source is None or target is None or source not in paths or target not in paths:
                continue
            key = (source, target)
            if key in seen:
                continue
            seen.add(key)
            links.append({"source": source, "target": target, "type": row.link_type})

    if uploads:
        lookup = notes_lookup_map(paths)
        for item in uploads:
            if item.path not in paths:
                continue
            parsed = parse_markdown(item.path, item.body)
            for typed in parsed.typed_links:
                target = resolve_link_target(typed.target, lookup)
                if not target or target == item.path:
                    continue
                key = (item.path, target)
                if key in seen:
                    continue
                seen.add(key)
                links.append({"source": item.path, "target": target, "type": typed.kind})
    return links


async def _edges_for_notes(
    database: AsyncSession,
    notes: list[dict[str, object]],
    *,
    owner_user_id: UUID,
    personal_sha: str | None,
    shared_sha: str | None,
    uploads: list[PersonalUpload] | None,
) -> list[dict[str, object]]:
    path_set = {str(note["path"]) for note in notes}
    state_by_path = {str(note["path"]): str(note["state"]) for note in notes}
    raw = await _links_among_paths(
        database,
        path_set,
        owner_user_id=owner_user_id,
        personal_sha=personal_sha,
        shared_sha=shared_sha,
        uploads=uploads,
    )
    return [
        {
            "source": item["source"],
            "target": item["target"],
            "type": item.get("type", "wikilink"),
            "state": state_by_path.get(item["source"], "personal"),
            "unresolved": False,
        }
        for item in raw
    ]


async def _review_stats(
    database: AsyncSession,
    user: User,
    *,
    shared_sha: str | None,
) -> dict[str, object]:
    events = (
        await database.scalars(
            select(AuditEvent)
            .where(
                AuditEvent.actor_user_id == user.id,
                AuditEvent.action.in_(tuple(REVIEW_ACTIONS)),
            )
            .order_by(AuditEvent.created_at.desc())
        )
    ).all()
    payload = _empty_review()
    if not events:
        return payload

    proposal_ids: list[UUID] = []
    seen_ids: set[UUID] = set()
    parsed_events: list[tuple[str, UUID]] = []
    for event in events:
        action = REVIEW_ACTIONS[event.action]
        payload[REVIEW_COUNT_KEYS[action]] = int(payload[REVIEW_COUNT_KEYS[action]]) + 1
        raw_id = (event.details or {}).get("proposal_id")
        if not raw_id:
            continue
        try:
            proposal_id = UUID(str(raw_id))
        except ValueError:
            continue
        parsed_events.append((action, proposal_id))
        if proposal_id not in seen_ids:
            seen_ids.add(proposal_id)
            proposal_ids.append(proposal_id)

    proposals = (
        {
            row.id: row
            for row in (
                await database.scalars(select(Proposal).where(Proposal.id.in_(proposal_ids)))
            ).all()
        }
        if proposal_ids
        else {}
    )
    author_ids = {row.author_user_id for row in proposals.values()}
    uploads_by_author: dict[UUID, list[PersonalUpload]] = {}
    personals_by_author: dict[UUID, str | None] = {}
    if author_ids:
        upload_rows = (
            await database.scalars(
                select(PersonalUpload).where(PersonalUpload.user_id.in_(author_ids))
            )
        ).all()
        for row in upload_rows:
            uploads_by_author.setdefault(row.user_id, []).append(row)
        personal_rows = (
            await database.scalars(
                select(PersonalRepository).where(PersonalRepository.user_id.in_(author_ids))
            )
        ).all()
        for row in personal_rows:
            personals_by_author[row.user_id] = row.indexed_sha

    decisions: list[dict[str, object]] = []
    for action, proposal_id in parsed_events:
        row = proposals.get(proposal_id)
        if row is None:
            continue
        paths = sorted(_parse_scope_paths(row.scope_paths))
        links = [
            {"source": item["source"], "target": item["target"]}
            for item in await _links_among_paths(
                database,
                set(paths),
                owner_user_id=row.author_user_id,
                personal_sha=personals_by_author.get(row.author_user_id),
                shared_sha=shared_sha,
                uploads=uploads_by_author.get(row.author_user_id),
            )
        ]
        decisions.append(
            {
                "proposal_id": str(row.id),
                "action": action,
                "status": row.status,
                "summary": row.summary or "",
                "paths": paths,
                "links": links,
            }
        )
    payload["decisions"] = decisions
    return payload


async def get_contributions_me(
    database: AsyncSession,
    *,
    user: User,
    client: GitHubAppClient | None = None,
    refresh: bool = True,
) -> dict[str, object]:
    if refresh and client is not None:
        await refresh_shared(database, client)
        await refresh_personal(database, user.id, client)
        await ensure_shared_current(database, client)
        await ensure_personal_current(database, user.id, client)
        await reconcile_proposals(database, client)

    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    has_git = personal is not None and personal.indexed_sha is not None
    personal_sha = personal.indexed_sha if has_git else None
    shared_sha = shared.indexed_sha if shared is not None else None

    proposal_rows = (
        await database.scalars(
            select(Proposal).where(Proposal.author_user_id == user.id).order_by(Proposal.created_at.desc())
        )
    ).all()

    proposed_paths: set[str] = set()
    accepted_paths: set[str] = set()
    proposals_payload: list[dict[str, object]] = []
    for row in proposal_rows:
        paths = sorted(_parse_scope_paths(row.scope_paths))
        if row.status == ProposalStatus.PUBLISHED.value:
            accepted_paths |= set(paths)
        elif row.status in PROPOSED_STATUSES:
            proposed_paths |= set(paths)

        proposals_payload.append(
            {
                "id": str(row.id),
                "status": row.status,
                "summary": row.summary or "",
                "paths": paths,
            }
        )

    personal_notes: list[NoteIndex] = []
    notes: list[dict[str, object]] = []
    uploads: list[PersonalUpload] = []
    if has_git:
        assert personal is not None and personal.indexed_sha is not None
        personal_notes = list(
            (
                await database.scalars(
                    select(NoteIndex).where(
                        NoteIndex.layer == NoteLayer.PERSONAL.value,
                        NoteIndex.owner_user_id == user.id,
                        NoteIndex.revision_sha == personal.indexed_sha,
                    )
                )
            ).all()
        )
        tag_map = await _note_tags(database, {note.id for note in personal_notes})
        for note in personal_notes:
            if note.path in accepted_paths:
                state = "accepted"
            elif note.path in proposed_paths:
                state = "proposed"
            else:
                state = "personal"
            notes.append(
                {
                    "path": note.path,
                    "title": note.title,
                    "tags": tag_map.get(note.id, []),
                    "state": state,
                }
            )
    else:
        uploads = list(
            (
                await database.scalars(
                    select(PersonalUpload).where(PersonalUpload.user_id == user.id)
                )
            ).all()
        )
        for item in uploads:
            parsed = parse_markdown(item.path, item.body)
            if item.path in accepted_paths:
                state = "accepted"
            elif item.path in proposed_paths:
                state = "proposed"
            else:
                state = "personal"
            notes.append(
                {
                    "path": item.path,
                    "title": parsed.title,
                    "tags": list(parsed.tags),
                    "state": state,
                }
            )

    if accepted_paths and shared_sha:
        missing_accepted = accepted_paths - {str(note["path"]) for note in notes}
        if missing_accepted:
            shared_notes = (
                await database.scalars(
                    select(NoteIndex).where(
                        NoteIndex.layer == NoteLayer.SHARED.value,
                        NoteIndex.owner_user_id.is_(None),
                        NoteIndex.revision_sha == shared_sha,
                        NoteIndex.path.in_(missing_accepted),
                    )
                )
            ).all()
            shared_tag_map = await _note_tags(database, {note.id for note in shared_notes})
            for note in shared_notes:
                notes.append(
                    {
                        "path": note.path,
                        "title": note.title,
                        "tags": shared_tag_map.get(note.id, []),
                        "state": "accepted",
                    }
                )

    edges = await _edges_for_notes(
        database,
        notes,
        owner_user_id=user.id,
        personal_sha=personal_sha,
        shared_sha=shared_sha,
        uploads=uploads or None,
    )

    review = None
    if user.role in {UserRole.EDITOR.value, UserRole.ADMIN.value}:
        review = await _review_stats(database, user, shared_sha=shared_sha)

    return {
        "notes": notes,
        "edges": edges,
        "proposals": proposals_payload,
        "stats": _stats(notes, edges),
        "review": review,
    }


async def get_user_card(
    database: AsyncSession,
    *,
    target: User,
    viewer: User | None,
    client: GitHubAppClient | None = None,
) -> dict[str, object]:
    body = await get_contributions_me(
        database,
        user=target,
        client=client,
        refresh=viewer is not None and viewer.id == target.id,
    )
    accepted = [note for note in body["notes"] if note["state"] == "accepted"]
    is_self = viewer is not None and viewer.id == target.id
    stats = body["stats"] if is_self else {
        "notes": len(accepted),
        "added": 0,
        "accepted": len(accepted),
        "links": 0,
        "links_accepted": body["stats"]["links_accepted"],
    }
    closed_count = None
    if is_self:
        closed_count = len(await closed_paths_for_user(database, target.id))
    return {
        "user": {
            "id": target.id,
            "username": target.username,
            "display_name": target.display_name,
            "role": target.role,
            "is_author": target.is_author,
        },
        "self": is_self,
        "stats": stats,
        "notes": accepted if not is_self else [
            {"path": note["path"], "title": note["title"], "state": note["state"]}
            for note in body["notes"]
            if note["state"] != "personal" or is_self
        ],
        "review": body["review"] if is_self else None,
        "closed_count": closed_count,
    }


async def list_admin_contributions(database: AsyncSession) -> dict[str, object]:
    users = (
        await database.scalars(select(User).order_by(User.username, User.id))
    ).all()
    rows: list[dict[str, object]] = []
    for account in users:
        body = await get_contributions_me(database, user=account, refresh=False)
        rows.append(
            {
                "user": {
                    "id": account.id,
                    "username": account.username,
                    "display_name": account.display_name,
                    "role": account.role,
                },
                "stats": body["stats"],
                "review": body["review"],
                "notes": body["notes"],
                "links": body["edges"],
            }
        )
    return {"users": rows}
