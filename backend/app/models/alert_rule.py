import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.common import Severity, pg_enum


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    conditions: Mapped[dict] = mapped_column(JSONB, default=dict)
    severity: Mapped[Severity] = mapped_column(pg_enum(Severity, "severity"))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    mitre_technique: Mapped[str | None] = mapped_column(Text, nullable=True)
    # e.g. "T1078 — Valid Accounts". Freeform; analyst enters the technique
    # ID + name. No separate lookup table at this scale.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
