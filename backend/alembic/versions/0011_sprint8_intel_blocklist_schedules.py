"""Sprint 8: whitelist_entries.kind for allow/block semantics +
report_schedules table for delivery config storage.

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add kind column to whitelist_entries.
    # "allow" = existing whitelist behaviour; "block" = new blocklist record.
    # Enforcement at the network level is out-of-scope (same honest-stub
    # pattern as Sprint 6 block_ip playbook action) -- the record is real,
    # the enforcement is documented as future work.
    op.add_column(
        "whitelist_entries",
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="allow"),
    )

    op.create_table(
        "report_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("report_type", sa.String(length=32), nullable=False),
        sa.Column("frequency", sa.String(length=32), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_report_schedules_org_id", "report_schedules", ["org_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_report_schedules_org_id", table_name="report_schedules")
    op.drop_table("report_schedules")
    op.drop_column("whitelist_entries", "kind")