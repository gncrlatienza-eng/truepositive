"""Reports/Intel flat-design + empty-state revamp: reports.last_exported_at,
a real (never-fabricated) column set on an actual export.csv/export.pdf
call, backing the new Reports quick-stats "Last export" tile.

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column("last_exported_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reports", "last_exported_at")
