import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.alert import AlertStatus
from app.models.common import Severity


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rule_id: uuid.UUID | None
    log_id: int | None
    incident_id: uuid.UUID | None
    severity: Severity
    status: AlertStatus
    assignee_id: uuid.UUID | None
    title: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class AlertListResponse(BaseModel):
    items: list[AlertOut]
    total: int
    limit: int
    offset: int


# Manual creation path — an analyst escalating something a rule never
# flagged (e.g. a suspicious log the rule engine missed). rule_id is always
# None for these; log_id is optional so an alert can also be raised with no
# specific triggering log at all.
class AlertCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    severity: Severity
    log_id: int | None = None


# assignee_id: null clears the assignment, omit to leave it unchanged —
# same "omit vs explicit null" convention as LogSourceUpdate.credential.
class AlertUpdate(BaseModel):
    status: AlertStatus | None = None
    assignee_id: uuid.UUID | None = None
