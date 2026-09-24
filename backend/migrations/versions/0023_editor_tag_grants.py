"""Editor tag grants (TZ 3.21 / 3.28).

Revision ID: 0023_editor_tag_grants
Revises: 0022_inbound_differ
Create Date: 2026-09-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_editor_tag_grants"
down_revision: str | None = "0022_inbound_differ"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "editor_tags",
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "editor_tags")
