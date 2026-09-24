"""Last 30 card content revisions (TZ 2.94).

Revision ID: 0021_card_revisions
Revises: 0020_invites
Create Date: 2026-09-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_card_revisions"
down_revision: str | None = "0020_invites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "card_revisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("n", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name="fk_card_revisions_owner_user_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="fk_card_revisions_actor_user_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_card_revisions_path", "card_revisions", ["path"])
    op.create_index("ix_card_revisions_owner_user_id", "card_revisions", ["owner_user_id"])
    op.create_index("ix_card_revisions_actor_user_id", "card_revisions", ["actor_user_id"])
    op.create_index("ix_card_revisions_created_at", "card_revisions", ["created_at"])
    op.create_index(
        "ix_card_revisions_path_owner_created",
        "card_revisions",
        ["path", "owner_user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_card_revisions_path_owner_created", table_name="card_revisions")
    op.drop_index("ix_card_revisions_created_at", table_name="card_revisions")
    op.drop_index("ix_card_revisions_actor_user_id", table_name="card_revisions")
    op.drop_index("ix_card_revisions_owner_user_id", table_name="card_revisions")
    op.drop_index("ix_card_revisions_path", table_name="card_revisions")
    op.drop_table("card_revisions")
