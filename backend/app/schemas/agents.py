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
    # The frontend hands back the raw key it has (from AgentCreatedResponse,
    # or from AgentOut.enrollment_key while still pending/unexpired) to be
    # embedded in the downloaded binary — verified against the stored hash.
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
    enrollment_expires_at: datetime | None
    # Re-exposed (not just returned once) via Agent.enrollment_key while the
    # agent is still pending and inside its 24h enrollment window, so closing
    # the "deploy an agent" panel doesn't strand the user without a way to
    # see the credentials again — null once connected, expired, or rotated.
    enrollment_key: str | None = None


class AgentCreatedResponse(BaseModel):
    agent: AgentOut
    # Also on `agent.enrollment_key` from here on (re-fetchable via GET/list
    # while still pending and unexpired) — kept here too since this is the
    # one response that's guaranteed to have it regardless of timing.
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
