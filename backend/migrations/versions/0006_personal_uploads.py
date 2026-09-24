"""Unpublished personal-layer uploads without git.

Revision ID: 0006_personal_uploads
Revises: 0005_proposals
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_personal_uploads"
down_revision: str | None = "0005_proposals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "personal_uploads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "path", name="uq_personal_uploads_user_path"),
    )
    op.create_index("ix_personal_uploads_user_id", "personal_uploads", ["user_id"])
    op.create_table(
        "upload_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_upload_events_user_id", "upload_events", ["user_id"])
    op.create_index("ix_upload_events_created_at", "upload_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_upload_events_created_at", table_name="upload_events")
    op.drop_index("ix_upload_events_user_id", table_name="upload_events")
    op.drop_table("upload_events")
    op.drop_index("ix_personal_uploads_user_id", table_name="personal_uploads")
    op.drop_table("personal_uploads")
