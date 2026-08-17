"""Create the Stage 1 migration baseline.

Revision ID: 0001_bootstrap
Revises:
Create Date: 2026-08-17
"""

from collections.abc import Sequence

revision: str = "0001_bootstrap"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Establish an Alembic head before domain tables are introduced."""


def downgrade() -> None:
    """Remove the empty Stage 1 baseline."""
