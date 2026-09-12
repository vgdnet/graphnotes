"""Store derived graph index. Canonical Markdown stays in Git.

Revision ID: 0004_graph_index
Revises: 0003_github_bindings
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_graph_index"
down_revision: str | None = "0003_github_bindings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("shared_repository", sa.Column("indexed_sha", sa.String(length=40), nullable=True))
    op.add_column(
        "shared_repository",
        sa.Column("index_status", sa.String(length=32), nullable=False, server_default="pending"),
    )
    op.add_column("personal_repositories", sa.Column("indexed_sha", sa.String(length=40), nullable=True))
    op.add_column(
        "personal_repositories",
        sa.Column("index_status", sa.String(length=32), nullable=False, server_default="pending"),
    )
    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_tags_name", "tags", ["name"], unique=True)
    op.create_table(
        "note_index",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("index_key", sa.String(length=420), nullable=False),
        sa.Column("layer", sa.String(length=16), nullable=False),
        sa.Column("revision_sha", sa.String(length=40), nullable=False),
        sa.Column("path", sa.String(length=180), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column("proposal_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("layer IN ('shared', 'personal', 'proposal')", name="ck_note_index_layer"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("index_key", name="uq_note_index_key"),
    )
    op.create_index("ix_note_index_layer", "note_index", ["layer"])
    op.create_index("ix_note_index_revision_sha", "note_index", ["revision_sha"])
    op.create_index("ix_note_index_owner_user_id", "note_index", ["owner_user_id"])
    op.create_index("ix_note_index_proposal_id", "note_index", ["proposal_id"])
    op.create_index("ix_note_index_layer_owner_rev", "note_index", ["layer", "owner_user_id", "revision_sha"])
    op.create_table(
        "note_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column("target_raw", sa.String(length=200), nullable=False),
        sa.Column("link_type", sa.String(length=16), nullable=False),
        sa.Column("unresolved", sa.Boolean(), nullable=False),
        sa.CheckConstraint("link_type IN ('wikilink', 'markdown')", name="ck_note_links_type"),
        sa.ForeignKeyConstraint(["source_id"], ["note_index.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["note_index.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_note_links_source_id", "note_links", ["source_id"])
    op.create_index("ix_note_links_target_id", "note_links", ["target_id"])
    op.create_table(
        "note_tags",
        sa.Column("note_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["note_index.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("note_id", "tag_id"),
        sa.UniqueConstraint("note_id", "tag_id", name="uq_note_tags_note_tag"),
    )
    op.create_table(
        "sync_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("layer", sa.String(length=16), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column("proposal_id", sa.Uuid(), nullable=True),
        sa.Column("revision_sha", sa.String(length=40), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sync_jobs_layer", "sync_jobs", ["layer"])
    op.create_index("ix_sync_jobs_owner_user_id", "sync_jobs", ["owner_user_id"])
    op.create_index("ix_sync_jobs_status", "sync_jobs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_sync_jobs_status", table_name="sync_jobs")
    op.drop_index("ix_sync_jobs_owner_user_id", table_name="sync_jobs")
    op.drop_index("ix_sync_jobs_layer", table_name="sync_jobs")
    op.drop_table("sync_jobs")
    op.drop_table("note_tags")
    op.drop_index("ix_note_links_target_id", table_name="note_links")
    op.drop_index("ix_note_links_source_id", table_name="note_links")
    op.drop_table("note_links")
    op.drop_index("ix_note_index_layer_owner_rev", table_name="note_index")
    op.drop_index("ix_note_index_proposal_id", table_name="note_index")
    op.drop_index("ix_note_index_owner_user_id", table_name="note_index")
    op.drop_index("ix_note_index_revision_sha", table_name="note_index")
    op.drop_index("ix_note_index_layer", table_name="note_index")
    op.drop_table("note_index")
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_table("tags")
    op.drop_column("personal_repositories", "index_status")
    op.drop_column("personal_repositories", "indexed_sha")
    op.drop_column("shared_repository", "index_status")
    op.drop_column("shared_repository", "indexed_sha")
