"""Write grants table: path, tag, prefix (TZ 3.30).

Revision ID: 0024_access_grants
Revises: 0023_editor_tag_grants
Create Date: 2026-09-16
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_access_grants"
down_revision: str | None = "0023_editor_tag_grants"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "access_grants",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("value", sa.String(length=180), nullable=False),
        sa.Column(
            "created_by",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
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
        sa.CheckConstraint(
            "kind IN ('path', 'tag', 'prefix')",
            name="ck_access_grants_kind",
        ),
        sa.UniqueConstraint(
            "user_id", "kind", "value", name="uq_access_grants_user_kind_value"
        ),
    )
    op.create_index("ix_access_grants_user_id", "access_grants", ["user_id"])
    grants = sa.table(
        "access_grants",
        sa.column("id", sa.Uuid(as_uuid=True)),
        sa.column("user_id", sa.Uuid(as_uuid=True)),
        sa.column("kind", sa.String),
        sa.column("value", sa.String),
        sa.column("created_by", sa.Uuid(as_uuid=True)),
    )
    users = sa.table(
        "users",
        sa.column("id", sa.Uuid(as_uuid=True)),
        sa.column("editor_tags", sa.JSON),
    )
    bind = op.get_bind()
    rows = bind.execute(sa.select(users.c.id, users.c.editor_tags)).all()
    for user_id, tags in rows:
        seen: set[str] = set()
        for raw in tags or []:
            name = str(raw).strip().casefold()[:80]
            if not name or name in seen:
                continue
            seen.add(name)
            bind.execute(
                grants.insert().values(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    kind="tag",
                    value=name,
                    created_by=None,
                )
            )


def downgrade() -> None:
    op.drop_index("ix_access_grants_user_id", table_name="access_grants")
    op.drop_table("access_grants")
