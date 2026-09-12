"""Store GitHub shared and personal repository bindings.

Revision ID: 0003_github_bindings
Revises: 0002_password_auth
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_github_bindings"
down_revision: str | None = "0002_password_auth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shared_repository",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("github_node_id", sa.String(length=64), nullable=False),
        sa.Column("owner", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("default_branch", sa.String(length=255), nullable=False),
        sa.Column("html_url", sa.String(length=500), nullable=False),
        sa.Column("observed_sha", sa.String(length=40), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "sync_status",
            sa.String(length=32),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("last_error", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("id = 1", name="ck_shared_repository_singleton"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("github_node_id"),
    )
    op.create_table(
        "personal_repositories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("github_node_id", sa.String(length=64), nullable=False),
        sa.Column("owner", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("default_branch", sa.String(length=255), nullable=False),
        sa.Column("html_url", sa.String(length=500), nullable=False),
        sa.Column("observed_sha", sa.String(length=40), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "sync_status",
            sa.String(length=32),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("last_error", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("github_node_id", name="uq_personal_repositories_node"),
    )
    op.create_table(
        "github_webhook_deliveries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("delivery_id", sa.String(length=64), nullable=False),
        sa.Column("event", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_github_webhook_deliveries_delivery_id",
        "github_webhook_deliveries",
        ["delivery_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_github_webhook_deliveries_delivery_id",
        table_name="github_webhook_deliveries",
    )
    op.drop_table("github_webhook_deliveries")
    op.drop_table("personal_repositories")
    op.drop_table("shared_repository")
