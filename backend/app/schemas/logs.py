import json
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.common import Severity

SortOrder = Literal["timestamp_desc", "timestamp_asc"]

MAX_MESSAGE_LENGTH = 32_000
MAX_RAW_BYTES = 64_000


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
    # Bounded so one 500-item batch can't carry gigabytes into memory and
    # JSONB -- the agent already truncates local-file lines to 4000 chars,
    # and real Windows event messages stay well under this.
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    raw: dict = Field(default_factory=dict)

    @field_validator("raw")
    @classmethod
    def _raw_size(cls, v: dict) -> dict:
        if len(json.dumps(v, default=str)) > MAX_RAW_BYTES:
            raise ValueError(f"raw must serialize to at most {MAX_RAW_BYTES} bytes")
        return v


class LogIngestRequest(BaseModel):
    logs: list[LogIngestItem] = Field(min_length=1, max_length=500)


class LogIngestResponse(BaseModel):
    ingested: int
    alerts_created: int
