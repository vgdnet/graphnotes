from __future__ import annotations

from datetime import UTC, datetime
import uuid

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.github import PersonalRepository, SharedRepository
from app.models.graph import NoteIndex, NoteLayer, NoteLink, NoteTag, SyncJob, SyncJobStatus, Tag
from app.services.audit import record_audit_event
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.markdown import (
    ParsedLink,
    ParsedNote,
    notes_lookup_map,
    parse_markdown,
    resolve_link_target,
)
from app.services.repository import SHARED_SINGLETON_ID


class IndexerError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def index_status_label(observed_sha: str | None, indexed_sha: str | None, index_status: str) -> str:
    if not observed_sha:
        return "empty"
    if index_status == "error":
        return "error"
    if indexed_sha == observed_sha:
        return "current"
    return "updating"


def _index_key(layer: str, owner_id: uuid.UUID | None, proposal_id: uuid.UUID | None, revision: str, path: str) -> str:
    owner = str(owner_id) if owner_id else "shared"
    proposal = str(proposal_id) if proposal_id else "-"
    return f"{layer}:{owner}:{proposal}:{revision}:{path}"


def _slug(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    if name.lower().endswith(".md"):
        name = name[:-3]
    return name[:180] or "note"


async def rebuild_shared(
    database: AsyncSession,
    client: GitHubAppClient,
    *,
    actor_user_id: uuid.UUID | None = None,
    paths: set[str] | None = None,
) -> SyncJob:
    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None or not row.observed_sha:
        raise IndexerError(409, "the shared rhizome is not connected")
    return await _rebuild(
        database,
        client,
        layer=NoteLayer.SHARED.value,
        owner_id=None,
        owner=row.owner,
        name=row.name,
        revision=row.observed_sha,
        binding=row,
        actor_user_id=actor_user_id,
        paths=paths,
    )


async def rebuild_personal(
    database: AsyncSession,
    user_id: uuid.UUID,
    client: GitHubAppClient,
    *,
    actor_user_id: uuid.UUID | None = None,
    paths: set[str] | None = None,
) -> SyncJob:
    row = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user_id)
    )
    if row is None or not row.observed_sha:
        raise IndexerError(409, "connect your git first")
    return await _rebuild(
        database,
        client,
        layer=NoteLayer.PERSONAL.value,
        owner_id=user_id,
        owner=row.owner,
        name=row.name,
        revision=row.observed_sha,
        binding=row,
        actor_user_id=actor_user_id or user_id,
        paths=paths,
    )


async def ensure_shared_current(database: AsyncSession, client: GitHubAppClient) -> None:
    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None or not row.observed_sha:
        return
    if row.indexed_sha == row.observed_sha and row.index_status != "error":
        return
    await rebuild_shared(database, client)


async def ensure_personal_current(
    database: AsyncSession,
    user_id: uuid.UUID,
    client: GitHubAppClient,
) -> None:
    row = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user_id)
    )
    if row is None or not row.observed_sha:
        return
    if row.indexed_sha == row.observed_sha and row.index_status != "error":
        return
    await rebuild_personal(database, user_id, client)


async def _rebuild(
    database: AsyncSession,
    client: GitHubAppClient,
    *,
    layer: str,
    owner_id: uuid.UUID | None,
    owner: str,
    name: str,
    revision: str,
    binding: SharedRepository | PersonalRepository,
    actor_user_id: uuid.UUID | None,
    paths: set[str] | None,
) -> SyncJob:
    running = await database.scalar(
        select(SyncJob).where(
            SyncJob.layer == layer,
            SyncJob.owner_user_id == owner_id,
            SyncJob.status == SyncJobStatus.RUNNING.value,
        )
    )
    if running is not None:
        raise IndexerError(409, "index rebuild is already running")

    job = SyncJob(
        layer=layer,
        owner_user_id=owner_id,
        revision_sha=revision,
        status=SyncJobStatus.RUNNING.value,
        started_at=datetime.now(UTC),
    )
    database.add(job)
    binding.index_status = "updating"
    await database.flush()

    try:
        listed = await client.list_markdown_files(owner, name, revision)
        if len(listed) > settings.index_max_notes:
            raise IndexerError(400, "too many notes to index")
        listed_set = set(listed)
        existing = (
            await database.scalars(
                select(NoteIndex).where(
                    NoteIndex.layer == layer,
                    NoteIndex.owner_user_id == owner_id,
                )
            )
        ).all()
        if paths is None:
            fetch_paths = listed_set
        else:
            existing_paths = {note.path for note in existing}
            fetch_paths = (listed_set & paths) | (listed_set - existing_paths)
        parsed: dict[str, ParsedNote] = {}
        for path in sorted(fetch_paths):
            text = await client.get_file(owner, name, path, revision)
            parsed[path] = parse_markdown(path, text)
        unchanged = [note for note in existing if note.path in listed_set and note.path not in fetch_paths]
        parsed.update(await _parsed_from_existing(database, unchanged))
        await _delete_layer(database, layer, owner_id)
        lookup = notes_lookup_map(set(parsed))
        records: dict[str, NoteIndex] = {}
        for path, note in parsed.items():
            record = NoteIndex(
                index_key=_index_key(layer, owner_id, None, revision, path),
                layer=layer,
                revision_sha=revision,
                path=path,
                slug=_slug(path),
                title=note.title,
                content_hash=note.content_hash,
                owner_user_id=owner_id,
            )
            database.add(record)
            records[path] = record
        await database.flush()
        for path, note in parsed.items():
            record = records[path]
            for tag_name in dict.fromkeys(note.tags):
                normalized = tag_name.casefold()[:80]
                tag = await database.scalar(select(Tag).where(Tag.name == normalized))
                if tag is None:
                    tag = Tag(name=normalized)
                    database.add(tag)
                    await database.flush()
                database.add(NoteTag(note_id=record.id, tag_id=tag.id))
            seen_links: set[tuple[str, str]] = set()
            for link in note.typed_links:
                key = (link.kind, link.target)
                if key in seen_links:
                    continue
                seen_links.add(key)
                target_path = resolve_link_target(link.target, lookup)
                target_note = records.get(target_path) if target_path else None
                database.add(
                    NoteLink(
                        source_id=record.id,
                        target_id=None if target_note is None else target_note.id,
                        target_raw=link.target[:200],
                        link_type=link.kind,
                        unresolved=target_note is None,
                    )
                )
        binding.indexed_sha = revision
        binding.index_status = "current"
        job.status = SyncJobStatus.READY.value
        job.finished_at = datetime.now(UTC)
        record_audit_event(
            database,
            action="index.rebuild",
            actor_user_id=actor_user_id,
            details={
                "layer": layer,
                "notes": len(parsed),
                "mode": "full" if paths is None else "incremental",
            },
        )
        await _prune_sync_jobs(database)
        await database.commit()
        await database.refresh(job)
        return job
    except (GitHubAppError, IndexerError, ValueError) as exc:
        await database.rollback()
        binding = await _reload_binding(database, layer, owner_id, binding)
        binding.index_status = "error"
        failed = SyncJob(
            layer=layer,
            owner_user_id=owner_id,
            revision_sha=revision,
            status=SyncJobStatus.ERROR.value,
            error=str(exc)[:255],
            started_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
        )
        database.add(failed)
        await database.commit()
        if isinstance(exc, IndexerError):
            raise
        if isinstance(exc, GitHubAppError):
            raise IndexerError(502, exc.message) from exc
        raise IndexerError(500, "index rebuild failed") from exc


async def _reload_binding(
    database: AsyncSession,
    layer: str,
    owner_id: uuid.UUID | None,
    binding: SharedRepository | PersonalRepository,
) -> SharedRepository | PersonalRepository:
    if layer == NoteLayer.SHARED.value:
        row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
        return row or binding
    row = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == owner_id)
    )
    return row or binding


async def _delete_layer(database: AsyncSession, layer: str, owner_id: uuid.UUID | None) -> None:
    ids = select(NoteIndex.id).where(
        NoteIndex.layer == layer,
        NoteIndex.owner_user_id == owner_id,
    )
    await database.execute(delete(NoteLink).where(NoteLink.source_id.in_(ids)))
    await database.execute(delete(NoteTag).where(NoteTag.note_id.in_(ids)))
    await database.execute(
        delete(NoteIndex).where(NoteIndex.layer == layer, NoteIndex.owner_user_id == owner_id)
    )


async def _prune_sync_jobs(database: AsyncSession) -> None:
    total = await database.scalar(select(func.count()).select_from(SyncJob))
    if total is None or total <= 20:
        return
    oldest = (
        await database.scalars(
            select(SyncJob.id).order_by(SyncJob.created_at.asc()).limit(total - 20)
        )
    ).all()
    if oldest:
        await database.execute(delete(SyncJob).where(SyncJob.id.in_(oldest)))


async def load_graph(
    database: AsyncSession,
    *,
    layer: str,
    owner_id: uuid.UUID | None,
    revision: str,
    limit: int,
    center: str | None,
    depth: int,
) -> dict[str, object]:
    empty = {
        "layer": layer,
        "index_status": "empty",
        "truncated": False,
        "nodes": [],
        "edges": [],
    }
    layer_filter = (
        NoteIndex.layer == layer,
        NoteIndex.owner_user_id == owner_id,
        NoteIndex.revision_sha == revision,
    )
    if center:
        rows = (
            await database.execute(
                select(NoteIndex.id, NoteIndex.path).where(*layer_filter).order_by(NoteIndex.path)
            )
        ).all()
        if not rows:
            return empty
        by_id_path = {note_id: path for note_id, path in rows}
        path_ids = {path: note_id for note_id, path in rows}
        links = (
            await database.scalars(select(NoteLink).where(NoteLink.source_id.in_(by_id_path)))
        ).all()
        adjacency: dict[str, set[str]] = {path: set() for path in path_ids}
        for link in links:
            source_path = by_id_path.get(link.source_id)
            target_path = by_id_path.get(link.target_id) if link.target_id else None
            if source_path and target_path:
                adjacency[source_path].add(target_path)
                adjacency[target_path].add(source_path)
        chosen = _bounded_paths(list(path_ids), adjacency, center, depth, limit)
        truncated = len(rows) > len(chosen)
        chosen_notes = (
            await database.scalars(
                select(NoteIndex).where(*layer_filter, NoteIndex.path.in_(chosen)).order_by(NoteIndex.path)
            )
        ).all()
        chosen_ids = {note.id for note in chosen_notes}
        chosen_links = [link for link in links if link.source_id in chosen_ids]
        return await _graph_payload(database, layer, chosen_notes, chosen_links, truncated)

    window = (
        await database.scalars(select(NoteIndex).where(*layer_filter).order_by(NoteIndex.path).limit(limit + 1))
    ).all()
    truncated = len(window) > limit
    chosen_notes = window[:limit]
    if not chosen_notes:
        return empty
    chosen_ids = {note.id for note in chosen_notes}
    links = (
        await database.scalars(
            select(NoteLink).where(
                or_(NoteLink.source_id.in_(chosen_ids), NoteLink.target_id.in_(chosen_ids))
            )
        )
    ).all()
    return await _graph_payload(database, layer, chosen_notes, links, truncated)


async def load_overlay(
    database: AsyncSession,
    *,
    owner_id: uuid.UUID,
    personal_revision: str,
    shared_payload: dict[str, object],
    overlay_limit: int,
) -> dict[str, object]:
    shared_nodes = list(shared_payload.get("nodes") or [])
    shared_edges = list(shared_payload.get("edges") or [])
    visible = {node["path"] for node in shared_nodes if not node.get("unresolved")}
    shared_rows = (
        await database.scalars(
            select(NoteIndex).where(
                NoteIndex.layer == NoteLayer.SHARED.value,
                NoteIndex.owner_user_id.is_(None),
            )
        )
    ).all()
    lookup = notes_lookup_map({note.path for note in shared_rows})
    personal_notes = (
        await database.scalars(
            select(NoteIndex).where(
                NoteIndex.layer == NoteLayer.PERSONAL.value,
                NoteIndex.owner_user_id == owner_id,
                NoteIndex.revision_sha == personal_revision,
            )
        )
    ).all()
    personal_by_path = {note.path: note for note in personal_notes}
    personal_ids = {note.id for note in personal_notes}
    tag_map = await _tags_for(database, personal_ids)
    links: list[NoteLink] = []
    if personal_ids:
        links = list(
            (
                await database.scalars(select(NoteLink).where(NoteLink.source_id.in_(personal_ids)))
            ).all()
        )
    personal_by_id = {note.id: note for note in personal_notes}

    nodes: list[dict[str, object]] = []
    for node in shared_nodes:
        path = str(node["path"])
        origin = "both" if (not node.get("unresolved") and path in personal_by_path) else node.get("origin", "shared")
        nodes.append({**node, "origin": origin})
    edges: list[dict[str, object]] = [{**edge, "origin": edge.get("origin", "shared")} for edge in shared_edges]
    existing_edges = {(edge["source"], edge["target"], edge["type"]) for edge in edges}

    added_personal: set[str] = set()
    overlay_truncated = False
    overlay_count = 0

    def add_personal_node(note: NoteIndex) -> str:
        if note.path in visible:
            return note.path
        key = f"personal:{note.path}"
        if key not in added_personal:
            nodes.append(
                {
                    "path": key,
                    "title": note.title,
                    "tags": tag_map.get(note.id, []),
                    "isolated": False,
                    "unresolved": False,
                    "origin": "personal",
                }
            )
            added_personal.add(key)
        return key

    for link in links:
        source = personal_by_id.get(link.source_id)
        if source is None:
            continue
        target_path = resolve_link_target(link.target_raw, lookup)
        if target_path is None or target_path not in visible:
            continue
        if overlay_count >= overlay_limit:
            overlay_truncated = True
            break
        source_id = add_personal_node(source)
        key = (source_id, target_path, link.link_type)
        if key in existing_edges:
            continue
        edges.append(
            {
                "source": source_id,
                "target": target_path,
                "type": link.link_type,
                "unresolved": False,
                "origin": "overlay",
            }
        )
        existing_edges.add(key)
        overlay_count += 1

    status = str(shared_payload.get("index_status") or "current")
    return {
        "layer": "overlay",
        "index_status": status,
        "truncated": bool(shared_payload.get("truncated")) or overlay_truncated,
        "nodes": nodes,
        "edges": edges,
    }


def _bounded_paths(
    paths: list[str],
    adjacency: dict[str, set[str]],
    center: str | None,
    depth: int,
    limit: int,
) -> set[str]:
    if center and center in adjacency:
        seen = {center}
        frontier = {center}
        for _ in range(max(depth, 0)):
            nxt: set[str] = set()
            for node in frontier:
                nxt.update(adjacency.get(node, set()))
            nxt -= seen
            if not nxt:
                break
            seen.update(nxt)
            frontier = nxt
            if len(seen) >= limit:
                break
        chosen = sorted(seen)[:limit]
        return set(chosen)
    return set(paths[:limit])


async def _parsed_from_existing(
    database: AsyncSession, notes: list[NoteIndex]
) -> dict[str, ParsedNote]:
    if not notes:
        return {}
    note_ids = {note.id for note in notes}
    tag_map = await _tags_for(database, note_ids)
    links = (await database.scalars(select(NoteLink).where(NoteLink.source_id.in_(note_ids)))).all()
    typed_links: dict[uuid.UUID, list[ParsedLink]] = {note.id: [] for note in notes}
    for link in links:
        typed_links.setdefault(link.source_id, []).append(
            ParsedLink(target=link.target_raw, kind=link.link_type)
        )
    parsed: dict[str, ParsedNote] = {}
    for note in notes:
        outgoing = tuple(typed_links.get(note.id, []))
        parsed[note.path] = ParsedNote(
            title=note.title,
            tags=tuple(tag_map.get(note.id, [])),
            aliases=(),
            links=tuple(item.target for item in outgoing),
            typed_links=outgoing,
            body="",
            content_hash=note.content_hash,
        )
    return parsed


async def _graph_payload(
    database: AsyncSession,
    layer: str,
    chosen_notes: list[NoteIndex],
    links: list[NoteLink],
    truncated: bool,
) -> dict[str, object]:
    chosen_ids = {note.id for note in chosen_notes}
    chosen_paths = {note.path for note in chosen_notes}
    tag_map = await _tags_for(database, chosen_ids)
    by_id = {note.id: note for note in chosen_notes}
    linked_targets = {link.source_id for link in links if link.source_id in chosen_ids} | {
        link.target_id for link in links if link.target_id in chosen_ids
    }
    origin = "personal" if layer == NoteLayer.PERSONAL.value else "shared"
    nodes = []
    for note in chosen_notes:
        nodes.append(
            {
                "path": note.path,
                "title": note.title,
                "tags": tag_map.get(note.id, []),
                "isolated": note.id not in linked_targets,
                "unresolved": False,
                "origin": origin,
            }
        )
    edges = []
    unresolved_nodes: dict[str, str] = {}
    for link in links:
        source = by_id.get(link.source_id)
        if source is None or source.path not in chosen_paths:
            continue
        if link.unresolved or link.target_id is None:
            node_id = f"unresolved:{link.target_raw}"
            unresolved_nodes[node_id] = link.target_raw
            edges.append(
                {
                    "source": source.path,
                    "target": node_id,
                    "type": link.link_type,
                    "unresolved": True,
                    "origin": origin,
                }
            )
            continue
        target = by_id.get(link.target_id)
        if target is None or target.path not in chosen_paths:
            continue
        edges.append(
            {
                "source": source.path,
                "target": target.path,
                "type": link.link_type,
                "unresolved": False,
                "origin": origin,
            }
        )
    for node_id, title in unresolved_nodes.items():
        nodes.append(
            {
                "path": node_id,
                "title": title,
                "tags": [],
                "isolated": False,
                "unresolved": True,
                "origin": origin,
            }
        )
    return {
        "layer": layer,
        "index_status": "current",
        "truncated": truncated,
        "nodes": nodes,
        "edges": edges,
    }


async def _tags_for(database: AsyncSession, note_ids: set[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    if not note_ids:
        return {}
    rows = (
        await database.execute(
            select(NoteTag.note_id, Tag.name)
            .join(Tag, Tag.id == NoteTag.tag_id)
            .where(NoteTag.note_id.in_(note_ids))
        )
    ).all()
    result: dict[uuid.UUID, list[str]] = {}
    for note_id, name in rows:
        result.setdefault(note_id, []).append(name)
    return result
