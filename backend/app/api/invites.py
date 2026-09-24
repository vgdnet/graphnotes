from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import CurrentUser, DatabaseSession
from app.core.config import settings
from app.schemas.invites import (
    InviteCreateRequest,
    InviteCreateResponse,
    InviteItem,
    InviteListResponse,
)
from app.services.audit import record_audit_event
from app.services.installation import resolve_public_base_url
from app.services.invites import (
    InviteError,
    issue_invite,
    list_pending_invites,
    revoke_invite,
)
from app.services.mail import (
    MailDeliveryError,
    MailNotConfiguredError,
    invite_mail,
    send_plaintext_mail,
    smtp_configured,
)

router = APIRouter(prefix="/invites", tags=["invites"])


def _http(exc: InviteError) -> HTTPException:
    headers = {"Retry-After": "60"} if exc.status_code == 429 else None
    return HTTPException(status_code=exc.status_code, detail=exc.detail, headers=headers)


@router.get("", response_model=InviteListResponse)
async def my_invites(user: CurrentUser, database: DatabaseSession) -> InviteListResponse:
    rows = await list_pending_invites(database, user)
    return InviteListResponse(
        invites=[
            InviteItem(
                id=row.id,
                email=row.email,
                expires_at=row.expires_at,
                created_at=row.created_at,
            )
            for row in rows
        ]
    )


@router.post("", response_model=InviteCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    payload: InviteCreateRequest,
    user: CurrentUser,
    database: DatabaseSession,
) -> InviteCreateResponse:
    if not smtp_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP is not configured",
        )
    try:
        invite, token = await issue_invite(database, user, payload.email)
    except InviteError as exc:
        record_audit_event(
            database,
            action="invite.create_failed",
            actor_user_id=user.id,
            subject_username=user.username,
            details={"reason": exc.detail},
        )
        await database.commit()
        raise _http(exc) from exc
    base = await resolve_public_base_url(database)
    subject, body = invite_mail(
        email=invite.email,
        token=token,
        inviter_username=user.username,
        ttl_days=settings.invite_ttl_days,
        public_base_url=base,
    )
    try:
        await run_in_threadpool(
            send_plaintext_mail,
            to_address=invite.email,
            subject=subject,
            body=body,
        )
    except (MailNotConfiguredError, MailDeliveryError) as exc:
        await database.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="invite mail could not be sent",
        ) from exc
    record_audit_event(
        database,
        action="invite.created",
        actor_user_id=user.id,
        subject_username=user.username,
        details={"invite_id": str(invite.id)},
    )
    await database.commit()
    return InviteCreateResponse(id=invite.id, email=invite.email, expires_at=invite.expires_at)


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invite(
    invite_id: UUID,
    user: CurrentUser,
    database: DatabaseSession,
    response: Response,
) -> None:
    try:
        await revoke_invite(database, user, invite_id)
    except InviteError as exc:
        raise _http(exc) from exc
    record_audit_event(
        database,
        action="invite.revoked",
        actor_user_id=user.id,
        subject_username=user.username,
        details={"invite_id": str(invite_id)},
    )
    await database.commit()
    response.status_code = status.HTTP_204_NO_CONTENT
