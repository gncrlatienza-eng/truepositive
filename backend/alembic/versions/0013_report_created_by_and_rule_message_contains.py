"""Sprint 8 mockup-fidelity pass: reports.created_by (real "owner" column
for the Library tab) + alert_rules conditions gains message_contains at the
schema level only (JSONB conditions column already exists, no migration
needed for that part -- noted here for context).

Revision ID: 0013
Revises: 0012
Create Date: 2026-08-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reports", "created_by")
