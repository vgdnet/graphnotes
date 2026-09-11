"""Invite-only accounts and @efimov cutover attribution.

Revision ID: 0020_invites
Revises: 0019_integration_token_secret
Create Date: 2026-09-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_invites"
down_revision: str | None = "0019_integration_token_secret"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("invited_by_id", sa.Uuid(), nullable=True))
    op.add_column("users", sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_invited_by_id", "users", ["invited_by_id"])
    op.create_foreign_key(
        "fk_users_invited_by_id",
        "users",
        "users",
        ["invited_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "invites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("inviter_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["inviter_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["accepted_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invites_inviter_id", "invites", ["inviter_id"])
    op.create_index("ix_invites_email", "invites", ["email"])
    op.create_index("ix_invites_token_hash", "invites", ["token_hash"], unique=True)
    op.create_index("ix_invites_expires_at", "invites", ["expires_at"])
    # Idempotent cutover: every existing account except the real @efimov row
    # is attributed to that inviter. No-op when `efimov` is missing.
    op.execute(
        """
        UPDATE users AS u
        SET invited_by_id = e.id,
            invited_at = COALESCE(u.invited_at, u.created_at)
        FROM users AS e
        WHERE e.username = 'efimov'
          AND u.id <> e.id
          AND u.invited_by_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_invites_expires_at", table_name="invites")
    op.drop_index("ix_invites_token_hash", table_name="invites")
    op.drop_index("ix_invites_email", table_name="invites")
    op.drop_index("ix_invites_inviter_id", table_name="invites")
    op.drop_table("invites")
    op.drop_constraint("fk_users_invited_by_id", "users", type_="foreignkey")
    op.drop_index("ix_users_invited_by_id", table_name="users")
    op.drop_column("users", "invited_at")
    op.drop_column("users", "invited_by_id")
