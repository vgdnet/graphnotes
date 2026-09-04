import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, select
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import CurrentAdmin, DatabaseSession
from app.models.audit_event import AuditEvent
from app.models.auth_session import AuthSession
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminPasswordSet,
    AdminUserListResponse,
    AdminUserUpdate,
    AuditEventListResponse,
)
from app.schemas.auth import UserResponse
from app.schemas.contributions import AdminContributionsResponse
from app.services.audit import record_audit_event
from app.services.auth import hash_password
from app.services.contributions import list_admin_contributions

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    _: CurrentAdmin,
    database: DatabaseSession,
) -> AdminUserListResponse:
    users = (
        await database.scalars(select(User).order_by(User.username, User.id))
    ).all()
    return AdminUserListResponse(users=list(users))


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
    active_admins = (
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


@router.get("/audit", response_model=AuditEventListResponse)
async def list_audit_events(
    _: CurrentAdmin,
    database: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 80,
) -> AuditEventListResponse:
    rows = (
        await database.scalars(
            select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
        )
    ).all()
    return AuditEventListResponse(
        events=[
            {
                "id": row.id,
                "action": row.action,
                "actor_user_id": row.actor_user_id,
                "target_user_id": row.target_user_id,
                "subject_username": row.subject_username,
                "details": _public_audit_details(row.details),
                "created_at": row.created_at,
            }
            for row in rows
        ]
    )


def _public_audit_details(details: dict | None) -> dict:
    hidden = {"password", "password_hash", "token", "token_hash", "cookie", "secret"}
    clean: dict = {}
    for key, value in (details or {}).items():
        lowered = str(key).lower()
        if lowered in hidden or "password" in lowered or "token" in lowered:
            continue
        clean[key] = value
    return clean
