import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.common import pg_enum
from app.utils.crypto import decrypt_secret


class AgentPlatform(enum.StrEnum):
    WINDOWS = "windows"
    LINUX = "linux"
    DOCKER = "docker"
    KUBERNETES = "kubernetes"


class AgentStatus(enum.StrEnum):
    PENDING = "pending"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    platform: Mapped[AgentPlatform] = mapped_column(pg_enum(AgentPlatform, "agent_platform"))
    agent_key_hash: Mapped[str] = mapped_column(String(255))
    # Reversible copy of the same raw key, kept only while enrollment is
    # still usable (pending + not expired) so Settings can re-display
    # credentials after the "deploy" modal is closed, without ever having to
    # store more than one live copy for longer than necessary. The service
    # layer nulls this the moment the agent connects or its window lapses
    # (see agent_service.py's sweeps) — agent_key_hash remains the only
    # thing actually used to authenticate the agent.
    agent_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[AgentStatus] = mapped_column(pg_enum(AgentStatus, "agent_status"), default=AgentStatus.PENDING)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enrollment_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "This is my main machine" — at most one True per org, enforced in
    # agent_service.set_primary_agent (unsets any previous one first), not a
    # DB constraint. When true, the agent process itself learns this via its
    # own /register or /heartbeat response and activates hub-relay behavior
    # (see relay_service.py) — no longer purely cosmetic once relay exists.
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    # Self-referential: a relay child's hub. NULL for a normal, direct-connect
    # agent (the overwhelming majority) and for a hub itself — no chained
    # relays (a hub can't also be someone else's child), enforced in
    # relay_service, not here. See migration 0015 for the full rationale.
    relay_parent_agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"), nullable=True, index=True)
    # Only meaningful for a Phase-2 (LAN-discovered, unsolicited) relay child —
    # a Phase-1 child created directly from the dashboard is authorized by
    # that very act and never sets this. See migration 0015's docstring.
    awaiting_relay_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    # Self-reported, real capability status — replaces onboarding's old
    # static "Needs Administrator"/"Requires Sysmon installed" badges (which
    # were catalog metadata with no actual check behind them) with what this
    # specific agent actually observed on its last heartbeat. NULL until the
    # agent's first heartbeat reports a value (proactive check added in
    # agent/tp_agent.py's _check_capabilities, distinct from the older
    # reactive _maybe_auto_fix_source path) — the frontend falls back to the
    # static badge whenever these are still NULL.
    event_log_reader_member: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    sysmon_installed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    capabilities_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    @property
    def is_relay_child(self) -> bool:
        return self.relay_parent_agent_id is not None

    @property
    def enrollment_key(self) -> str | None:
        """Decrypted enrollment key, or None once it's no longer meant to be shown.

        Gated on the same rule the service-layer sweeps enforce for storage:
        only while still pending and inside the enrollment window.
        """
        if self.agent_key_encrypted is None or self.status != AgentStatus.PENDING:
            return None
        if self.enrollment_expires_at is not None and datetime.now(UTC) > self.enrollment_expires_at:
            return None
        return decrypt_secret(self.agent_key_encrypted)
