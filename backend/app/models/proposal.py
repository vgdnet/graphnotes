import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProposalStatus(str, enum.Enum):
    OPEN = "open"
    ACCEPTED_PENDING_MERGE = "accepted_pending_merge"
    MERGED_INDEXING = "merged_indexing"
    PUBLISHED = "published"
    REJECTED = "rejected"
    CHANGES_REQUESTED = "changes_requested"
    CONFLICTED = "conflicted"
    FAILED = "failed"


class Proposal(Base):
    __tablename__ = "proposals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'accepted_pending_merge', 'merged_indexing', "
            "'published', 'rejected', 'changes_requested', 'conflicted', 'failed')",
            name="ck_proposals_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    status: Mapped[str] = mapped_column(String(32), default=ProposalStatus.OPEN.value, index=True)
    summary: Mapped[str] = mapped_column(String(200))
    scope_paths: Mapped[str] = mapped_column(Text)
    branch_name: Mapped[str] = mapped_column(String(80))
    base_sha: Mapped[str] = mapped_column(String(40))
    head_sha: Mapped[str] = mapped_column(String(40))
    merged_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    previous_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
