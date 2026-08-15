import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.agent import AgentPlatform, AgentStatus


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    platform: AgentPlatform


class AgentRegisterRequest(BaseModel):
    hostname: str = Field(min_length=1, max_length=255)


class AgentDownloadRequest(BaseModel):
    # The backend only ever stores the enrollment key's bcrypt hash, so the
    # frontend hands the raw key it already has (from AgentCreatedResponse)
    # back in here to be embedded in the downloaded binary.
    url: str = Field(min_length=1, max_length=2048)
    id: uuid.UUID
    key: str = Field(min_length=1, max_length=255)


class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    platform: AgentPlatform
    status: AgentStatus
    hostname: str | None
    last_seen_at: datetime | None
    created_at: datetime


class AgentCreatedResponse(BaseModel):
    agent: AgentOut
    # Shown once — the backend only ever stores its bcrypt hash after this response.
    enrollment_key: str
    enrollment_expires_at: datetime


class HeartbeatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: AgentStatus
    last_seen_at: datetime


# What the agent itself is allowed to see about its own assigned sources —
# no credential fields at all, since this sprint's real collection only
# reads local sources (Windows Event Log channels / local files), never the
# encrypted remote SSH credentials.
class AgentSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    path: str | None
    tags: list[str]
