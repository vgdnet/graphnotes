import difflib
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card_revision import CARD_REVISION_LIMIT, CardRevision
from app.models.github import SharedRepository
from app.models.graph import NoteIndex, NoteLayer, NoteLink
from app.models.proposal import Proposal
from app.models.rhizome_event import RhizomeEvent
from app.models.user import User
from app.services.git_paths import PathError, normalize_git_path
from app.services.markdown import parse_markdown
from app.services.proposal import _paths
from app.services.repository import SHARED_SINGLETON_ID


async def _shared_paths(database: AsyncSession, revision: str | None) -> set[str]:
    if not revision:
        return set()
    rows = (
        await database.scalars(
            select(NoteIndex.path).where(
                NoteIndex.layer == NoteLayer.SHARED.value,
                NoteIndex.owner_user_id.is_(None),
                NoteIndex.revision_sha == revision,
            )
        )
    ).all()
    return set(rows)


async def _shared_edges(
    database: AsyncSession,
    revision: str | None,
    paths: set[str],
) -> set[tuple[str, str]]:
    if not revision or not paths:
        return set()
    notes = (
        await database.scalars(
            select(NoteIndex).where(
                NoteIndex.layer == NoteLayer.SHARED.value,
                NoteIndex.owner_user_id.is_(None),
                NoteIndex.revision_sha == revision,
                NoteIndex.path.in_(paths),
            )
        )
    ).all()
    by_id = {note.id: note.path for note in notes}
    if not by_id:
        return set()
    links = (
        await database.scalars(select(NoteLink).where(NoteLink.source_id.in_(by_id)))
    ).all()
    edges: set[tuple[str, str]] = set()
    for link in links:
        source = by_id.get(link.source_id)
        target = by_id.get(link.target_id) if link.target_id else None
        if source and target:
            edges.add((source, target))
    return edges


async def record_publication_events(
    database: AsyncSession,
    row: Proposal,
    *,
    before_paths: set[str],
    before_edges: set[tuple[str, str]],
) -> None:
    paths = set(_paths(row.scope_paths))
    if not paths:
        return
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    current_rev = shared.indexed_sha if shared is not None else None
    after_paths = await _shared_paths(database, current_rev)
    after_edges = await _shared_edges(database, current_rev, paths | before_paths | after_paths)
    for path in sorted(paths):
        database.add(
            RhizomeEvent(
                path=path,
                kind="edited" if path in before_paths else "created",
                actor_user_id=row.author_user_id,
                proposal_id=row.id,
            )
        )
    for source, target in sorted(after_edges - before_edges):
        for card, other in ((source, target), (target, source)):
            database.add(
                RhizomeEvent(
                    path=card,
                    kind="linked",
                    actor_user_id=row.author_user_id,
                    proposal_id=row.id,
                    other_path=other,
                )
            )
    for source, target in sorted(before_edges - after_edges):
        for card, other in ((source, target), (target, source)):
            database.add(
                RhizomeEvent(
                    path=card,
                    kind="unlinked",
                    actor_user_id=row.author_user_id,
                    proposal_id=row.id,
                    other_path=other,
                )
            )


def card_revision_diff(path: str, before_text: str, after_text: str) -> str:
    return "".join(
        difflib.unified_diff(
            before_text.splitlines(keepends=True),
            after_text.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
            n=3,
        )
    )


def _owner_clause(owner_id: UUID | None):
    if owner_id is not None:
        return CardRevision.owner_user_id == owner_id
    return CardRevision.owner_user_id.is_(None)


async def record_card_revision(
    database: AsyncSession,
    *,
    path: str,
    source: str,
    owner_user_id: UUID | None,
    actor_user_id: UUID | None,
    before_text: str | None = None,
) -> None:
    """Keep the last CARD_REVISION_LIMIT snapshots. Skip unchanged bytes."""
    if before_text is not None and before_text == source:
        return
    try:
        path = normalize_git_path(path)
    except PathError:
        path = path.strip()
    digest = parse_markdown(path, source).content_hash
    latest = await database.scalar(
        select(CardRevision)
        .where(CardRevision.path == path, _owner_clause(owner_user_id))
        .order_by(CardRevision.n.desc())
        .limit(1)
    )
    if latest is not None and latest.content_hash == digest:
        return
    next_n = (latest.n + 1) if latest is not None else 1
    database.add(
        CardRevision(
            path=path,
            owner_user_id=owner_user_id,
            actor_user_id=actor_user_id,
            n=next_n,
            content_hash=digest,
            source=source,
        )
    )
    await database.flush()
    kept = list(
        (
            await database.scalars(
                select(CardRevision.id)
                .where(CardRevision.path == path, _owner_clause(owner_user_id))
                .order_by(CardRevision.n.desc())
            )
        ).all()
    )
    extra = kept[CARD_REVISION_LIMIT:]
    if extra:
        await database.execute(delete(CardRevision).where(CardRevision.id.in_(extra)))


async def list_card_revisions(
    database: AsyncSession,
    path: str,
    *,
    owner_id: UUID | None = None,
) -> dict[str, object]:
    try:
        path = normalize_git_path(path)
    except PathError:
        path = path.strip()
    rows = list(
        (
            await database.scalars(
                select(CardRevision)
                .where(CardRevision.path == path, _owner_clause(owner_id))
                .order_by(CardRevision.n.desc())
                .limit(CARD_REVISION_LIMIT)
            )
        ).all()
    )
    actor_ids = {row.actor_user_id for row in rows if row.actor_user_id}
    users: dict[UUID, User] = {}
    if actor_ids:
        for user in (await database.scalars(select(User).where(User.id.in_(actor_ids)))).all():
            users[user.id] = user
    chronological = list(reversed(rows))
    previous = ""
    change_by_id: dict[UUID, str] = {}
    first_id = chronological[0].id if chronological else None
    for row in chronological:
        change_by_id[row.id] = card_revision_diff(path, previous, row.source)
        previous = row.source
    payload = []
    for row in rows:
        actor = users.get(row.actor_user_id) if row.actor_user_id else None
        payload.append(
            {
                "id": str(row.id),
                "n": row.n,
                "kind": "created" if row.id == first_id else "edited",
                "created_at": row.created_at,
                "content_hash": row.content_hash,
                "change": change_by_id[row.id],
                "actor": (
                    {
                        "id": str(actor.id),
                        "username": actor.username,
                        "display_name": actor.display_name,
                    }
                    if actor is not None
                    else None
                ),
            }
        )
    return {"path": path, "revisions": payload}


async def record_personal_edit_events(
    database: AsyncSession,
    *,
    user: User,
    path: str,
    before_text: str,
    after_text: str,
) -> None:
    """Card history for a personal save. Events stay body-less; snapshots go to revisions."""
    await record_card_revision(
        database,
        path=path,
        source=after_text,
        owner_user_id=user.id,
        actor_user_id=user.id,
        before_text=before_text,
    )
    before = parse_markdown(path, before_text)
    after = parse_markdown(path, after_text)
    database.add(
        RhizomeEvent(
            path=path,
            kind="edited",
            actor_user_id=user.id,
            owner_user_id=user.id,
        )
    )
    before_links = set(before.links)
    after_links = set(after.links)
    for target in sorted(after_links - before_links):
        database.add(
            RhizomeEvent(
                path=path,
                kind="linked",
                actor_user_id=user.id,
                owner_user_id=user.id,
                other_path=target[:180],
            )
        )
    for target in sorted(before_links - after_links):
        database.add(
            RhizomeEvent(
                path=path,
                kind="unlinked",
                actor_user_id=user.id,
                owner_user_id=user.id,
                other_path=target[:180],
            )
        )


async def list_note_feed(
    database: AsyncSession,
    path: str,
    *,
    owner_id: UUID | None = None,
) -> dict[str, object]:
    try:
        path = normalize_git_path(path)
    except PathError:
        path = path.strip()
    owner_clause = (
        RhizomeEvent.owner_user_id == owner_id
        if owner_id is not None
        else RhizomeEvent.owner_user_id.is_(None)
    )
    events = (
        await database.scalars(
            select(RhizomeEvent)
            .where(RhizomeEvent.path == path, owner_clause)
            .order_by(RhizomeEvent.created_at.asc())
        )
    ).all()
    actor_ids = {event.actor_user_id for event in events if event.actor_user_id}
    users = {}
    if actor_ids:
        for user in (
            await database.scalars(select(User).where(User.id.in_(actor_ids)))
        ).all():
            users[user.id] = user
    payload = []
    for event in events:
        actor = users.get(event.actor_user_id) if event.actor_user_id else None
        payload.append(
            {
                "id": str(event.id),
                "kind": event.kind,
                "path": event.path,
                "other_path": event.other_path,
                "proposal_id": str(event.proposal_id) if event.proposal_id else None,
                "created_at": event.created_at,
                "actor": (
                    {
                        "id": str(actor.id),
                        "username": actor.username,
                        "display_name": actor.display_name,
                    }
                    if actor is not None
                    else None
                ),
            }
        )
    return {"path": path, "events": payload}
