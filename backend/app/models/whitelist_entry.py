import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.common import pg_enum


class WhitelistType(enum.StrEnum):
    IP = "ip"
    DOMAIN = "domain"
    HASH = "hash"
    USER = "user"


class WhitelistEntry(Base):
    __tablename__ = "whitelist_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), index=True)
    type: Mapped[WhitelistType] = mapped_column(pg_enum(WhitelistType, "whitelist_type"))
    value: Mapped[str] = mapped_column(String(255))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, server_default="allow")
    # "allow" = traditional whitelist (suppress alerts for this indicator).
    # "block" = blocklist record (indicator should be blocked; enforcement is
    # logged but not enforced at the network level -- same honest-stub pattern
    # as Sprint 6's block_ip playbook action. Enforcement is Sprint 9+ scope.)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("org_id", "type", "value", name="uq_whitelist_entries_org_type_value"),)
