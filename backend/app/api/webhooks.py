import hashlib
import hmac
import json

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select

from app.api.dependencies import DatabaseSession
from app.core.config import settings
from app.models.github import GitHubWebhookDelivery, PersonalRepository, SharedRepository
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.index import rebuild_personal, rebuild_shared
from app.services.proposal import reconcile_proposals
from app.services.repository import apply_error, apply_snapshot

router = APIRouter(tags=["webhooks"])


def _valid_signature(secret: str, payload: bytes, signature: str | None) -> bool:
    if not signature or not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/webhooks/github", status_code=status.HTTP_202_ACCEPTED)
async def github_webhook(
    request: Request,
    database: DatabaseSession,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_delivery: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
) -> dict[str, str]:
    if not settings.github_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="webhook is not configured",
        )
    body = await request.body()
    if not _valid_signature(settings.github_webhook_secret, body, x_hub_signature_256):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid webhook signature",
        )
    if not x_github_delivery:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="missing delivery id",
        )

    existing = await database.scalar(
        select(GitHubWebhookDelivery).where(
            GitHubWebhookDelivery.delivery_id == x_github_delivery
        )
    )
    if existing is not None:
        return {"status": "duplicate"}

    database.add(
        GitHubWebhookDelivery(
            delivery_id=x_github_delivery,
            event=x_github_event or "unknown",
        )
    )
    await database.flush()

    if x_github_event == "push":
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid webhook payload",
            ) from exc
        await _refresh_from_push(database, payload)

    await database.commit()
    return {"status": "accepted"}


async def _refresh_from_push(database: DatabaseSession, payload: dict[str, object]) -> None:
    repository = payload.get("repository")
    if not isinstance(repository, dict):
        return
    node_id = str(repository.get("node_id") or "")
    if not node_id:
        return
    client = GitHubAppClient()
    shared = await database.scalar(
        select(SharedRepository).where(SharedRepository.github_node_id == node_id)
    )
    personal = await database.scalar(
        select(PersonalRepository).where(PersonalRepository.github_node_id == node_id)
    )
    target = shared or personal
    if target is None:
        return
    try:
        snapshot = await client.get_repository(target.owner, target.name)
        apply_snapshot(target, snapshot)
        if shared is not None:
            await rebuild_shared(database, client)
            await reconcile_proposals(database, client)
        elif personal is not None:
            await rebuild_personal(database, personal.user_id, client)
    except GitHubAppError as exc:
        apply_error(target, exc)
