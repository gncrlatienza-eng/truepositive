"""Sprint 8: alert_rules.mitre_technique -- optional MITRE ATT&CK technique
tag (e.g. 'T1078 -- Valid Accounts') for grouping rules in the Intel page.

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "alert_rules",
        sa.Column("mitre_technique", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("alert_rules", "mitre_technique")