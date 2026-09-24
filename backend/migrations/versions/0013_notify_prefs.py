"""Queue notification preferences.

Revision ID: 0013_notify_prefs
Revises: 0012_smtp_admin
Create Date: 2026-09-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_notify_prefs"
down_revision: str | None = "0012_smtp_admin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "notify_queue_email",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_queue_telegram",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "notify_queue_telegram")
    op.drop_column("users", "notify_queue_email")
