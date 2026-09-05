"""Derived rhizome-card interaction events (no note bodies).

Revision ID: 0009_rhizome_events
Revises: 0008_closed_paths
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_rhizome_events"
down_revision: str | None = "0008_closed_paths"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rhizome_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("proposal_id", sa.Uuid(), nullable=True),
        sa.Column("other_path", sa.String(length=180), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rhizome_events_path", "rhizome_events", ["path"])
    op.create_index("ix_rhizome_events_kind", "rhizome_events", ["kind"])
    op.create_index("ix_rhizome_events_actor_user_id", "rhizome_events", ["actor_user_id"])
    op.create_index("ix_rhizome_events_proposal_id", "rhizome_events", ["proposal_id"])
    op.create_index("ix_rhizome_events_created_at", "rhizome_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_rhizome_events_created_at", table_name="rhizome_events")
    op.drop_index("ix_rhizome_events_proposal_id", table_name="rhizome_events")
    op.drop_index("ix_rhizome_events_actor_user_id", table_name="rhizome_events")
    op.drop_index("ix_rhizome_events_kind", table_name="rhizome_events")
    op.drop_index("ix_rhizome_events_path", table_name="rhizome_events")
    op.drop_table("rhizome_events")
