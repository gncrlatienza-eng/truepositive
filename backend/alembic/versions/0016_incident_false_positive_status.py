"""Add 'false_positive' as a distinct incident_status value, alongside the
existing open/investigating/resolved — for wrongly-flagged incidents, so
they're closed out separately from a real RESOLVED (handled) incident and
can later feed a false-positive-rate metric for detection-rule tuning.

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-23

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres 12+ allows ADD VALUE inside a transaction, as long as the new
    # value isn't used in the same transaction — this migration only adds it.
    op.execute("ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'false_positive'")


def downgrade() -> None:
    # Postgres has no DROP VALUE — recreate the type without it. Any rows
    # already using the value are folded back into 'resolved' first.
    op.execute("UPDATE incidents SET status = 'resolved' WHERE status = 'false_positive'")
    op.execute("ALTER TYPE incident_status RENAME TO incident_status_old")
    op.execute("CREATE TYPE incident_status AS ENUM ('open', 'investigating', 'resolved')")
    op.execute(
        "ALTER TABLE incidents ALTER COLUMN status TYPE incident_status USING status::text::incident_status"
    )
    op.execute("DROP TYPE incident_status_old")
