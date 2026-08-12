"""add users.full_name and orgs.team_size

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(255), nullable=False, server_default=""))
    op.alter_column("users", "full_name", server_default=None)

    op.add_column("orgs", sa.Column("team_size", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("orgs", "team_size")
    op.drop_column("users", "full_name")
