import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select

from app.api.dependencies import CurrentAdmin, DatabaseSession
from app.models.auth_session import AuthSession
from app.models.user import User, UserRole
from app.schemas.admin import AdminUserListResponse, AdminUserUpdate
from app.schemas.auth import UserResponse
from app.schemas.contributions import AdminContributionsResponse
from app.services.audit import record_audit_event
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
