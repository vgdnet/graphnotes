"""Local working copy of published shared Markdown.

Revision ID: 0016_shared_notes
Revises: 0015_installation_public_url
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_shared_notes"
down_revision: str | None = "0015_installation_public_url"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shared_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("path", name="uq_shared_notes_path"),
    )


def downgrade() -> None:
    op.drop_table("shared_notes")
