import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

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
