"""SMTP email tokens, verified-at and last login.

Revision ID: 0012_smtp_admin
Revises: 0011_user_settings
Create Date: 2026-09-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_smtp_admin"
down_revision: str | None = "0011_user_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(sa.text("UPDATE users SET email_verified_at = created_at"))
    op.create_table(
        "email_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("purpose", sa.String(length=16), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_tokens_user_id", "email_tokens", ["user_id"])
    op.create_index("ix_email_tokens_purpose", "email_tokens", ["purpose"])
    op.create_index("ix_email_tokens_token_hash", "email_tokens", ["token_hash"], unique=True)
    op.create_index("ix_email_tokens_code_hash", "email_tokens", ["code_hash"])
    op.create_index("ix_email_tokens_expires_at", "email_tokens", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_email_tokens_expires_at", table_name="email_tokens")
    op.drop_index("ix_email_tokens_code_hash", table_name="email_tokens")
    op.drop_index("ix_email_tokens_token_hash", table_name="email_tokens")
    op.drop_index("ix_email_tokens_purpose", table_name="email_tokens")
    op.drop_index("ix_email_tokens_user_id", table_name="email_tokens")
    op.drop_table("email_tokens")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "email_verified_at")
