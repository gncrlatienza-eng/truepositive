"""log_sources health reporting — last_collected_at/last_status/last_status_reason

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log_source_health_status_enum = postgresql.ENUM("ok", "error", name="log_source_health_status", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    log_source_health_status_enum.create(bind, checkfirst=True)

    op.add_column("log_sources", sa.Column("last_collected_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("log_sources", sa.Column("last_status", log_source_health_status_enum, nullable=True))
    op.add_column("log_sources", sa.Column("last_status_reason", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("log_sources", "last_status_reason")
    op.drop_column("log_sources", "last_status")
    op.drop_column("log_sources", "last_collected_at")

    bind = op.get_bind()
    log_source_health_status_enum.drop(bind, checkfirst=True)
