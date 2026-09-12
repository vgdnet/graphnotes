from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.schemas.auth import normalize_username
from app.services.audit import record_audit_event


class AdminBootstrapError(RuntimeError):
    pass


async def bootstrap_admin(database: AsyncSession, username: str) -> User:
    normalized_username = normalize_username(username)
    users = (
        await database.scalars(select(User).order_by(User.id).with_for_update())
    ).all()
    target = next(
        (user for user in users if user.username == normalized_username),
        None,
    )
    if target is None:
        raise AdminBootstrapError(
            "user does not exist; register the account before bootstrapping it"
        )
    if not target.is_active:
        raise AdminBootstrapError("inactive user cannot be bootstrapped as admin")
    if target.role == UserRole.ADMIN.value:
        return target
    if any(
        user.role == UserRole.ADMIN.value and user.is_active
        for user in users
    ):
        raise AdminBootstrapError(
            "an active admin already exists; use the protected admin API"
        )

    previous_role = target.role
    target.role = UserRole.ADMIN.value
    record_audit_event(
        database,
        action="admin.bootstrap_succeeded",
        target_user_id=target.id,
        subject_username=target.username,
        details={"from": previous_role, "to": UserRole.ADMIN.value},
    )
    await database.commit()
    await database.refresh(target)
    return target
