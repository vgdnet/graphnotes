"""Store editor proposal queue metadata. Canonical Markdown stays in Git.

Revision ID: 0005_proposals
Revises: 0004_graph_index
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_proposals"
down_revision: str | None = "0004_graph_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "proposals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("author_user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("summary", sa.String(length=200), nullable=False),
        sa.Column("scope_paths", sa.Text(), nullable=False),
        sa.Column("branch_name", sa.String(length=80), nullable=False),
        sa.Column("base_sha", sa.String(length=40), nullable=False),
        sa.Column("head_sha", sa.String(length=40), nullable=False),
        sa.Column("merged_sha", sa.String(length=40), nullable=True),
        sa.Column("previous_sha", sa.String(length=40), nullable=True),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("error", sa.String(length=255), nullable=True),
        sa.Column("decided_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('open', 'accepted_pending_merge', 'merged_indexing', "
            "'published', 'rejected', 'changes_requested', 'conflicted', 'failed')",
            name="ck_proposals_status",
        ),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_proposals_author_user_id", "proposals", ["author_user_id"])
    op.create_index("ix_proposals_status", "proposals", ["status"])


def downgrade() -> None:
    op.drop_index("ix_proposals_status", table_name="proposals")
    op.drop_index("ix_proposals_author_user_id", table_name="proposals")
    op.drop_table("proposals")
