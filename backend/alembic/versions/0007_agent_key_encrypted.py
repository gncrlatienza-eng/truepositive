"""agents.agent_key_encrypted — reversible copy of the enrollment key, kept
only while enrollment is pending and unexpired, so it can be re-displayed

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("agent_key_encrypted", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("agents", "agent_key_encrypted")
