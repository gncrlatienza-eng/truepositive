"""logs.source_id nullable — detach logs from deleted sources instead of blocking delete

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("logs", "source_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)


def downgrade() -> None:
    op.alter_column("logs", "source_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
