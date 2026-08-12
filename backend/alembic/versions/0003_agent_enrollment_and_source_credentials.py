"""agent enrollment fields, log source credentials, whitelist uniqueness

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log_source_credential_type_enum = postgresql.ENUM(
    "ssh_key", "password", "kerberos", name="log_source_credential_type", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    log_source_credential_type_enum.create(bind, checkfirst=True)

    op.add_column("agents", sa.Column("enrollment_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agents", sa.Column("hostname", sa.String(255), nullable=True))

    op.add_column("log_sources", sa.Column("name", sa.String(255), nullable=False, server_default=""))
    op.alter_column("log_sources", "name", server_default=None)
    op.add_column("log_sources", sa.Column("path", sa.String(512), nullable=True))
    op.add_column("log_sources", sa.Column("username", sa.String(255), nullable=True))
    op.add_column("log_sources", sa.Column("credential_type", log_source_credential_type_enum, nullable=True))
    op.add_column("log_sources", sa.Column("credential_encrypted", sa.Text(), nullable=True))

    op.create_unique_constraint(
        "uq_whitelist_entries_org_type_value", "whitelist_entries", ["org_id", "type", "value"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_whitelist_entries_org_type_value", "whitelist_entries", type_="unique")

    op.drop_column("log_sources", "credential_encrypted")
    op.drop_column("log_sources", "credential_type")
    op.drop_column("log_sources", "username")
    op.drop_column("log_sources", "path")
    op.drop_column("log_sources", "name")

    op.drop_column("agents", "hostname")
    op.drop_column("agents", "enrollment_expires_at")

    bind = op.get_bind()
    log_source_credential_type_enum.drop(bind, checkfirst=True)
