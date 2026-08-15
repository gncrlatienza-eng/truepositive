import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.log_source import (
    LogSource,
    LogSourceCredentialType,
    LogSourceHealthStatus,
    LogSourceProtocol,
    LogSourceStatus,
    LogSourceType,
)

# SSH only this release; WinRM/Syslog and Kerberos are visible "coming soon"
# stubs in the UI rather than silently accepted — see docs/SPRINT_PLAN.md.
SUPPORTED_PROTOCOLS = {LogSourceProtocol.SSH}
SUPPORTED_CREDENTIAL_TYPES = {LogSourceCredentialType.SSH_KEY, LogSourceCredentialType.PASSWORD}


class LogSourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: LogSourceType
    agent_id: uuid.UUID | None = None
    path: str | None = Field(default=None, max_length=512)
    tags: list[str] = Field(default_factory=list)

    protocol: LogSourceProtocol | None = None
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = Field(default=None, max_length=255)
    credential_type: LogSourceCredentialType | None = None
    credential: str | None = Field(default=None, max_length=8192)

    @model_validator(mode="after")
    def validate_combo(self) -> "LogSourceCreate":
        if self.type == LogSourceType.LOCAL:
            if self.host or self.protocol or self.credential:
                raise ValueError("Local sources cannot specify host, protocol, or credential")
            return self

        if not self.host:
            raise ValueError("Remote sources require a host")
        if self.protocol is None:
            raise ValueError("Remote sources require a protocol")
        if self.protocol not in SUPPORTED_PROTOCOLS:
            raise ValueError(f"{self.protocol.value} sources aren't supported yet — SSH only in this release")
        if not self.credential_type or not self.credential:
            raise ValueError("Remote sources require credential_type and credential")
        if self.credential_type not in SUPPORTED_CREDENTIAL_TYPES:
            raise ValueError(
                f"{self.credential_type.value} authentication isn't supported yet — use an SSH key or password"
            )
        return self


class LogSourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    tags: list[str] | None = None
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = Field(default=None, max_length=255)
    credential_type: LogSourceCredentialType | None = None
    # Omit to leave the stored credential unchanged; set to rotate it.
    credential: str | None = Field(default=None, max_length=8192)
    status: LogSourceStatus | None = None

    @model_validator(mode="after")
    def validate_credential_type_supported(self) -> "LogSourceUpdate":
        if self.credential_type is not None and self.credential_type not in SUPPORTED_CREDENTIAL_TYPES:
            raise ValueError(
                f"{self.credential_type.value} authentication isn't supported yet — use an SSH key or password"
            )
        return self


class LogSourceOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    agent_id: uuid.UUID | None
    name: str
    type: LogSourceType
    protocol: LogSourceProtocol | None
    path: str | None
    host: str | None
    port: int | None
    username: str | None
    credential_type: LogSourceCredentialType | None
    has_credential: bool
    tags: list[str]
    status: LogSourceStatus
    # The agent's own last-reported outcome for this source — see
    # POST /agents/{id}/sources/status. All null until the agent's first
    # report (e.g. brand new, or never assigned to a running agent).
    last_collected_at: datetime | None
    last_status: LogSourceHealthStatus | None
    last_status_reason: str | None
    created_at: datetime

    # Explicit conversion (not from_attributes) so the ciphertext column can
    # never accidentally end up on this model — only the derived boolean does.
    @classmethod
    def from_model(cls, log_source: LogSource) -> "LogSourceOut":
        return cls(
            id=log_source.id,
            org_id=log_source.org_id,
            agent_id=log_source.agent_id,
            name=log_source.name,
            type=log_source.type,
            protocol=log_source.protocol,
            path=log_source.path,
            host=log_source.host,
            port=log_source.port,
            username=log_source.username,
            credential_type=log_source.credential_type,
            has_credential=log_source.credential_encrypted is not None,
            tags=log_source.tags,
            status=log_source.status,
            last_collected_at=log_source.last_collected_at,
            last_status=log_source.last_status,
            last_status_reason=log_source.last_status_reason,
            created_at=log_source.created_at,
        )


# Reported by the agent once per collection cycle for every local source it
# was assigned, regardless of whether that cycle produced any new events —
# this is what makes the green/yellow/red status in Settings genuinely
# reflect the agent's real last attempt instead of a guess.
class SourceStatusItem(BaseModel):
    source_id: uuid.UUID
    status: LogSourceHealthStatus
    reason: str | None = Field(default=None, max_length=500)


class SourceStatusReportRequest(BaseModel):
    results: list[SourceStatusItem] = Field(min_length=1, max_length=500)


class SourceStatusReportResponse(BaseModel):
    updated: int
