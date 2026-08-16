import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class Playbook(Base):
    """Trigger rule → actions mapping.

    trigger_conditions mirrors AlertRuleConditions' structured schema
    (event_type exact-match + min_severity threshold) — same two keys the
    playbook evaluator actually understands. Deliberately not free-form JSONB
    for the trigger: "the UI can't build a condition the backend can't
    evaluate" (Sprint 5 principle, see schemas/alert_rules.py).

    actions is a fixed-key dict (block_ip, disable_account, slack_notify,
    auto_create_incident), validated through PlaybookActions in
    schemas/playbooks.py before storage.  Stub actions are logged with a
    [PLAYBOOK ACTION] prefix; only auto_create_incident creates a real row.
    """

    __tablename__ = "playbooks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Structured trigger — only event_type and min_severity are meaningful here.
    trigger_conditions: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Fixed-key action flags — see PlaybookActions schema for the contract.
    actions: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
