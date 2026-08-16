import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.common import Severity
from app.models.incident import IncidentEventKind, IncidentStatus

# SLA breach thresholds (hours from created_at):
#   open          → 72 h (configurable via incident.sla_hours column)
#   investigating → 24 h (separate, tighter deadline once work has started)
# These are enforced at the service layer; the column stores the open-SLA only.
INVESTIGATING_SLA_HOURS = 24

# Risk-score mapping: max severity of linked alerts → 0-100 integer.
# Used both here (for sla_breached computation) and in incident_service.
_SEVERITY_TO_SCORE: dict[Severity, int] = {
    Severity.OK: 10,
    Severity.MEDIUM: 50,
    Severity.HIGH: 75,
    Severity.CRITICAL: 100,
}


def severity_to_score(s: Severity) -> int:
    return _SEVERITY_TO_SCORE.get(s, 0)


class IncidentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    # Initial severity used to seed risk_score before any alert is linked.
    severity: Severity = Severity.MEDIUM
    assignee_id: uuid.UUID | None = None


class IncidentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: IncidentStatus | None = None
    # assignee_id: null clears the assignment; omit to leave it unchanged.
    assignee_id: uuid.UUID | None = None


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    status: IncidentStatus
    risk_score: int
    assignee_id: uuid.UUID | None
    sla_hours: int
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    # Computed by the service layer — not a real column.
    alert_count: int = 0
    sla_breached: bool = False

    @classmethod
    def from_orm_with_meta(cls, incident: Any, alert_count: int) -> "IncidentOut":
        """Build an IncidentOut with the computed alert_count and sla_breached fields."""
        now = datetime.now(UTC)
        age_hours = (now - incident.created_at.replace(tzinfo=UTC)).total_seconds() / 3600
        if incident.status == IncidentStatus.RESOLVED:
            sla_breached = False
        elif incident.status == IncidentStatus.INVESTIGATING:
            sla_breached = age_hours > INVESTIGATING_SLA_HOURS
        else:
            sla_breached = age_hours > incident.sla_hours
        return cls.model_validate(
            {
                **{c.key: getattr(incident, c.key) for c in incident.__table__.columns},
                "alert_count": alert_count,
                "sla_breached": sla_breached,
            }
        )


class IncidentListResponse(BaseModel):
    items: list[IncidentOut]
    total: int
    limit: int
    offset: int


class IncidentNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class IncidentNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    author_id: uuid.UUID
    created_at: datetime


class IncidentHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: IncidentEventKind
    detail: str | None
    actor_id: uuid.UUID | None
    created_at: datetime


class LinkAlertRequest(BaseModel):
    alert_id: uuid.UUID
