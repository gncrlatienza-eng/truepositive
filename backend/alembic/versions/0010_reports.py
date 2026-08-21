"""Sprint 8: create reports table (Report model existed since Sprint 1 but was
never migrated -- Base.metadata.create_all() in tests masked the gap until now).

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `report_type` and `reports` predate this migration on some dev
    # databases -- the Report model existed since Sprint 1 and
    # Base.metadata.create_all() (used by the test suite, and apparently run
    # against at least one real dev DB along the way too) silently created
    # both without ever going through Alembic. Existence checks make this
    # migration idempotent for that already-bootstrapped case while still
    # doing real work on a genuinely fresh database.
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # create_type=False: the type is created explicitly via .create() below;
    # without this, op.create_table's own column-create hook tries to CREATE
    # TYPE a *second* time for the same enum and fails ("already exists") --
    # this is what actually broke the original version of this migration.
    report_type = postgresql.ENUM(
        "daily",
        "weekly",
        "monthly",
        "compliance",
        "custom",
        name="report_type",
        create_type=False,
    )
    report_type.create(bind, checkfirst=True)

    if "reports" not in inspector.get_table_names():
        op.create_table(
            "reports",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("type", report_type, nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("period_end", sa.Date(), nullable=False),
            sa.Column(
                "data",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    # By this point "reports" exists either way (pre-existing or just
    # created above), so it's always safe to inspect its indexes here.
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("reports")}
    if "ix_reports_org_id" not in existing_indexes:
        op.create_index("ix_reports_org_id", "reports", ["org_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_reports_org_id", table_name="reports")
    op.drop_table("reports")
    sa.Enum(name="report_type").drop(op.get_bind(), checkfirst=True)
