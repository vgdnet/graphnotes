import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent


def record_audit_event(
    database: AsyncSession,
    *,
    action: str,
    actor_user_id: uuid.UUID | None = None,
    target_user_id: uuid.UUID | None = None,
    subject_username: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        action=action,
        actor_user_id=actor_user_id,
        target_user_id=target_user_id,
        subject_username=subject_username,
        details=details or {},
    )
    database.add(event)
    return event
