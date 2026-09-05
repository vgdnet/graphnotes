from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository, SharedRepository
from app.models.graph import NoteIndex, NoteLayer, NoteTag, Tag
from app.models.personal_upload import PersonalUpload
from app.models.user import User
from app.services.github import GitHubAppClient
from app.services.index import (
    IndexerError,
    ensure_personal_current,
    ensure_shared_current,
    overlay_personal_paths,
)
from app.services.markdown import parse_markdown
from app.services.repository import SHARED_SINGLETON_ID, refresh_personal, refresh_shared


async def search_visible_cards(
    database: AsyncSession,
    query: str,
    *,
    user: User | None,
    tag: str = "",
    limit: int = 40,
    layer: str = "overlay",
    client: GitHubAppClient | None = None,
) -> dict[str, object]:
    trimmed = query.strip()
    tag_name = tag.strip()
    cap = max(1, min(limit, 80))
    hits: list[dict[str, object]] = []
    seen: set[str] = set()
    note_ids: list[object] = []
    scope = layer if layer in {"overlay", "personal", "shared"} else "overlay"
    if user is None:
        scope = "shared"

    if client is not None:
        await refresh_shared(database, client)
        try:
            await ensure_shared_current(database, client)
        except IndexerError:
            pass
        if user is not None:
            await refresh_personal(database, user.id, client)
            try:
                await ensure_personal_current(database, user.id, client)
            except IndexerError:
                pass

    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if scope != "personal" and shared is not None and shared.indexed_sha:
        shared_rows = (
            await database.scalars(
                _note_query(
                    layer=NoteLayer.SHARED.value,
                    owner_id=None,
                    revision=shared.indexed_sha,
                    text=trimmed,
                    tag_name=tag_name,
                ).order_by(NoteIndex.title, NoteIndex.path).limit(cap)
            )
        ).all()
        for note in shared_rows:
            if note.path in seen:
                continue
            seen.add(note.path)
            note_ids.append(note.id)
            hits.append({"path": note.path, "title": note.title, "tags": []})

    if user is not None and scope != "shared":
        personal = await database.scalar(
            select(PersonalRepository).where(PersonalRepository.user_id == user.id)
        )
        leftover = cap - len(hits)
        stitch: set[str] | None = None
        if scope == "overlay":
            stitch = await overlay_personal_paths(
                database,
                owner_id=user.id,
                personal_revision=personal.indexed_sha if personal is not None else None,
            )
        if personal is not None and personal.indexed_sha and leftover > 0:
            personal_rows = (
                await database.scalars(
                    _note_query(
                        layer=NoteLayer.PERSONAL.value,
                        owner_id=user.id,
                        revision=personal.indexed_sha,
                        text=trimmed,
                        tag_name=tag_name,
                        paths=stitch,
                    ).order_by(NoteIndex.title, NoteIndex.path).limit(leftover)
                )
            ).all()
            for note in personal_rows:
                path = f"personal:{note.path}"
                if path in seen or note.path in seen:
                    continue
                seen.add(path)
                note_ids.append(note.id)
                hits.append({"path": path, "title": note.title, "tags": []})
        elif leftover > 0:
            uploads = list(
                (
                    await database.scalars(
                        select(PersonalUpload)
                        .where(PersonalUpload.user_id == user.id)
                        .order_by(PersonalUpload.path)
                    )
                ).all()
            )
            for row in uploads:
                if len(hits) >= cap:
                    break
                if stitch is not None and row.path not in stitch:
                    continue
                path = f"personal:{row.path}"
                if path in seen or row.path in seen:
                    continue
                parsed = parse_markdown(row.path, row.body)
                tags = list(parsed.tags)
                if tag_name and tag_name.casefold() not in {item.casefold() for item in tags}:
                    continue
                if trimmed:
                    haystack = " ".join((parsed.title, row.path, *tags)).casefold()
                    if trimmed.casefold() not in haystack:
                        continue
                elif not tag_name:
                    continue
                seen.add(path)
                hits.append({"path": path, "title": parsed.title, "tags": tags})
                note_ids.append(None)

    tag_map = await _tags_for_notes(database, [item for item in note_ids if item is not None])
    for hit, note_id in zip(hits, note_ids, strict=True):
        if note_id is not None:
            hit["tags"] = tag_map.get(note_id, [])

    return {
        "query": trimmed,
        "tag": tag_name,
        "hits": hits,
        "available_tags": await _available_tags(database, user=user, layer=scope),
    }


def _note_query(
    *,
    layer: str,
    owner_id: object | None,
    revision: str,
    text: str,
    tag_name: str,
    paths: set[str] | None = None,
):
    clauses = [
        NoteIndex.layer == layer,
        NoteIndex.revision_sha == revision,
    ]
    if owner_id is None:
        clauses.append(NoteIndex.owner_user_id.is_(None))
    else:
        clauses.append(NoteIndex.owner_user_id == owner_id)
    if paths is not None:
        clauses.append(NoteIndex.path.in_(paths) if paths else NoteIndex.id.is_(None))
    if text:
        pattern = f"%{text.casefold()}%"
        clauses.append(
            or_(
                func.lower(NoteIndex.title).like(pattern),
                func.lower(NoteIndex.path).like(pattern),
                func.lower(NoteIndex.slug).like(pattern),
                NoteIndex.id.in_(_tag_name_match(pattern)),
            )
        )
    if tag_name:
        clauses.append(NoteIndex.id.in_(_tag_exact(tag_name)))
    elif not text:
        clauses.append(NoteIndex.id.is_(None))
    return select(NoteIndex).where(*clauses)


def _tag_name_match(pattern: str):
    return (
        select(NoteTag.note_id)
        .join(Tag, Tag.id == NoteTag.tag_id)
        .where(func.lower(Tag.name).like(pattern))
    )


def _tag_exact(tag_name: str):
    return (
        select(NoteTag.note_id)
        .join(Tag, Tag.id == NoteTag.tag_id)
        .where(func.lower(Tag.name) == tag_name.casefold())
    )


async def _tags_for_notes(
    database: AsyncSession,
    note_ids: list[object],
) -> dict[object, list[str]]:
    if not note_ids:
        return {}
    rows = (
        await database.execute(
            select(NoteTag.note_id, Tag.name)
            .join(Tag, Tag.id == NoteTag.tag_id)
            .where(NoteTag.note_id.in_(note_ids))
            .order_by(Tag.name)
        )
    ).all()
    mapping: dict[object, list[str]] = {}
    for note_id, name in rows:
        mapping.setdefault(note_id, []).append(name)
    return mapping


async def _available_tags(
    database: AsyncSession, *, user: User | None, layer: str = "overlay"
) -> list[str]:
    names: set[str] = set()
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if layer != "personal" and shared is not None and shared.indexed_sha:
        names.update(
            await _layer_tag_names(
                database,
                layer=NoteLayer.SHARED.value,
                owner_id=None,
                revision=shared.indexed_sha,
            )
        )
    if user is not None and layer != "shared":
        personal = await database.scalar(
            select(PersonalRepository).where(PersonalRepository.user_id == user.id)
        )
        stitch: set[str] | None = None
        if layer == "overlay":
            stitch = await overlay_personal_paths(
                database,
                owner_id=user.id,
                personal_revision=personal.indexed_sha if personal is not None else None,
            )
        if personal is not None and personal.indexed_sha:
            personal_names = await _layer_tag_names(
                database,
                layer=NoteLayer.PERSONAL.value,
                owner_id=user.id,
                revision=personal.indexed_sha,
                paths=stitch,
            )
            names.update(personal_names)
        else:
            uploads = list(
                (
                    await database.scalars(
                        select(PersonalUpload).where(PersonalUpload.user_id == user.id)
                    )
                ).all()
            )
            for row in uploads:
                if stitch is not None and row.path not in stitch:
                    continue
                names.update(parse_markdown(row.path, row.body).tags)
    return sorted(names)[:80]


async def _layer_tag_names(
    database: AsyncSession,
    *,
    layer: str,
    owner_id: object | None,
    revision: str,
    paths: set[str] | None = None,
) -> list[str]:
    owner_clause = (
        NoteIndex.owner_user_id.is_(None)
        if owner_id is None
        else NoteIndex.owner_user_id == owner_id
    )
    clauses = [
        NoteIndex.layer == layer,
        NoteIndex.revision_sha == revision,
        owner_clause,
    ]
    if paths is not None:
        if not paths:
            return []
        clauses.append(NoteIndex.path.in_(paths))
    rows = (
        await database.scalars(
            select(Tag.name)
            .join(NoteTag, NoteTag.tag_id == Tag.id)
            .join(NoteIndex, NoteIndex.id == NoteTag.note_id)
            .where(*clauses)
            .distinct()
            .order_by(Tag.name)
            .limit(80)
        )
    ).all()
    return list(rows)
