"""agents.is_primary — marks exactly one agent per org as the "main machine"
(Sprint 7 multi-device visibility). Enforced at the service layer (unset any
existing primary before setting a new one), not a DB constraint — mirrors how
agent staleness/credential-expiry are also service-layer-enforced in this app.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agents", sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    op.drop_column("agents", "is_primary")
