from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.closed_path import ClosedPath
from app.models.user import User
from app.services.git_paths import PathError, normalize_git_path


class ClosedCorpusError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def link_keys(value: str) -> set[str]:
    raw = value.strip()
    if raw.startswith("unresolved:") or raw.startswith("locked:"):
        raw = raw.split(":", 1)[1]
    stem = raw.rsplit("/", 1)[-1]
    if stem.lower().endswith(".md"):
        stem = stem[:-3]
    keys = {raw, raw.casefold(), stem, stem.casefold()}
    if not raw.lower().endswith(".md"):
        keys.add(f"{raw}.md")
        keys.add(f"{raw.casefold()}.md")
    return {item for item in keys if item}


def matches_closed(value: str, closed_keys: set[str]) -> bool:
    return bool(link_keys(value) & closed_keys)


async def list_closed_paths(database: AsyncSession, user: User) -> list[dict[str, object]]:
    rows = (
        await database.scalars(
            select(ClosedPath)
            .where(ClosedPath.user_id == user.id)
            .order_by(ClosedPath.path)
        )
    ).all()
    return [{"path": row.path, "created_at": row.created_at} for row in rows]


async def closed_paths_for_user(database: AsyncSession, user_id) -> set[str]:
    rows = (
        await database.scalars(select(ClosedPath.path).where(ClosedPath.user_id == user_id))
    ).all()
    return set(rows)


async def all_closed_keys(database: AsyncSession) -> set[str]:
    rows = (await database.scalars(select(ClosedPath.path))).all()
    keys: set[str] = set()
    for path in rows:
        keys.update(link_keys(path))
    return keys


async def is_globally_closed(database: AsyncSession, path: str) -> bool:
    keys = link_keys(path)
    rows = (await database.scalars(select(ClosedPath.path))).all()
    return any(link_keys(item) & keys for item in rows)


async def close_path(database: AsyncSession, user: User, raw_path: str) -> dict[str, object]:
    try:
        path = normalize_git_path(raw_path)
    except PathError as exc:
        raise ClosedCorpusError(400, str(exc)) from exc
    existing = await database.scalar(
        select(ClosedPath).where(ClosedPath.user_id == user.id, ClosedPath.path == path)
    )
    if existing is None:
        database.add(ClosedPath(user_id=user.id, path=path))
        await database.commit()
    else:
        await database.refresh(existing)
    return {"path": path, "closed": True}


async def unclose_path(database: AsyncSession, user: User, raw_path: str) -> None:
    try:
        path = normalize_git_path(raw_path)
    except PathError as exc:
        raise ClosedCorpusError(400, str(exc)) from exc
    row = await database.scalar(
        select(ClosedPath).where(ClosedPath.user_id == user.id, ClosedPath.path == path)
    )
    if row is None:
        raise ClosedCorpusError(404, "path is not closed")
    await database.delete(row)
    await database.commit()


def lock_stub(path: str) -> dict[str, object]:
    title = path.rsplit("/", 1)[-1]
    if title.lower().endswith(".md"):
        title = title[:-3]
    return {
        "path": path,
        "title": title or "note",
        "tags": [],
        "aliases": [],
        "links": [],
        "unresolved_links": [],
        "locked_links": [],
        "warnings": [],
        "body": "",
        "content_hash": "",
        "locked": True,
        "closed": False,
    }
