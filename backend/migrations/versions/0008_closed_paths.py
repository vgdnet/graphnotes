"""Derived closed-path flags for the personal corpus.

Revision ID: 0008_closed_paths
Revises: 0007_author_contract
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_closed_paths"
down_revision: str | None = "0007_author_contract"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "closed_paths",
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
        sa.UniqueConstraint("user_id", "path", name="uq_closed_paths_user_path"),
    )
    op.create_index("ix_closed_paths_user_id", "closed_paths", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_closed_paths_user_id", table_name="closed_paths")
    op.drop_table("closed_paths")
