import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.alert import AlertStatus
from app.models.common import Severity


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rule_id: uuid.UUID | None
    log_id: int | None
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


# assignee_id: null clears the assignment, omit to leave it unchanged —
# same "omit vs explicit null" convention as LogSourceUpdate.credential.
class AlertUpdate(BaseModel):
    status: AlertStatus | None = None
    assignee_id: uuid.UUID | None = None
