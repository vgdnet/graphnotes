from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import PersonalRepository, SharedRepository
from app.models.graph import NoteIndex, NoteLayer
from app.models.user import User
from app.services.repository import SHARED_SINGLETON_ID


async def search_visible_cards(
    database: AsyncSession,
    query: str,
    *,
    user: User | None,
    limit: int = 40,
) -> dict[str, object]:
    trimmed = query.strip()
    if not trimmed:
        return {"query": trimmed, "hits": []}
    pattern = f"%{trimmed.casefold()}%"
    cap = max(1, min(limit, 80))
    hits: list[dict[str, str]] = []
    seen: set[str] = set()

    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if shared is not None and shared.indexed_sha:
        shared_rows = (
            await database.scalars(
                select(NoteIndex)
                .where(
                    NoteIndex.layer == NoteLayer.SHARED.value,
                    NoteIndex.owner_user_id.is_(None),
                    NoteIndex.revision_sha == shared.indexed_sha,
                    or_(
                        func.lower(NoteIndex.title).like(pattern),
                        func.lower(NoteIndex.path).like(pattern),
                        func.lower(NoteIndex.slug).like(pattern),
                    ),
                )
                .order_by(NoteIndex.title, NoteIndex.path)
                .limit(cap)
            )
        ).all()
        for note in shared_rows:
            if note.path in seen:
                continue
            seen.add(note.path)
            hits.append({"path": note.path, "title": note.title})

    if user is not None:
        personal = await database.scalar(
            select(PersonalRepository).where(PersonalRepository.user_id == user.id)
        )
        leftover = cap - len(hits)
        if personal is not None and personal.indexed_sha and leftover > 0:
            personal_rows = (
                await database.scalars(
                    select(NoteIndex)
                    .where(
                        NoteIndex.layer == NoteLayer.PERSONAL.value,
                        NoteIndex.owner_user_id == user.id,
                        NoteIndex.revision_sha == personal.indexed_sha,
                        or_(
                            func.lower(NoteIndex.title).like(pattern),
                            func.lower(NoteIndex.path).like(pattern),
                            func.lower(NoteIndex.slug).like(pattern),
                        ),
                    )
                    .order_by(NoteIndex.title, NoteIndex.path)
                    .limit(leftover)
                )
            ).all()
            for note in personal_rows:
                path = f"personal:{note.path}"
                if path in seen or note.path in seen:
                    continue
                seen.add(path)
                hits.append({"path": path, "title": note.title})

    return {"query": trimmed, "hits": hits}
