"""Moderated comments on published rhizome cards.

Revision ID: 0010_note_comments
Revises: 0009_rhizome_events
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_note_comments"
down_revision: str | None = "0009_rhizome_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "note_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column("author_user_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_note_comments_path", "note_comments", ["path"])
    op.create_index("ix_note_comments_author_user_id", "note_comments", ["author_user_id"])
    op.create_index("ix_note_comments_status", "note_comments", ["status"])
    op.create_index("ix_note_comments_created_at", "note_comments", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_note_comments_created_at", table_name="note_comments")
    op.drop_index("ix_note_comments_status", table_name="note_comments")
    op.drop_index("ix_note_comments_author_user_id", table_name="note_comments")
    op.drop_index("ix_note_comments_path", table_name="note_comments")
    op.drop_table("note_comments")
