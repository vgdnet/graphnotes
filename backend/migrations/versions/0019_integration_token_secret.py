"""Keep the personal plugin token so Settings can show it again.

Revision ID: 0019_integration_token_secret
Revises: 0018_integration_token_access
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_integration_token_secret"
down_revision: str | None = "0018_integration_token_access"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "integration_tokens",
        sa.Column("token", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("integration_tokens", "token")
