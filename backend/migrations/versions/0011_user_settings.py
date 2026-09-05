"""Required unique email and optional account contacts.

Revision ID: 0011_user_settings
Revises: 0010_note_comments
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_user_settings"
down_revision: str | None = "0010_note_comments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("telegram", sa.String(length=64), nullable=True))
    op.add_column(
        "users",
        sa.Column("phone_public", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("telegram_public", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("users", sa.Column("website", sa.String(length=300), nullable=True))
    op.execute(
        sa.text(
            "UPDATE users SET email = lower(username) || '@invalid.local' "
            "WHERE email IS NULL OR email = ''"
        )
    )
    op.alter_column("users", "email", existing_type=sa.String(length=320), nullable=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.alter_column("users", "email", existing_type=sa.String(length=320), nullable=True)
    op.drop_column("users", "website")
    op.drop_column("users", "telegram_public")
    op.drop_column("users", "phone_public")
    op.drop_column("users", "telegram")
    op.drop_column("users", "phone")
