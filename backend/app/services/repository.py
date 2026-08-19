from datetime import UTC, datetime
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.github import PersonalRepository, SharedRepository
from app.models.user import User
from app.services.audit import record_audit_event
from app.services.github import GitHubAppClient, GitHubAppError, GitHubRepoSnapshot

OWNER_NAME_PATTERN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,38})$")
REPO_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
SHARED_SINGLETON_ID = 1


def published_sha(shared: SharedRepository | None) -> str | None:
    if shared is None:
        return None
    return shared.indexed_sha or shared.observed_sha

STATUS_LABELS = {
    "ready": "connected",
    "empty": "waiting_for_notes",
    "pending": "pending",
    "rate_limited": "temporarily_unavailable",
    "unavailable": "unavailable",
    "not_found": "not_visible",
    "error": "error",
}


class RepositoryBindError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def normalize_owner_name(owner: str, name: str) -> tuple[str, str]:
    owner = owner.strip()
    name = name.strip().removesuffix(".git")
    if not OWNER_NAME_PATTERN.fullmatch(owner) or not REPO_NAME_PATTERN.fullmatch(name):
        raise RepositoryBindError(400, "repository identity is invalid")
    if owner.lower() in {"github.com", "www.github.com", "http", "https"}:
        raise RepositoryBindError(400, "repository identity is invalid")
    return owner, name


def parse_repository_ref(value: str) -> tuple[str, str]:
    text = value.strip()
    text = text.removeprefix("https://github.com/")
    text = text.removeprefix("http://github.com/")
    text = text.removeprefix("git@github.com:")
    text = text.removesuffix(".git")
    if text.count("/") != 1:
        raise RepositoryBindError(400, "use owner/name for the git repository")
    owner, name = text.split("/", 1)
    return normalize_owner_name(owner, name)


def _status_from_snapshot(snapshot: GitHubRepoSnapshot) -> str:
    return "empty" if snapshot.sha is None else "ready"


def apply_snapshot(target: SharedRepository | PersonalRepository, snapshot: GitHubRepoSnapshot) -> None:
    target.github_node_id = snapshot.node_id
    target.owner = snapshot.owner
    target.name = snapshot.name
    target.default_branch = snapshot.default_branch
    target.html_url = snapshot.html_url
    target.observed_sha = snapshot.sha
    target.observed_at = datetime.now(UTC)
    target.sync_status = _status_from_snapshot(snapshot)
    target.last_error = None


def apply_error(target: SharedRepository | PersonalRepository, error: GitHubAppError) -> None:
    target.sync_status = error.status
    target.last_error = error.message[:255]
    target.observed_at = datetime.now(UTC)


def _index_status_label(observed_sha: str | None, indexed_sha: str | None, index_status: str) -> str:
    if not observed_sha:
        return "empty"
    if index_status == "error":
        return "error"
    if indexed_sha == observed_sha:
        return "current"
    return "updating"


def public_status(row: SharedRepository | PersonalRepository | None) -> dict[str, object] | None:
    if row is None:
        return None
    return {
        "connected": True,
        "owner": row.owner,
        "name": row.name,
        "status": STATUS_LABELS.get(row.sync_status, row.sync_status),
        "has_content": bool(row.observed_sha),
        "index_status": _index_status_label(
            row.observed_sha,
            getattr(row, "indexed_sha", None),
            getattr(row, "index_status", "pending"),
        ),
        "updated_at": row.observed_at,
    }


async def connect_shared_repository(
    database: AsyncSession,
    *,
    admin: User,
    client: GitHubAppClient,
) -> SharedRepository:
    owner = settings.github_shared_owner
    name = settings.github_shared_name
    try:
        snapshot = await client.get_repository(owner, name)
    except GitHubAppError as exc:
        raise RepositoryBindError(
            503 if exc.status in {"unavailable", "rate_limited"} else 400,
            exc.message,
        ) from exc

    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None:
        row = SharedRepository(id=SHARED_SINGLETON_ID)
        database.add(row)
    apply_snapshot(row, snapshot)
    record_audit_event(
        database,
        action="repository.shared_connected",
        actor_user_id=admin.id,
        details={"owner": snapshot.owner, "name": snapshot.name},
    )
    await database.commit()
    await database.refresh(row)
    return row


async def connect_personal_repository(
    database: AsyncSession,
    *,
    user: User,
    repository: str,
    client: GitHubAppClient,
) -> PersonalRepository:
    owner, name = parse_repository_ref(repository)
    if (
        owner.casefold() == settings.github_shared_owner.casefold()
        and name.casefold() == settings.github_shared_name.casefold()
    ):
        raise RepositoryBindError(400, "the shared rhizome cannot be used as a personal git")

    try:
        snapshot = await client.get_repository(owner, name)
    except GitHubAppError as exc:
        status_code = {
            "not_found": 404,
            "unavailable": 503,
            "rate_limited": 503,
        }.get(exc.status, 400)
        raise RepositoryBindError(status_code, exc.message) from exc

    existing = await database.scalar(
        select(PersonalRepository).where(
            PersonalRepository.github_node_id == snapshot.node_id
        )
    )
    if existing is not None and existing.user_id != user.id:
        raise RepositoryBindError(409, "this git is already connected to another account")

    row = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user.id)
    )
    if row is None:
        row = PersonalRepository(user_id=user.id)
        database.add(row)
    apply_snapshot(row, snapshot)
    record_audit_event(
        database,
        action="repository.personal_connected",
        actor_user_id=user.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"owner": snapshot.owner, "name": snapshot.name},
    )
    await database.commit()
    await database.refresh(row)
    return row


async def refresh_shared(database: AsyncSession, client: GitHubAppClient) -> SharedRepository | None:
    row = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    if row is None:
        return None
    try:
        snapshot = await client.get_repository(row.owner, row.name)
        apply_snapshot(row, snapshot)
    except GitHubAppError as exc:
        apply_error(row, exc)
    await database.commit()
    await database.refresh(row)
    return row


async def refresh_personal(
    database: AsyncSession,
    user_id,
    client: GitHubAppClient,
) -> PersonalRepository | None:
    row = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.user_id == user_id)
    )
    if row is None:
        return None
    try:
        snapshot = await client.get_repository(row.owner, row.name)
        apply_snapshot(row, snapshot)
    except GitHubAppError as exc:
        apply_error(row, exc)
    await database.commit()
    await database.refresh(row)
    return row
