import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.common import Severity

SortOrder = Literal["timestamp_desc", "timestamp_asc"]


class LogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: uuid.UUID | None
    agent_id: uuid.UUID | None
    timestamp: datetime
    severity: Severity
    event_type: str
    message: str
    raw: dict
    created_at: datetime


class LogListResponse(BaseModel):
    items: list[LogOut]
    total: int
    limit: int
    offset: int


# Shipped by the agent, one source_id per entry — the agent learns valid
# source_ids from GET /agents/{id}/sources, so ingestion can validate each one
# is actually assigned to the shipping agent rather than trusting the payload.
class LogIngestItem(BaseModel):
    source_id: uuid.UUID
    timestamp: datetime
    severity: Severity
    event_type: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1)
    raw: dict = Field(default_factory=dict)


class LogIngestRequest(BaseModel):
    logs: list[LogIngestItem] = Field(min_length=1, max_length=500)


class LogIngestResponse(BaseModel):
    ingested: int
    alerts_created: int
