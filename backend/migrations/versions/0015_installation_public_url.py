"""Persisted public site URL for mail links.

Revision ID: 0015_installation_public_url
Revises: 0014_personal_edit_events
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_installation_public_url"
down_revision: str | None = "0014_personal_edit_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "installation_settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=500), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("key"),
    )
    op.execute(
        sa.text(
            "INSERT INTO installation_settings (key, value) "
            "VALUES ('public_base_url', 'https://rhizome.vsepsy.ru')"
        )
    )


def downgrade() -> None:
    op.drop_table("installation_settings")
