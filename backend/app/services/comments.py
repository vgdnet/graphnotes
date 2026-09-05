from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import NoteComment
from app.models.github import PersonalRepository, SharedRepository
from app.models.personal_upload import PersonalUpload
from app.models.user import User, UserRole
from app.services.git_paths import PathError, normalize_git_path
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.repository import SHARED_SINGLETON_ID, refresh_personal, refresh_shared


class CommentError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _public(row: NoteComment, author: User) -> dict[str, object]:
    return {
        "id": row.id,
        "path": row.path,
        "body": row.body,
        "status": row.status,
        "created_at": row.created_at,
        "author": {
            "id": author.id,
            "username": author.username,
            "display_name": author.display_name,
        },
    }


async def _published_paths(database: AsyncSession, client: GitHubAppClient) -> set[str]:
    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None or not row.observed_sha:
        return set()
    try:
        return set(await client.list_markdown_files(row.owner, row.name, row.observed_sha))
    except GitHubAppError as exc:
        raise CommentError(502, exc.message) from exc


async def _viewer_personal_paths(
    database: AsyncSession, user: User, client: GitHubAppClient
) -> set[str]:
    row = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    if row is None or not row.observed_sha:
        uploads = (
            await database.scalars(
                select(PersonalUpload.path).where(PersonalUpload.user_id == user.id)
            )
        ).all()
        return set(uploads)
    try:
        return set(await client.list_markdown_files(row.owner, row.name, row.observed_sha))
    except GitHubAppError as exc:
        raise CommentError(502, exc.message) from exc


async def list_comments(
    database: AsyncSession,
    path: str,
    viewer: User | None,
) -> dict[str, object]:
    try:
        normalized = normalize_git_path(path)
    except PathError as exc:
        raise CommentError(400, str(exc)) from exc
    rows = (
        await database.scalars(
            select(NoteComment)
            .where(NoteComment.path == normalized)
            .order_by(NoteComment.created_at.asc())
        )
    ).all()
    editor = viewer is not None and viewer.role in {
        UserRole.EDITOR.value,
        UserRole.ADMIN.value,
    }
    visible = [
        row
        for row in rows
        if row.status == "approved" or editor or (viewer is not None and row.author_user_id == viewer.id)
    ]
    authors = {}
    ids = {row.author_user_id for row in visible}
    if ids:
        for user in (await database.scalars(select(User).where(User.id.in_(ids)))).all():
            authors[user.id] = user
    return {
        "comments": [
            _public(row, authors[row.author_user_id])
            for row in visible
            if row.author_user_id in authors
        ]
    }


async def create_comment(
    database: AsyncSession,
    *,
    user: User,
    path: str,
    body: str,
    client: GitHubAppClient,
) -> dict[str, object]:
    try:
        file_path = path.removeprefix("personal:")
        normalized = normalize_git_path(file_path)
    except PathError as exc:
        raise CommentError(400, str(exc)) from exc
    await refresh_shared(database, client)
    await refresh_personal(database, user.id, client)
    published = await _published_paths(database, client)
    personal = await _viewer_personal_paths(database, user, client)
    if normalized not in published and normalized not in personal:
        raise CommentError(404, "note was not found")
    text = body.strip()
    if not text:
        raise CommentError(400, "comment must not be blank")
    row = NoteComment(path=normalized, author_user_id=user.id, body=text, status="pending")
    database.add(row)
    await database.commit()
    await database.refresh(row)
    return _public(row, user)


async def moderate_comment(
    database: AsyncSession,
    *,
    editor: User,
    comment_id,
    status: str,
) -> dict[str, object]:
    if editor.role not in {UserRole.EDITOR.value, UserRole.ADMIN.value}:
        raise CommentError(403, "editor access required")
    if status not in {"approved", "rejected"}:
        raise CommentError(400, "status must be approved or rejected")
    row = await database.get(NoteComment, comment_id)
    if row is None:
        raise CommentError(404, "comment not found")
    if row.author_user_id == editor.id:
        raise CommentError(403, "you cannot moderate your own comment")
    row.status = status
    await database.commit()
    await database.refresh(row)
    author = await database.get(User, row.author_user_id)
    if author is None:
        raise CommentError(404, "comment not found")
    return _public(row, author)
