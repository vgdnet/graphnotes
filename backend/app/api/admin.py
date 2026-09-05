import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import CurrentAdmin, DatabaseSession
from app.models.audit_event import AuditEvent
from app.models.auth_session import AuthSession
from app.models.github import SharedRepository
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminMailTestRequest,
    AdminMailTestResponse,
    AdminOperatorResponse,
    AdminPasswordSet,
    AdminSessionRevokeResponse,
    AdminUserCreate,
    AdminUserItem,
    AdminUserListResponse,
    AdminUserUpdate,
    AuditEventListResponse,
)
from app.schemas.auth import UserResponse
from app.schemas.contributions import AdminContributionsResponse
from app.services.audit import record_audit_event
from app.services.auth import hash_password
from app.services.contributions import list_admin_contributions
from app.services.mail import (
    MailDeliveryError,
    MailNotConfiguredError,
    send_plaintext_mail,
    smtp_configured,
    smtp_public_status,
    test_mail,
)

router = APIRouter(prefix="/admin", tags=["administration"])


def _public_audit_details(details: dict | None) -> dict:
    hidden = {"password", "password_hash", "token", "token_hash", "cookie", "secret"}
    clean: dict = {}
    for key, value in (details or {}).items():
        lowered = str(key).lower()
        if lowered in hidden or "password" in lowered or "token" in lowered:
            continue
        clean[key] = value
    return clean


async def _active_admins(database) -> list[User]:
    return list(
        (
            await database.scalars(
                select(User)
                .where(
                    User.role == UserRole.ADMIN.value,
                    User.is_active.is_(True),
                )
                .order_by(User.id)
                .with_for_update()
            )
        ).all()
    )


def _admin_user_item(user: User, session_count: int) -> AdminUserItem:
    payload = UserResponse.model_validate(user).model_dump()
    payload["session_count"] = session_count
    return AdminUserItem.model_validate(payload)


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    _: CurrentAdmin,
    database: DatabaseSession,
    q: Annotated[str | None, Query(max_length=80)] = None,
    role: Annotated[UserRole | None, Query()] = None,
    is_active: Annotated[bool | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 80,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUserListResponse:
    query = select(User)
    count_query = select(func.count()).select_from(User)
    if q:
        needle = f"%{q.strip()}%"
        match = or_(
            User.username.ilike(needle),
            User.email.ilike(needle),
            User.display_name.ilike(needle),
        )
        query = query.where(match)
        count_query = count_query.where(match)
    if role is not None:
        query = query.where(User.role == role.value)
        count_query = count_query.where(User.role == role.value)
    if is_active is not None:
        query = query.where(User.is_active.is_(is_active))
        count_query = count_query.where(User.is_active.is_(is_active))
    total = int(await database.scalar(count_query) or 0)
    users = (
        await database.scalars(
            query.order_by(User.username, User.id).limit(limit).offset(offset)
        )
    ).all()
    session_counts: dict[uuid.UUID, int] = {}
    if users:
        rows = (
            await database.execute(
                select(AuthSession.user_id, func.count())
                .where(
                    AuthSession.user_id.in_([user.id for user in users]),
                    AuthSession.expires_at > datetime.now(UTC),
                )
                .group_by(AuthSession.user_id)
            )
        ).all()
        session_counts = {user_id: count for user_id, count in rows}
    return AdminUserListResponse(
        users=[_admin_user_item(user, session_counts.get(user.id, 0)) for user in users],
        total=total,
    )


@router.post("/users", response_model=AdminUserItem, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate,
    admin: CurrentAdmin,
    database: DatabaseSession,
) -> AdminUserItem:
    taken_email = await database.scalar(select(User.id).where(User.email == payload.email))
    if taken_email is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email is already registered",
        )
    taken_username = await database.scalar(
        select(User.id).where(User.username == payload.username)
    )
    if taken_username is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="username is already registered",
        )
    now = datetime.now(UTC)
    user = User(
        username=payload.username,
        password_hash=await run_in_threadpool(hash_password, payload.password),
        email=payload.email,
        display_name=payload.display_name,
        role=payload.role.value,
        is_active=payload.is_active,
        email_verified_at=now,
    )
    database.add(user)
    await database.flush()
    record_audit_event(
        database,
        action="admin.user_created",
        actor_user_id=admin.id,
        target_user_id=user.id,
        subject_username=user.username,
        details={"role": user.role, "is_active": user.is_active},
    )
    await database.commit()
    await database.refresh(user)
    return _admin_user_item(user, 0)


@router.get("/contributions", response_model=AdminContributionsResponse)
async def list_contributions(
    _: CurrentAdmin,
    database: DatabaseSession,
) -> AdminContributionsResponse:
    body = await list_admin_contributions(database)
    return AdminContributionsResponse.model_validate(body)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    admin: CurrentAdmin,
    database: DatabaseSession,
) -> User:
    active_admins = await _active_admins(database)
    target = next((user for user in active_admins if user.id == user_id), None)
    if target is None:
        target = await database.scalar(
            select(User).where(User.id == user_id).with_for_update()
        )
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not found",
        )

    next_role = payload.role.value if payload.role is not None else target.role
    next_is_active = (
        payload.is_active if payload.is_active is not None else target.is_active
    )
    removes_active_admin = (
        target.role == UserRole.ADMIN.value
        and target.is_active
        and (next_role != UserRole.ADMIN.value or not next_is_active)
    )
    if removes_active_admin:
        if len(active_admins) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="the last active admin cannot be demoted or blocked",
            )

    if next_role != target.role:
        previous_role = target.role
        target.role = next_role
        record_audit_event(
            database,
            action="admin.user_role_changed",
            actor_user_id=admin.id,
            target_user_id=target.id,
            subject_username=target.username,
            details={"from": previous_role, "to": next_role},
        )

    if next_is_active != target.is_active:
        previous_is_active = target.is_active
        target.is_active = next_is_active
        record_audit_event(
            database,
            action="admin.user_active_changed",
            actor_user_id=admin.id,
            target_user_id=target.id,
            subject_username=target.username,
            details={"from": previous_is_active, "to": next_is_active},
        )
        if not next_is_active:
            await database.execute(
                delete(AuthSession).where(AuthSession.user_id == target.id)
            )

    await database.commit()
    await database.refresh(target)
    return target


@router.post("/users/{user_id}/password", response_model=UserResponse)
async def set_user_password(
    user_id: uuid.UUID,
    payload: AdminPasswordSet,
    admin: CurrentAdmin,
    database: DatabaseSession,
) -> User:
    target = await database.get(User, user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not found",
        )
    target.password_hash = await run_in_threadpool(hash_password, payload.password)
    await database.execute(delete(AuthSession).where(AuthSession.user_id == target.id))
    record_audit_event(
        database,
        action="admin.user_password_set",
        actor_user_id=admin.id,
        target_user_id=target.id,
        subject_username=target.username,
        details={},
    )
    await database.commit()
    await database.refresh(target)
    return target


@router.post(
    "/users/{user_id}/sessions/revoke",
    response_model=AdminSessionRevokeResponse,
)
async def revoke_user_sessions(
    user_id: uuid.UUID,
    admin: CurrentAdmin,
    database: DatabaseSession,
) -> AdminSessionRevokeResponse:
    target = await database.get(User, user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not found",
        )
    result = await database.execute(
        delete(AuthSession).where(AuthSession.user_id == target.id)
    )
    revoked = int(result.rowcount or 0)
    record_audit_event(
        database,
        action="admin.user_sessions_revoked",
        actor_user_id=admin.id,
        target_user_id=target.id,
        subject_username=target.username,
        details={"revoked": revoked},
    )
    await database.commit()
    return AdminSessionRevokeResponse(revoked=revoked, user_id=target.id)


@router.get("/audit", response_model=AuditEventListResponse)
async def list_audit_events(
    _: CurrentAdmin,
    database: DatabaseSession,
    action: Annotated[str | None, Query(max_length=64)] = None,
    actor: Annotated[str | None, Query(max_length=80)] = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
    since: Annotated[datetime | None, Query()] = None,
    until: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 80,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditEventListResponse:
    query = select(AuditEvent)
    count_query = select(func.count()).select_from(AuditEvent)
    if action:
        query = query.where(AuditEvent.action == action)
        count_query = count_query.where(AuditEvent.action == action)
    if q:
        needle = f"%{q.strip()}%"
        match = or_(
            AuditEvent.action.ilike(needle),
            AuditEvent.subject_username.ilike(needle),
        )
        query = query.where(match)
        count_query = count_query.where(match)
    if since is not None:
        query = query.where(AuditEvent.created_at >= since)
        count_query = count_query.where(AuditEvent.created_at >= since)
    if until is not None:
        query = query.where(AuditEvent.created_at <= until)
        count_query = count_query.where(AuditEvent.created_at <= until)
    if actor:
        actor_match = select(User.id).where(
            or_(User.username.ilike(f"%{actor.strip()}%"), User.email == actor.casefold())
        )
        try:
            actor_id = uuid.UUID(actor)
        except ValueError:
            actor_id = None
        if actor_id is not None:
            query = query.where(
                or_(AuditEvent.actor_user_id == actor_id, AuditEvent.actor_user_id.in_(actor_match))
            )
            count_query = count_query.where(
                or_(AuditEvent.actor_user_id == actor_id, AuditEvent.actor_user_id.in_(actor_match))
            )
        else:
            query = query.where(AuditEvent.actor_user_id.in_(actor_match))
            count_query = count_query.where(AuditEvent.actor_user_id.in_(actor_match))
    total = int(await database.scalar(count_query) or 0)
    rows = (
        await database.scalars(
            query.order_by(AuditEvent.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    actor_ids = {row.actor_user_id for row in rows if row.actor_user_id}
    actors: dict[uuid.UUID, str] = {}
    if actor_ids:
        found = (
            await database.execute(select(User.id, User.username).where(User.id.in_(actor_ids)))
        ).all()
        actors = {user_id: username for user_id, username in found}
    return AuditEventListResponse(
        events=[
            {
                "id": row.id,
                "action": row.action,
                "actor_user_id": row.actor_user_id,
                "actor_username": actors.get(row.actor_user_id) if row.actor_user_id else None,
                "target_user_id": row.target_user_id,
                "subject_username": row.subject_username,
                "details": _public_audit_details(row.details),
                "created_at": row.created_at,
            }
            for row in rows
        ],
        total=total,
    )


@router.get("/operator", response_model=AdminOperatorResponse)
async def operator_status(
    _: CurrentAdmin,
    database: DatabaseSession,
) -> AdminOperatorResponse:
    health = {"status": "ok", "database": "reachable"}
    try:
        await database.scalar(select(func.count()).select_from(User))
    except Exception:
        health = {"status": "degraded", "database": "unavailable"}
    shared = await database.scalar(select(SharedRepository).limit(1))
    shared_body = None
    if shared is not None:
        shared_body = {
            "connected": True,
            "owner": shared.owner,
            "name": shared.name,
            "status": shared.sync_status,
            "index_status": shared.index_status,
        }
    smtp = smtp_public_status()
    return AdminOperatorResponse(
        smtp=smtp,
        health=health,
        shared_repository=shared_body,
        public_base_url=smtp.get("public_base_url") if isinstance(smtp, dict) else None,
    )


@router.post("/mail/test", response_model=AdminMailTestResponse)
async def send_test_mail(
    payload: AdminMailTestRequest,
    admin: CurrentAdmin,
    database: DatabaseSession,
) -> AdminMailTestResponse:
    if not smtp_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP is not configured",
        )
    subject, body = test_mail(payload.to)
    try:
        await run_in_threadpool(
            send_plaintext_mail,
            to_address=payload.to,
            subject=subject,
            body=body,
        )
    except (MailNotConfiguredError, MailDeliveryError) as exc:
        record_audit_event(
            database,
            action="mail.test_failed",
            actor_user_id=admin.id,
            subject_username=admin.username,
            details={"to_domain": payload.to.rsplit("@", 1)[-1]},
        )
        await database.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP delivery failed",
        ) from exc
    record_audit_event(
        database,
        action="mail.test_sent",
        actor_user_id=admin.id,
        subject_username=admin.username,
        details={"to_domain": payload.to.rsplit("@", 1)[-1]},
    )
    await database.commit()
    return AdminMailTestResponse(sent=True, to=payload.to)
