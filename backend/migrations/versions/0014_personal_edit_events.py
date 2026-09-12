"""Personal in-app edits in rhizome_events, keyed by owner.

Revision ID: 0014_personal_edit_events
Revises: 0013_notify_prefs
Create Date: 2026-09-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_personal_edit_events"
down_revision: str | None = "0013_notify_prefs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "rhizome_events",
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
    )
    op.create_index("ix_rhizome_events_owner_user_id", "rhizome_events", ["owner_user_id"])
    op.create_foreign_key(
        "fk_rhizome_events_owner_user_id",
        "rhizome_events",
        "users",
        ["owner_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_rhizome_events_owner_user_id", "rhizome_events", type_="foreignkey")
    op.drop_index("ix_rhizome_events_owner_user_id", table_name="rhizome_events")
    op.drop_column("rhizome_events", "owner_user_id")
