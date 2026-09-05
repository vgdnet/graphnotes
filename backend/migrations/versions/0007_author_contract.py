"""Author legal contract acceptance on the user row.

Revision ID: 0007_author_contract
Revises: 0006_personal_uploads
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_author_contract"
down_revision: str | None = "0006_personal_uploads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_author",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "users",
        sa.Column("author_contract_version", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "author_contract_accepted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "author_contract_withdrawn_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "author_contract_withdrawn_at")
    op.drop_column("users", "author_contract_accepted_at")
    op.drop_column("users", "author_contract_version")
    op.drop_column("users", "is_author")
