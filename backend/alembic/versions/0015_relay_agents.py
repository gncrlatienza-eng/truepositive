"""agents.relay_parent_agent_id + agents.awaiting_relay_approval — hub-and-spoke
agent relay (Phase 1: manual pairing). A relay child's `relay_parent_agent_id`
points at its hub's own `agents.id`; a hub relays the child's heartbeat/
source-list/log traffic to the backend on its behalf so the child never needs
its own direct internet access, while `Log.agent_id` still always names the
child, never the hub, so per-device identity is preserved through the relay.

`awaiting_relay_approval` is unused by the Phase 1 (dashboard-initiated,
manual-pairing) creation path — creating the child from the dashboard already
*is* the authorization there. It exists now so Phase 2 (LAN auto-discovery,
where a hub reports a device it found on its own) can gate an unsolicited
child behind an explicit admin approval click without a second migration.

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("relay_parent_agent_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_agents_relay_parent_agent_id"), "agents", ["relay_parent_agent_id"])
    op.create_foreign_key(
        "fk_agents_relay_parent_agent_id_agents",
        "agents",
        "agents",
        ["relay_parent_agent_id"],
        ["id"],
    )
    op.add_column(
        "agents", sa.Column("awaiting_relay_approval", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    op.drop_column("agents", "awaiting_relay_approval")
    op.drop_constraint("fk_agents_relay_parent_agent_id_agents", "agents", type_="foreignkey")
    op.drop_index(op.f("ix_agents_relay_parent_agent_id"), table_name="agents")
    op.drop_column("agents", "relay_parent_agent_id")
