import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    LargeBinary,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IntegrationToken(Base):
    __tablename__ = "integration_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    token_prefix: Mapped[str] = mapped_column(String(16))
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PersonalAsset(Base):
    """Binary personal attachments. Markdown stays in personal_uploads."""

    __tablename__ = "personal_assets"
    __table_args__ = (
        UniqueConstraint("user_id", "path", name="uq_personal_assets_user_path"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    path: Mapped[str] = mapped_column(String(180))
    kind: Mapped[str] = mapped_column(String(16))
    sha256: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    object_version: Mapped[str] = mapped_column(String(64), default=lambda: uuid.uuid4().hex)
    payload: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class IntegrationTransfer(Base):
    __tablename__ = "integration_transfers"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    token_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("integration_tokens.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    client_id: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(32), index=True)
    files_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    operations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    required_blobs: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    results: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    index_revision: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    result_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class IntegrationBlob(Base):
    __tablename__ = "integration_blobs"
    __table_args__ = (
        UniqueConstraint("transfer_id", "sha256", name="uq_integration_blobs_transfer_sha"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    transfer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("integration_transfers.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    sha256: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    payload: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class IntegrationIdempotency(Base):
    __tablename__ = "integration_idempotency"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "route",
            "key",
            name="uq_integration_idempotency_user_route_key",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    route: Mapped[str] = mapped_column(String(80))
    key: Mapped[str] = mapped_column(String(80))
    body_hash: Mapped[str] = mapped_column(String(64))
    transfer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("integration_transfers.id", ondelete="CASCADE"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class IntegrationSnapshot(Base):
    __tablename__ = "integration_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
