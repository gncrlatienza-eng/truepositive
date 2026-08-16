"""Sprint 6: incident notes, history, playbooks; alerts.incident_id FK.

Adds:
  - description + sla_hours columns to incidents table (already existed from 0001)
  - incident_notes table
  - incident_event_kind enum + incident_history table
  - playbooks table
  - incident_id FK column on alerts (nullable, ON DELETE SET NULL)

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── incidents: add new columns ────────────────────────────────────────────
    op.add_column("incidents", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "incidents",
        sa.Column("sla_hours", sa.Integer(), nullable=False, server_default="72"),
    )

    # ── incident_notes ────────────────────────────────────────────────────────
    op.create_table(
        "incident_notes",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("incident_id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_incident_notes_incident_id", "incident_notes", ["incident_id"])
    op.create_index("ix_incident_notes_org_id", "incident_notes", ["org_id"])

    # ── incident_event_kind enum + incident_history ───────────────────────────
    incident_event_kind = sa.Enum(
        "created",
        "status_changed",
        "assigned",
        "unassigned",
        "note_added",
        "alert_linked",
        "alert_unlinked",
        name="incident_event_kind",
    )
    incident_event_kind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "incident_history",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("incident_id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "created",
                "status_changed",
                "assigned",
                "unassigned",
                "note_added",
                "alert_linked",
                "alert_unlinked",
                name="incident_event_kind",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_incident_history_incident_id", "incident_history", ["incident_id"])
    op.create_index("ix_incident_history_org_id", "incident_history", ["org_id"])

    # ── playbooks ─────────────────────────────────────────────────────────────
    op.create_table(
        "playbooks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("trigger_conditions", JSONB(), nullable=False, server_default="{}"),
        sa.Column("actions", JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_playbooks_org_id", "playbooks", ["org_id"])

    # ── alerts: add incident_id FK ────────────────────────────────────────────
    # ON DELETE SET NULL: deleting an incident detaches its alerts rather than
    # cascade-deleting them — same "detach don't destroy" principle that
    # AlertRule deletion uses for its created Alerts (Sprint 5).
    op.add_column("alerts", sa.Column("incident_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_alerts_incident_id",
        "alerts",
        "incidents",
        ["incident_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_alerts_incident_id", "alerts", type_="foreignkey")
    op.drop_column("alerts", "incident_id")

    op.drop_index("ix_playbooks_org_id", table_name="playbooks")
    op.drop_table("playbooks")

    op.drop_index("ix_incident_history_org_id", table_name="incident_history")
    op.drop_index("ix_incident_history_incident_id", table_name="incident_history")
    op.drop_table("incident_history")

    incident_event_kind = sa.Enum(name="incident_event_kind")
    incident_event_kind.drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_incident_notes_org_id", table_name="incident_notes")
    op.drop_index("ix_incident_notes_incident_id", table_name="incident_notes")
    op.drop_table("incident_notes")

    op.drop_column("incidents", "sla_hours")
    op.drop_column("incidents", "description")
