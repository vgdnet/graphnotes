"""Obsidian plugin: integration tokens, transfers, personal assets.

Revision ID: 0017_obsidian_integration
Revises: 0016_shared_notes
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_obsidian_integration"
down_revision: str | None = "0016_shared_notes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "personal_uploads",
        sa.Column(
            "object_version",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("replace(gen_random_uuid()::text, '-', '')"),
        ),
    )
    op.alter_column("personal_uploads", "object_version", server_default=None)

    op.create_table(
        "integration_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_integration_tokens_user_id", "integration_tokens", ["user_id"]
    )
    op.create_index(
        "ix_integration_tokens_expires_at", "integration_tokens", ["expires_at"]
    )

    op.create_table(
        "personal_assets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("object_version", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "path", name="uq_personal_assets_user_path"),
    )
    op.create_index("ix_personal_assets_user_id", "personal_assets", ["user_id"])

    op.create_table(
        "integration_transfers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_id", sa.Uuid(), nullable=True),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("files_applied", sa.Boolean(), nullable=False),
        sa.Column("operations", sa.JSON(), nullable=False),
        sa.Column("required_blobs", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("errors", sa.JSON(), nullable=False),
        sa.Column("index_revision", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
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
        "ix_integration_transfers_user_id", "integration_transfers", ["user_id"]
    )
    op.create_index(
        "ix_integration_transfers_state", "integration_transfers", ["state"]
    )
    op.create_index(
        "ix_integration_transfers_expires_at",
        "integration_transfers",
        ["expires_at"],
    )

    op.create_table(
        "integration_blobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("transfer_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("payload", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["transfer_id"], ["integration_transfers.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "transfer_id", "sha256", name="uq_integration_blobs_transfer_sha"
        ),
    )
    op.create_index(
        "ix_integration_blobs_transfer_id", "integration_blobs", ["transfer_id"]
    )
    op.create_index(
        "ix_integration_blobs_user_id", "integration_blobs", ["user_id"]
    )

    op.create_table(
        "integration_idempotency",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("route", sa.String(length=80), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("body_hash", sa.String(length=64), nullable=False),
        sa.Column("transfer_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["transfer_id"], ["integration_transfers.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "route",
            "key",
            name="uq_integration_idempotency_user_route_key",
        ),
    )
    op.create_index(
        "ix_integration_idempotency_user_id",
        "integration_idempotency",
        ["user_id"],
    )

    op.create_table(
        "integration_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_integration_snapshots_user_id", "integration_snapshots", ["user_id"]
    )
    op.create_index(
        "ix_integration_snapshots_expires_at",
        "integration_snapshots",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_table("integration_snapshots")
    op.drop_table("integration_idempotency")
    op.drop_table("integration_blobs")
    op.drop_table("integration_transfers")
    op.drop_table("personal_assets")
    op.drop_table("integration_tokens")
    op.drop_column("personal_uploads", "object_version")
