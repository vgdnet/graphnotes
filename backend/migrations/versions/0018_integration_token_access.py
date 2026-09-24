"""Six-month plugin token access log (who / from where / which token).

Revision ID: 0018_integration_token_access
Revises: 0017_obsidian_integration
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_integration_token_access"
down_revision: str | None = "0017_obsidian_integration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "integration_token_access",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_id", sa.Uuid(), nullable=True),
        sa.Column("username", sa.String(length=32), nullable=False),
        sa.Column("token_name", sa.String(length=80), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("user_agent", sa.String(length=300), nullable=False),
        sa.Column("route", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["token_id"], ["integration_tokens.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_integration_token_access_user_id",
        "integration_token_access",
        ["user_id"],
    )
    op.create_index(
        "ix_integration_token_access_token_id",
        "integration_token_access",
        ["token_id"],
    )
    op.create_index(
        "ix_integration_token_access_created_at",
        "integration_token_access",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_table("integration_token_access")
