import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.common import pg_enum


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
    status: Mapped[AgentStatus] = mapped_column(pg_enum(AgentStatus, "agent_status"), default=AgentStatus.PENDING)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enrollment_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
