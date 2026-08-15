import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.common import Severity, pg_enum


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), index=True)
    # Nullable for the same reason as agent_id below: deleting a log source
    # must not be blocked by (or destroy) the logs it already shipped.
    source_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("log_sources.id"), index=True, nullable=True)
    # Nullable so an agent can be deleted without destroying the logs it
    # shipped — history is detached (agent_id -> NULL), not cascade-deleted.
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"), index=True, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    severity: Mapped[Severity] = mapped_column(pg_enum(Severity, "severity"), index=True)
    event_type: Mapped[str] = mapped_column(String(100))
    message: Mapped[str] = mapped_column(Text)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
