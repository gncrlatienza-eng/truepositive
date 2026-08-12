import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.common import pg_enum


class LogSourceType(enum.StrEnum):
    LOCAL = "local"
    REMOTE = "remote"


class LogSourceProtocol(enum.StrEnum):
    SSH = "ssh"
    WINRM = "winrm"
    SYSLOG = "syslog"


class LogSourceStatus(enum.StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"


class LogSource(Base):
    __tablename__ = "log_sources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), index=True)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"), nullable=True)
    type: Mapped[LogSourceType] = mapped_column(pg_enum(LogSourceType, "log_source_type"))
    protocol: Mapped[LogSourceProtocol | None] = mapped_column(
        pg_enum(LogSourceProtocol, "log_source_protocol"), nullable=True
    )
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[LogSourceStatus] = mapped_column(
        pg_enum(LogSourceStatus, "log_source_status"), default=LogSourceStatus.ACTIVE
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
