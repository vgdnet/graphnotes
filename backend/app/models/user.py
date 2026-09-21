import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, String, Uuid, false, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    USER = "user"
    EDITOR = "editor"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'editor', 'admin')",
            name="ck_users_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    telegram_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    notify_queue_email: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    notify_queue_telegram: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    notify_card_changes: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    website: Mapped[str | None] = mapped_column(String(300), nullable=True)
    role: Mapped[str] = mapped_column(String(16), default=UserRole.USER.value)
    editor_tags: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default=text("'[]'")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_author: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    author_contract_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    author_contract_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    author_contract_withdrawn_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    sessions: Mapped[list["AuthSession"]] = relationship(  # noqa: F821
        back_populates="user",
        cascade="all, delete-orphan",
    )


def can_see_queue(user: User) -> bool:
    """Today's coarse queue gate: global editor/admin. Not a per-card ACL."""
    return user.role in {UserRole.EDITOR.value, UserRole.ADMIN.value}


def can_propose_to_rhizome(user: User) -> bool:
    """Today's coarse offer gate: global `user` only.

    Not a forever per-role ACL. Later the object is per-card (propose vs
    write-shared vs moderate-queue). Paid content maker is still open.
    """
    return user.role == UserRole.USER.value
