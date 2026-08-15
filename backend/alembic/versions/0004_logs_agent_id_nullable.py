"""logs.agent_id nullable — detach logs from deleted agents instead of blocking delete

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("logs", "agent_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)


def downgrade() -> None:
    op.alter_column("logs", "agent_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
