import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
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


class LogSourceCredentialType(enum.StrEnum):
    SSH_KEY = "ssh_key"
    PASSWORD = "password"
    KERBEROS = "kerberos"


# Reported by the agent itself each collection cycle (see
# POST /agents/{id}/sources/status) — this is the real, agent-observed
# outcome of the last attempt to read this source, not a guess derived from
# whether logs happen to exist. Deliberately separate from `status` above,
# which is the user's own active/paused toggle.
class LogSourceHealthStatus(enum.StrEnum):
    OK = "ok"
    ERROR = "error"


class LogSource(Base):
    __tablename__ = "log_sources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), index=True)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[LogSourceType] = mapped_column(pg_enum(LogSourceType, "log_source_type"))
    protocol: Mapped[LogSourceProtocol | None] = mapped_column(
        pg_enum(LogSourceProtocol, "log_source_protocol"), nullable=True
    )
    path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    credential_type: Mapped[LogSourceCredentialType | None] = mapped_column(
        pg_enum(LogSourceCredentialType, "log_source_credential_type"), nullable=True
    )
    # Fernet ciphertext (base64 text) — decrypted plaintext never leaves utils/crypto.py.
    credential_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[LogSourceStatus] = mapped_column(
        pg_enum(LogSourceStatus, "log_source_status"), default=LogSourceStatus.ACTIVE
    )
    # Populated by the agent's per-cycle status report — null until the first
    # report arrives (e.g. a brand-new or not-yet-assigned source).
    last_collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[LogSourceHealthStatus | None] = mapped_column(
        pg_enum(LogSourceHealthStatus, "log_source_health_status"), nullable=True
    )
    last_status_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
