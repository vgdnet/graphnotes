from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import SharedRepository
from app.models.graph import NoteIndex, NoteLayer, NoteLink
from app.models.proposal import Proposal
from app.models.rhizome_event import RhizomeEvent
from app.models.user import User
from app.services.git_paths import PathError, normalize_git_path
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.markdown import notes_lookup_map, parse_markdown, resolve_link_target
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


async def snapshot_shared_revision(
    client: GitHubAppClient,
    owner: str,
    name: str,
    revision: str | None,
) -> tuple[set[str], set[tuple[str, str]]]:
    """Read the published tree from Git. The derived index is wiped on rebuild."""
    if not revision:
        return set(), set()
    try:
        listed = set(await client.list_markdown_files(owner, name, revision))
    except GitHubAppError:
        return set(), set()
    lookup = notes_lookup_map(listed)
    edges: set[tuple[str, str]] = set()
    for path in listed:
        try:
            text = await client.get_file(owner, name, path, revision)
        except GitHubAppError:
            continue
        note = parse_markdown(path, text)
        for link in note.typed_links:
            target = resolve_link_target(link.target, lookup)
            if target:
                edges.add((path, target))
    return listed, edges


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


async def list_note_feed(database: AsyncSession, path: str) -> dict[str, object]:
    try:
        path = normalize_git_path(path)
    except PathError:
        path = path.strip()
    events = (
        await database.scalars(
            select(RhizomeEvent)
            .where(RhizomeEvent.path == path)
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
