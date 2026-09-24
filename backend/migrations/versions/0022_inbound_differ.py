"""Inbound Differ notices and card-change notify (TZ 3.13 / 3.15).

Revision ID: 0022_inbound_differ
Revises: 0021_card_revisions
Create Date: 2026-09-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_inbound_differ"
down_revision: str | None = "0021_card_revisions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "notify_card_changes",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.create_table(
        "inbound_notices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "path", name="uq_inbound_notices_user_path"),
    )
    op.create_index(
        op.f("ix_inbound_notices_user_id"),
        "inbound_notices",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_inbound_notices_user_id"), table_name="inbound_notices")
    op.drop_table("inbound_notices")
    op.drop_column("users", "notify_card_changes")
