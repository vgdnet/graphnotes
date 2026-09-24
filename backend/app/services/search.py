from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository, SharedRepository
from app.models.graph import NoteIndex, NoteLayer, NoteTag, Tag
from app.models.personal_upload import PersonalUpload
from app.models.proposal import Proposal, ProposalStatus
from app.models.user import User, UserRole
from app.services.card_paths import personal_card_path, proposal_card_path
from app.services.index import overlay_personal_paths
from app.services.markdown import parse_markdown
from app.services.repository import SHARED_SINGLETON_ID

_SLICE_LAYERS = {"overlay", "personal", "shared", "visible"}
_ACTIVE_PROPOSALS = {
    ProposalStatus.OPEN.value,
    ProposalStatus.CHANGES_REQUESTED.value,
    ProposalStatus.CONFLICTED.value,
    ProposalStatus.FAILED.value,
    ProposalStatus.ACCEPTED_PENDING_MERGE.value,
    ProposalStatus.MERGED_INDEXING.value,
}
_REVIEW_PROPOSALS = _ACTIVE_PROPOSALS | {ProposalStatus.REJECTED.value}


async def search_visible_cards(
    database: AsyncSession,
    query: str,
    *,
    user: User | None,
    tag: str = "",
    limit: int = 40,
    layer: str = "visible",
) -> dict[str, object]:
    trimmed = query.strip()
    tag_name = tag.strip()
    cap = max(1, min(limit, 80))
    scope = layer if layer in _SLICE_LAYERS else "visible"
    if user is None:
        scope = "shared"

    slices: list[list[dict[str, object]]] = []
    include_shared = scope != "personal"
    include_personal = scope != "shared"
    stitch: set[str] | None = None
    if scope == "overlay" and user is not None:
        personal = await database.scalar(
            select(PersonalRepository).where(PersonalRepository.user_id == user.id)
        )
        stitch = await overlay_personal_paths(
            database,
            owner_id=user.id,
            personal_revision=personal.indexed_sha if personal is not None else None,
        )

    if include_shared:
        slices.append(
            await _shared_hits(database, text=trimmed, tag_name=tag_name, cap=cap)
        )
    if include_personal and user is not None:
        if user.role == UserRole.ADMIN.value and scope == "visible":
            slices.append(
                await _all_personal_hits(
                    database, viewer=user, text=trimmed, tag_name=tag_name, cap=cap
                )
            )
        else:
            slices.append(
                await _personal_hits(
                    database,
                    owner=user,
                    viewer_id=user.id,
                    text=trimmed,
                    tag_name=tag_name,
                    cap=cap,
                    paths=stitch,
                )
            )
    if scope == "visible" and user is not None and user.role in {
        UserRole.EDITOR.value,
        UserRole.ADMIN.value,
    }:
        slices.append(
            await _proposal_hits(database, viewer=user, text=trimmed, tag_name=tag_name, cap=cap)
        )

    hits = _round_robin(slices, cap)
    note_ids = [item.pop("_note_id") for item in hits]
    tag_map = await _tags_for_notes(database, [item for item in note_ids if item is not None])
    for hit, note_id in zip(hits, note_ids, strict=True):
        if note_id is not None and not hit["tags"]:
            hit["tags"] = tag_map.get(note_id, [])

    return {
        "query": trimmed,
        "tag": tag_name,
        "layer": scope,
        "hits": hits,
        "available_tags": await _available_tags(database, user=user, layer=scope),
    }


async def _shared_hits(
    database: AsyncSession, *, text: str, tag_name: str, cap: int
) -> list[dict[str, object]]:
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is None or not shared.indexed_sha:
        return []
    rows = (
        await database.scalars(
            _note_query(
                layer=NoteLayer.SHARED.value,
                owner_id=None,
                revision=shared.indexed_sha,
                text=text,
                tag_name=tag_name,
            )
            .order_by(NoteIndex.title, NoteIndex.path)
            .limit(cap)
        )
    ).all()
    return [
        {
            "path": note.path,
            "title": note.title,
            "tags": [],
            "layer": "shared",
            "_note_id": note.id,
        }
        for note in rows
    ]


async def _personal_hits(
    database: AsyncSession,
    *,
    owner: User,
    viewer_id,
    text: str,
    tag_name: str,
    cap: int,
    paths: set[str] | None = None,
) -> list[dict[str, object]]:
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == owner.id)
    )
    hits: list[dict[str, object]] = []
    store_copy = (
        await database.scalar(
            select(PersonalUpload.id).where(PersonalUpload.user_id == owner.id).limit(1)
        )
    ) is not None
    if personal is not None and personal.indexed_sha and not store_copy:
        rows = (
            await database.scalars(
                _note_query(
                    layer=NoteLayer.PERSONAL.value,
                    owner_id=owner.id,
                    revision=personal.indexed_sha,
                    text=text,
                    tag_name=tag_name,
                    paths=paths,
                )
                .order_by(NoteIndex.title, NoteIndex.path)
                .limit(cap)
            )
        ).all()
        for note in rows:
            hits.append(
                {
                    "path": personal_card_path(
                        note.path, owner_id=owner.id, viewer_id=viewer_id
                    ),
                    "title": note.title,
                    "tags": [],
                    "layer": "personal",
                    "owner": None if owner.id == viewer_id else owner.display_name,
                    "_note_id": note.id,
                }
            )
        return hits
    uploads = list(
        (
            await database.scalars(
                select(PersonalUpload)
                .where(PersonalUpload.user_id == owner.id)
                .order_by(PersonalUpload.path)
            )
        ).all()
    )
    for row in uploads:
        if len(hits) >= cap:
            break
        if paths is not None and row.path not in paths:
            continue
        parsed = parse_markdown(row.path, row.body)
        tags = list(parsed.tags)
        if tag_name and tag_name.casefold() not in {item.casefold() for item in tags}:
            continue
        if text:
            haystack = " ".join((parsed.title, row.path, *tags)).casefold()
            if text.casefold() not in haystack:
                continue
        elif not tag_name:
            continue
        hits.append(
            {
                "path": personal_card_path(row.path, owner_id=owner.id, viewer_id=viewer_id),
                "title": parsed.title,
                "tags": tags,
                "layer": "personal",
                "owner": None if owner.id == viewer_id else owner.display_name,
                "_note_id": None,
            }
        )
    return hits


async def _all_personal_hits(
    database: AsyncSession, *, viewer: User, text: str, tag_name: str, cap: int
) -> list[dict[str, object]]:
    owners = (await database.scalars(select(User).order_by(User.username))).all()
    merged: list[dict[str, object]] = []
    seen: set[str] = set()
    for owner in owners:
        leftover = cap - len(merged)
        if leftover <= 0:
            break
        for hit in await _personal_hits(
            database,
            owner=owner,
            viewer_id=viewer.id,
            text=text,
            tag_name=tag_name,
            cap=leftover,
        ):
            if hit["path"] in seen:
                continue
            seen.add(hit["path"])
            merged.append(hit)
            if len(merged) >= cap:
                return merged
    return merged


async def _proposal_hits(
    database: AsyncSession, *, viewer: User, text: str, tag_name: str, cap: int
) -> list[dict[str, object]]:
    statuses = (
        _REVIEW_PROPOSALS if viewer.role == UserRole.ADMIN.value else _ACTIVE_PROPOSALS
    )
    proposal_ids = list(
        (
            await database.scalars(
                select(Proposal.id).where(Proposal.status.in_(statuses))
            )
        ).all()
    )
    if not proposal_ids:
        return []
    rows = (
        await database.scalars(
            _note_query(
                layer=NoteLayer.PROPOSAL.value,
                owner_id=None,
                revision=None,
                text=text,
                tag_name=tag_name,
                proposal_ids=proposal_ids,
            )
            .order_by(NoteIndex.title, NoteIndex.path)
            .limit(cap)
        )
    ).all()
    return [
        {
            "path": proposal_card_path(note.proposal_id, note.path),
            "title": note.title,
            "tags": [],
            "layer": "proposal",
            "_note_id": note.id,
        }
        for note in rows
        if note.proposal_id is not None
    ]


def _round_robin(slices: list[list[dict[str, object]]], cap: int) -> list[dict[str, object]]:
    hits: list[dict[str, object]] = []
    seen: set[str] = set()
    index = 0
    while len(hits) < cap:
        progressed = False
        for group in slices:
            if index >= len(group):
                continue
            item = group[index]
            path = str(item["path"])
            if path not in seen:
                seen.add(path)
                hits.append(item)
                if len(hits) >= cap:
                    return hits
            progressed = True
        if not progressed:
            break
        index += 1
    return hits


def _note_query(
    *,
    layer: str,
    owner_id: object | None,
    revision: str | None,
    text: str,
    tag_name: str,
    paths: set[str] | None = None,
    proposal_ids: list[object] | None = None,
):
    clauses = [NoteIndex.layer == layer]
    if revision is not None:
        clauses.append(NoteIndex.revision_sha == revision)
    if proposal_ids is not None:
        clauses.append(NoteIndex.proposal_id.in_(proposal_ids) if proposal_ids else NoteIndex.id.is_(None))
    elif owner_id is None:
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
    database: AsyncSession, *, user: User | None, layer: str = "visible"
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
        stitch: set[str] | None = None
        personal = await database.scalar(
            select(PersonalRepository).where(PersonalRepository.user_id == user.id)
        )
        if layer == "overlay":
            stitch = await overlay_personal_paths(
                database,
                owner_id=user.id,
                personal_revision=personal.indexed_sha if personal is not None else None,
            )
        if layer == "visible" and user.role == UserRole.ADMIN.value:
            owners = (await database.scalars(select(User))).all()
            for owner in owners:
                names.update(
                    await _owner_tag_names(database, owner=owner, paths=None)
                )
        else:
            names.update(await _owner_tag_names(database, owner=user, paths=stitch))
        if layer == "visible" and user.role in {UserRole.EDITOR.value, UserRole.ADMIN.value}:
            statuses = (
                _REVIEW_PROPOSALS if user.role == UserRole.ADMIN.value else _ACTIVE_PROPOSALS
            )
            proposal_ids = list(
                (await database.scalars(select(Proposal.id).where(Proposal.status.in_(statuses)))).all()
            )
            if proposal_ids:
                names.update(
                    await _layer_tag_names(
                        database,
                        layer=NoteLayer.PROPOSAL.value,
                        owner_id=None,
                        revision=None,
                        proposal_ids=proposal_ids,
                    )
                )
    return sorted(names)[:80]


async def _owner_tag_names(
    database: AsyncSession, *, owner: User, paths: set[str] | None
) -> list[str]:
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == owner.id)
    )
    store_copy = (
        await database.scalar(
            select(PersonalUpload.id).where(PersonalUpload.user_id == owner.id).limit(1)
        )
    ) is not None
    if personal is not None and personal.indexed_sha and not store_copy:
        return await _layer_tag_names(
            database,
            layer=NoteLayer.PERSONAL.value,
            owner_id=owner.id,
            revision=personal.indexed_sha,
            paths=paths,
        )
    uploads = list(
        (await database.scalars(select(PersonalUpload).where(PersonalUpload.user_id == owner.id))).all()
    )
    names: set[str] = set()
    for row in uploads:
        if paths is not None and row.path not in paths:
            continue
        names.update(parse_markdown(row.path, row.body).tags)
    return list(names)


async def _layer_tag_names(
    database: AsyncSession,
    *,
    layer: str,
    owner_id: object | None,
    revision: str | None,
    paths: set[str] | None = None,
    proposal_ids: list[object] | None = None,
) -> list[str]:
    clauses = [NoteIndex.layer == layer]
    if revision is not None:
        clauses.append(NoteIndex.revision_sha == revision)
    if proposal_ids is not None:
        if not proposal_ids:
            return []
        clauses.append(NoteIndex.proposal_id.in_(proposal_ids))
    elif owner_id is None:
        clauses.append(NoteIndex.owner_user_id.is_(None))
    else:
        clauses.append(NoteIndex.owner_user_id == owner_id)
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
