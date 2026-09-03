import json
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph import NoteIndex, NoteLink, NoteLayer, NoteTag, Tag
from app.models.github import PersonalRepository, SharedRepository
from app.models.personal_upload import PersonalUpload
from app.models.proposal import Proposal, ProposalStatus
from app.models.user import User
from app.services.github import GitHubAppClient
from app.services.index import ensure_personal_current, ensure_shared_current
from app.services.markdown import parse_markdown
from app.services.proposal import reconcile_proposals
from app.services.repository import SHARED_SINGLETON_ID, refresh_personal, refresh_shared


PROPOSED_STATUSES: set[str] = {
    ProposalStatus.OPEN.value,
    ProposalStatus.CONFLICTED.value,
    ProposalStatus.CHANGES_REQUESTED.value,
    ProposalStatus.ACCEPTED_PENDING_MERGE.value,
    ProposalStatus.MERGED_INDEXING.value,
}


@dataclass(frozen=True)
class ContributionNoteRow:
    path: str
    title: str
    tags: list[str]
    state: str


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


async def get_contributions_me(
    database: AsyncSession,
    *,
    user: User,
    client: GitHubAppClient,
) -> dict[str, object]:
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

    # Proposals owned by this author.
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

    # Personal nodes (author's git projection, or unpublished uploads).
    personal_notes: list[NoteIndex] = []
    notes: list[dict[str, object]] = []
    notes_by_id: dict[object, dict[str, object]] = {}
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
            node = {
                "path": note.path,
                "title": note.title,
                "tags": tag_map.get(note.id, []),
                "state": state,
            }
            notes.append(node)
            notes_by_id[note.id] = node
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

    # Add accepted nodes that may not exist in the personal layer anymore.
    if accepted_paths and shared is not None and shared.indexed_sha is not None:
        missing_accepted = accepted_paths - {note["path"] for note in notes}
        if missing_accepted:
            shared_notes = (
                await database.scalars(
                    select(NoteIndex).where(
                        NoteIndex.layer == NoteLayer.SHARED.value,
                        NoteIndex.owner_user_id.is_(None),
                        NoteIndex.revision_sha == shared.indexed_sha,
                        NoteIndex.path.in_(missing_accepted),
                    )
                )
            ).all()
            shared_ids = {note.id for note in shared_notes}
            shared_tag_map = await _note_tags(database, shared_ids)
            for note in shared_notes:
                node = {
                    "path": note.path,
                    "title": note.title,
                    "tags": shared_tag_map.get(note.id, []),
                    "state": "accepted",
                }
                notes.append(node)
                notes_by_id[note.id] = node

    # Edges: minimal MVP implementation returns resolved links between notes
    # from the personal layer. Accepted contribution nodes may have no edges
    # if their data is missing in personal git.
    note_ids = {note["path"] for note in notes}
    personal_id_set = {note.id for note in personal_notes} & set(notes_by_id)
    edges: list[dict[str, object]] = []
    if personal_id_set:
        links = (
            await database.scalars(
                select(NoteLink).where(
                    or_(NoteLink.source_id.in_(personal_id_set), NoteLink.target_id.in_(personal_id_set))
                )
            )
        ).all()
        for link in links:
            if link.unresolved or link.target_id is None:
                continue
            source_node = notes_by_id.get(link.source_id)
            target_node = notes_by_id.get(link.target_id)
            if source_node is None or target_node is None:
                continue
            edges.append(
                {
                    "source": source_node["path"],
                    "target": target_node["path"],
                    "type": link.link_type,
                    "state": source_node["state"],
                    "unresolved": False,
                }
            )

    return {"notes": notes, "edges": edges, "proposals": proposals_payload}

