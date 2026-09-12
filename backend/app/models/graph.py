import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class NoteLayer(str, enum.Enum):
    SHARED = "shared"
    PERSONAL = "personal"
    PROPOSAL = "proposal"


class SyncJobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    READY = "ready"
    ERROR = "error"


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)


class NoteIndex(Base):
    __tablename__ = "note_index"
    __table_args__ = (
        UniqueConstraint("index_key", name="uq_note_index_key"),
        CheckConstraint(
            "layer IN ('shared', 'personal', 'proposal')",
            name="ck_note_index_layer",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    index_key: Mapped[str] = mapped_column(String(420), unique=True)
    layer: Mapped[str] = mapped_column(String(16), index=True)
    revision_sha: Mapped[str] = mapped_column(String(40), index=True)
    path: Mapped[str] = mapped_column(String(180))
    slug: Mapped[str] = mapped_column(String(180))
    title: Mapped[str] = mapped_column(String(200))
    content_hash: Mapped[str] = mapped_column(String(64))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    proposal_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    links_from: Mapped[list["NoteLink"]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
        foreign_keys="NoteLink.source_id",
    )
    tag_links: Mapped[list["NoteTag"]] = relationship(
        back_populates="note",
        cascade="all, delete-orphan",
    )


class NoteLink(Base):
    __tablename__ = "note_links"
    __table_args__ = (
        CheckConstraint(
            "link_type IN ('wikilink', 'markdown')",
            name="ck_note_links_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("note_index.id", ondelete="CASCADE"),
        index=True,
    )
    target_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("note_index.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    target_raw: Mapped[str] = mapped_column(String(200))
    link_type: Mapped[str] = mapped_column(String(16))
    unresolved: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[NoteIndex] = relationship(
        back_populates="links_from",
        foreign_keys=[source_id],
    )


class NoteTag(Base):
    __tablename__ = "note_tags"
    __table_args__ = (
        UniqueConstraint("note_id", "tag_id", name="uq_note_tags_note_tag"),
    )

    note_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("note_index.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )
    note: Mapped[NoteIndex] = relationship(back_populates="tag_links")
    tag: Mapped[Tag] = relationship()


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    layer: Mapped[str] = mapped_column(String(16), index=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    proposal_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True
    )
    revision_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=SyncJobStatus.PENDING.value)
    error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
