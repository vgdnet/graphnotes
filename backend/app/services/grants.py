from __future__ import annotations

import hashlib
import unicodedata
import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access_grant import AccessGrant, GrantKind
from app.models.graph import NoteIndex, NoteLayer, NoteTag, Tag
from app.models.shared_note import SharedNote
from app.models.user import User, UserRole
from app.services.git_paths import PathError, normalize_git_path
from app.services.markdown import parse_markdown

MAX_EDITOR_TAGS = 40
TAG_MAX_LEN = 80
VALUE_MAX_LEN = 180


class GrantError(ValueError):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass(frozen=True)
class GrantMatch:
    path: bool
    tags: frozenset[str]
    prefixes: frozenset[str]


def normalize_tag_list(tags: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in tags or []:
        name = _normalize_tag(str(raw))
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
        if len(out) >= MAX_EDITOR_TAGS:
            break
    return out


def _normalize_tag(raw: str) -> str:
    return unicodedata.normalize("NFC", raw).strip().casefold()[:TAG_MAX_LEN]


def normalize_prefix(raw: str) -> str:
    if not isinstance(raw, str) or "\x00" in raw:
        raise GrantError(400, "prefix is invalid")
    text = unicodedata.normalize("NFC", raw.replace("\\", "/")).strip().strip("/")
    if not text:
        raise GrantError(400, "prefix must not be empty")
    if text.endswith(".md"):
        raise GrantError(400, "prefix is a folder, not a file")
    parts: list[str] = []
    for part in text.split("/"):
        if part in {"", ".", ".."} or part.startswith("."):
            raise GrantError(400, "prefix is invalid")
        parts.append(part)
    prefix = "/".join(parts) + "/"
    if len(prefix) > VALUE_MAX_LEN:
        raise GrantError(400, "prefix is too long")
    return prefix


def normalize_grant_value(kind: str, value: str) -> str:
    if kind == GrantKind.PATH.value:
        try:
            return normalize_git_path(value)
        except PathError as exc:
            raise GrantError(400, str(exc)) from exc
    if kind == GrantKind.TAG.value:
        name = _normalize_tag(value)
        if not name:
            raise GrantError(400, "tag must not be empty")
        return name
    if kind == GrantKind.PREFIX.value:
        return normalize_prefix(value)
    raise GrantError(400, "kind must be path, tag or prefix")


def prefix_covers(prefix: str, path: str) -> bool:
    return path.startswith(prefix)


def editorial_scope_active(user: User) -> bool:
    """Leftover name: non-admin editors are always scoped (TZ 3.30).

    Empty grant = no extra shared write, not the whole queue.
    """
    return user.role == UserRole.EDITOR.value


def admin_bypasses_grant(user: User) -> bool:
    return user.role == UserRole.ADMIN.value


def editorial_queue_mode(user: User, *, has_grants: bool) -> str:
    """Queue visibility after the coarse editor/admin gate (TZ 3.30).

    `all` — admin, grants do not cut pending proposals.
    `granted` — editor with at least one path/tag/prefix grant.
    `none` — editor with zero grants (empty list, not the whole queue).
    """
    if admin_bypasses_grant(user):
        return "all"
    if user.role == UserRole.EDITOR.value and has_grants:
        return "granted"
    return "none"


async def queue_scope(database: AsyncSession, user: User) -> tuple[str, bool]:
    if admin_bypasses_grant(user):
        return "all", False
    grants = await load_grants(database, user.id)
    has_grants = bool(grants)
    return editorial_queue_mode(user, has_grants=has_grants), has_grants


async def load_grants(database: AsyncSession, user_id: uuid.UUID) -> list[AccessGrant]:
    grouped = await grants_by_user_ids(database, [user_id])
    return grouped.get(user_id, [])


async def grants_by_user_ids(
    database: AsyncSession, user_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[AccessGrant]]:
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        return {}
    rows = list(
        (
            await database.scalars(
                select(AccessGrant)
                .where(AccessGrant.user_id.in_(ids))
                .order_by(AccessGrant.kind, AccessGrant.value, AccessGrant.id)
            )
        ).all()
    )
    grouped: dict[uuid.UUID, list[AccessGrant]] = {user_id: [] for user_id in ids}
    for row in rows:
        grouped.setdefault(row.user_id, []).append(row)
    return grouped


def grant_match(grants: Iterable[AccessGrant]) -> GrantMatch:
    paths: set[str] = set()
    tags: set[str] = set()
    prefixes: set[str] = set()
    for row in grants:
        if row.kind == GrantKind.PATH.value:
            paths.add(row.value)
        elif row.kind == GrantKind.TAG.value:
            tags.add(row.value)
        elif row.kind == GrantKind.PREFIX.value:
            prefixes.add(row.value)
    return GrantMatch(
        path=bool(paths),
        tags=frozenset(tags),
        prefixes=frozenset(prefixes),
    )


def path_matches_grants(
    path: str,
    path_tags: Iterable[str],
    grants: Iterable[AccessGrant],
) -> bool:
    have_tags = {str(item).strip().casefold() for item in path_tags if str(item).strip()}
    for row in grants:
        if row.kind == GrantKind.PATH.value and row.value == path:
            return True
        if row.kind == GrantKind.PREFIX.value and prefix_covers(row.value, path):
            return True
        if row.kind == GrantKind.TAG.value and row.value in have_tags:
            return True
    return False


async def tags_for_paths(
    database: AsyncSession, paths: Iterable[str]
) -> dict[str, set[str]]:
    ordered = [str(path) for path in paths]
    result: dict[str, set[str]] = {path: set() for path in ordered}
    if not ordered:
        return result
    rows = (
        await database.execute(
            select(NoteIndex.path, Tag.name)
            .join(NoteTag, NoteTag.note_id == NoteIndex.id)
            .join(Tag, Tag.id == NoteTag.tag_id)
            .where(
                NoteIndex.path.in_(ordered),
                NoteIndex.layer.in_(
                    (NoteLayer.SHARED.value, NoteLayer.PROPOSAL.value)
                ),
            )
        )
    ).all()
    for path, name in rows:
        result.setdefault(str(path), set()).add(str(name))
    return result


async def write_granted(
    database: AsyncSession, user: User, path: str, path_tags: Iterable[str] | None = None
) -> bool:
    if admin_bypasses_grant(user):
        return True
    grants = await load_grants(database, user.id)
    if not grants:
        return False
    tags = set(path_tags) if path_tags is not None else (await tags_for_paths(database, [path])).get(path, set())
    return path_matches_grants(path, tags, grants)


async def filter_editorial_paths(
    database: AsyncSession, user: User, paths: list[str]
) -> list[str]:
    if admin_bypasses_grant(user):
        return list(paths)
    if user.role not in {UserRole.EDITOR.value, UserRole.ADMIN.value}:
        return list(paths)
    grants = await load_grants(database, user.id)
    if not grants:
        return []
    tags_map = await tags_for_paths(database, paths)
    return [
        path
        for path in paths
        if path_matches_grants(path, tags_map.get(path, ()), grants)
    ]


async def editorial_path_allowed(
    database: AsyncSession, user: User, path: str
) -> bool:
    if admin_bypasses_grant(user):
        return True
    kept = await filter_editorial_paths(database, user, [path])
    return path in kept


async def sync_editor_tags(database: AsyncSession, user: User) -> None:
    tags = [
        row.value
        for row in await load_grants(database, user.id)
        if row.kind == GrantKind.TAG.value
    ]
    user.editor_tags = tags


async def replace_tag_grants(
    database: AsyncSession,
    *,
    user: User,
    tags: list[str],
    actor_id: uuid.UUID | None,
) -> list[str]:
    normalized = normalize_tag_list(tags)
    await database.execute(
        delete(AccessGrant).where(
            AccessGrant.user_id == user.id,
            AccessGrant.kind == GrantKind.TAG.value,
        )
    )
    for name in normalized:
        database.add(
            AccessGrant(
                user_id=user.id,
                kind=GrantKind.TAG.value,
                value=name,
                created_by=actor_id,
            )
        )
    user.editor_tags = normalized
    return normalized


async def create_grant(
    database: AsyncSession,
    *,
    user: User,
    kind: str,
    value: str,
    actor_id: uuid.UUID | None,
) -> AccessGrant:
    if kind not in {item.value for item in GrantKind}:
        raise GrantError(400, "kind must be path, tag or prefix")
    normalized = normalize_grant_value(kind, value)
    row = AccessGrant(
        user_id=user.id,
        kind=kind,
        value=normalized,
        created_by=actor_id,
    )
    database.add(row)
    try:
        await database.flush()
    except IntegrityError as exc:
        raise GrantError(409, "grant already exists") from exc
    if kind == GrantKind.TAG.value:
        await sync_editor_tags(database, user)
    return row


async def delete_grant(database: AsyncSession, grant: AccessGrant, owner: User) -> None:
    kind = grant.kind
    await database.delete(grant)
    await database.flush()
    if kind == GrantKind.TAG.value:
        await sync_editor_tags(database, owner)


async def list_grants(
    database: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    kind: str | None = None,
    value: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[AccessGrant], int]:
    query = select(AccessGrant)
    count_query = select(AccessGrant)
    if user_id is not None:
        query = query.where(AccessGrant.user_id == user_id)
        count_query = count_query.where(AccessGrant.user_id == user_id)
    if kind:
        query = query.where(AccessGrant.kind == kind)
        count_query = count_query.where(AccessGrant.kind == kind)
    if value:
        needle = value.strip()
        if kind == GrantKind.TAG.value:
            needle = _normalize_tag(needle)
        elif kind == GrantKind.PREFIX.value:
            try:
                needle = normalize_prefix(needle)
            except GrantError:
                pass
        elif kind == GrantKind.PATH.value:
            try:
                needle = normalize_git_path(needle)
            except PathError:
                pass
        query = query.where(AccessGrant.value == needle)
        count_query = count_query.where(AccessGrant.value == needle)
    total = len(list((await database.scalars(count_query)).all()))
    rows = list(
        (
            await database.scalars(
                query.order_by(AccessGrant.kind, AccessGrant.value, AccessGrant.id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return rows, total


def _catalog_matches(needle: str, *parts: str) -> bool:
    if not needle:
        return True
    return any(needle in part.casefold() for part in parts if part)


async def grant_catalog(
    database: AsyncSession,
    *,
    q: str | None = None,
    tag: str | None = None,
    limit: int = 80,
) -> dict[str, object]:
    needle = (q or "").strip().casefold()
    tag_filter = _normalize_tag(tag) if tag else ""
    cap = max(1, min(limit, 200))
    notes = list((await database.scalars(select(SharedNote.path).order_by(SharedNote.path))).all())
    paths = [str(path) for path in notes]
    title_rows = (
        await database.execute(
            select(NoteIndex.path, NoteIndex.title).where(
                NoteIndex.layer == NoteLayer.SHARED.value
            )
        )
    ).all()
    titles = {str(path): str(title) for path, title in title_rows}
    tagged_paths: set[str] | None = None
    if tag_filter:
        tagged_paths = {
            str(path)
            for path in (
                await database.scalars(
                    select(NoteIndex.path)
                    .join(NoteTag, NoteTag.note_id == NoteIndex.id)
                    .join(Tag, Tag.id == NoteTag.tag_id)
                    .where(
                        NoteIndex.layer == NoteLayer.SHARED.value,
                        Tag.name == tag_filter,
                    )
                )
            ).all()
        }
    tags = [
        str(name)
        for name in (
            await database.scalars(
                select(Tag.name)
                .join(NoteTag, NoteTag.tag_id == Tag.id)
                .join(NoteIndex, NoteIndex.id == NoteTag.note_id)
                .where(NoteIndex.layer == NoteLayer.SHARED.value)
                .distinct()
                .order_by(Tag.name)
            )
        ).all()
    ]
    prefixes: set[str] = set()
    for path in paths:
        parts = path.split("/")
        for index in range(1, len(parts)):
            prefixes.add("/".join(parts[:index]) + "/")
    matched_paths = [
        path
        for path in paths
        if _catalog_matches(needle, path, titles.get(path, ""))
        and (tagged_paths is None or path in tagged_paths)
    ]
    matched_tags = [name for name in tags if _catalog_matches(needle, name)]
    matched_prefixes = [
        prefix for prefix in sorted(prefixes) if _catalog_matches(needle, prefix)
    ]
    if needle or tag_filter:
        matched_paths = matched_paths[:cap]
        matched_tags = matched_tags[:cap]
        matched_prefixes = matched_prefixes[:cap]
    return {
        "paths": matched_paths,
        "tags": matched_tags,
        "prefixes": matched_prefixes,
        "cards": [
            {"path": path, "title": titles.get(path) or path} for path in matched_paths
        ],
    }


async def granted_shared_notes(
    database: AsyncSession, user: User
) -> list[SharedNote]:
    notes = list((await database.scalars(select(SharedNote).order_by(SharedNote.path))).all())
    if admin_bypasses_grant(user):
        grants = await load_grants(database, user.id)
        if not grants:
            return []
    else:
        grants = await load_grants(database, user.id)
        if not grants:
            return []
    tags_map = await tags_for_paths(database, [note.path for note in notes])
    return [
        note
        for note in notes
        if path_matches_grants(note.path, tags_map.get(note.path, ()), grants)
    ]


async def require_write_grant(
    database: AsyncSession, user: User, path: str
) -> SharedNote | None:
    note = await database.scalar(select(SharedNote).where(SharedNote.path == path))
    if note is None:
        return None
    if not await write_granted(database, user, path):
        raise GrantError(403, "grant does not include this note")
    return note


async def write_shared_body(
    database: AsyncSession, *, user: User, path: str, body: str
) -> SharedNote:
    from app.services.ingest import _upsert_shared_note
    from app.services.index import reindex_shared_store

    normalized = normalize_git_path(path)
    if not await write_granted(database, user, normalized):
        raise GrantError(403, "grant does not include this note")
    parsed = parse_markdown(normalized, body)
    await _upsert_shared_note(
        database,
        normalized,
        body,
        parsed.content_hash,
        actor_user_id=user.id,
    )
    await reindex_shared_store(database)
    note = await database.scalar(select(SharedNote).where(SharedNote.path == normalized))
    if note is None:
        raise GrantError(404, "note was not found")
    return note


def file_headers(note: SharedNote) -> tuple[bytes, dict[str, str]]:
    payload = note.body.encode("utf-8")
    digest = note.content_hash or hashlib.sha256(payload).hexdigest()
    return payload, {
        "Content-Type": "text/markdown; charset=utf-8",
        "X-GraphNotes-Path": note.path,
        "X-GraphNotes-Kind": "markdown",
        "X-GraphNotes-SHA256": digest,
        "X-GraphNotes-Version": digest,
        "X-GraphNotes-Size": str(len(payload)),
        "Cache-Control": "no-store",
    }


def public_grant(row: AccessGrant, username: str | None = None) -> dict[str, object]:
    return {
        "id": str(row.id),
        "user_id": str(row.user_id),
        "username": username,
        "kind": row.kind,
        "value": row.value,
        "created_by": str(row.created_by) if row.created_by else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
