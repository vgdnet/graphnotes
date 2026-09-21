import hashlib
import hmac

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select

from app.api.dependencies import DatabaseSession
from app.core.config import settings
from app.models.github import GitHubWebhookDelivery

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
        # Leftover GitHub knowledge webhook (TZ 3.37). Record delivery only.
        # Do not copy-in or rebuild from GitHub — that would overwrite stores.
        pass

    await database.commit()
    return {"status": "accepted"}
