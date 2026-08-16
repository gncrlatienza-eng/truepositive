import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.common import Severity, pg_enum


class AlertStatus(enum.StrEnum):
    OPEN = "open"
    ACK = "ack"
    ESCALATED = "escalated"
    RESOLVED = "resolved"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), index=True)
    rule_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("alert_rules.id"), nullable=True)
    log_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("logs.id"), nullable=True)
    severity: Mapped[Severity] = mapped_column(pg_enum(Severity, "severity"))
    status: Mapped[AlertStatus] = mapped_column(pg_enum(AlertStatus, "alert_status"), default=AlertStatus.OPEN)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Nullable FK to incidents: set when an alert is linked to an incident.
    # ON DELETE SET NULL: deleting the incident detaches alerts rather than
    # cascade-deleting them — the same "detach don't destroy" principle that
    # AlertRule deletion uses for its already-created alerts (Sprint 5).
    incident_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
