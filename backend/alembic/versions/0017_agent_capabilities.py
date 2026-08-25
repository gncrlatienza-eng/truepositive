"""agents.event_log_reader_member / sysmon_installed / capabilities_checked_at
— real, agent-reported capability status, replacing onboarding's static
"Needs Administrator"/"Requires Sysmon installed" badges with what a specific
agent actually observed on its last heartbeat (see agent/tp_agent.py's
_check_capabilities). All nullable: NULL means "not reported yet," not
"false" — the frontend falls back to the old static badge in that case.

Revision ID: 0017
Revises: 0016
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("event_log_reader_member", sa.Boolean(), nullable=True))
    op.add_column("agents", sa.Column("sysmon_installed", sa.Boolean(), nullable=True))
    op.add_column("agents", sa.Column("capabilities_checked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("agents", "capabilities_checked_at")
    op.drop_column("agents", "sysmon_installed")
    op.drop_column("agents", "event_log_reader_member")
