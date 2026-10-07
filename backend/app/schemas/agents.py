import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.agent import AgentPlatform, AgentStatus
from app.schemas.log_sources import SourceStatusItem, SourceStatusReportResponse
from app.schemas.logs import LogIngestItem, LogIngestResponse


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    platform: AgentPlatform


class AgentRegisterRequest(BaseModel):
    hostname: str = Field(min_length=1, max_length=255)


# Body for the dashboard's "Deploy a device under <hub>" flow (Phase 1: the
# admin creates this from the dashboard, which is itself the authorization —
# see relay_service.create_relay_child).
class RelayChildCreate(BaseModel):
    hub_agent_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    platform: AgentPlatform


# What a hub relays on a child's behalf, resolved to the underlying real
# request the corresponding direct-connect endpoint would have handled
# (register/heartbeat/sources/sources-status/logs) — `kind` picks which one,
# and only the matching payload field is set; validated further in
# relay_service (e.g. `logs` must be non-empty when kind == "logs",
# `hostname` required when kind == "register"). All five, not just logs, are
# relayed — Phase 1's "full isolation" design means a relay child never
# talks to the internet-facing backend for anything, not just log data.
# `key` is the child's own enrollment key, verified against its
# agent_key_hash by relay_service._get_relay_child before anything else
# here runs — the hub's own X-Agent-Key (checked by get_current_agent
# already, see the route) proves it's a legitimate hub, but says nothing
# about which specific child it's acting on behalf of; without this, hub
# ownership of *a* child_id was being treated as authorization for *any*
# child_id, which a real security review flagged as exploitable by anyone
# who could reach the hub's local LAN listener (see SECURITY.md).
class RelayProxyRequest(BaseModel):
    child_id: uuid.UUID
    key: str = Field(min_length=1, max_length=255)
    kind: Literal["register", "heartbeat", "sources", "source_status", "logs"]
    hostname: str | None = Field(default=None, max_length=255)
    # Same caps as the direct endpoints (LogIngestRequest/SourceStatusReport-
    # Request) -- enforced here at parse time so an oversized relay payload
    # is a clean 422, not a ValidationError raised mid-handler as a 500.
    logs: list[LogIngestItem] | None = Field(default=None, min_length=1, max_length=500)
    source_status_results: list[SourceStatusItem] | None = Field(default=None, max_length=500)


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
    is_primary: bool
    created_at: datetime
    enrollment_expires_at: datetime | None
    # Re-exposed (not just returned once) via Agent.enrollment_key while the
    # agent is still pending and inside its 24h enrollment window, so closing
    # the "deploy an agent" panel doesn't strand the user without a way to
    # see the credentials again — null once connected, expired, or rotated.
    enrollment_key: str | None = None
    relay_parent_agent_id: uuid.UUID | None = None
    is_relay_child: bool = False
    awaiting_relay_approval: bool = False
    # Real, agent-reported capability status (see HeartbeatRequest below) —
    # None until the agent's first heartbeat reports a value.
    event_log_reader_member: bool | None = None
    sysmon_installed: bool | None = None
    capabilities_checked_at: datetime | None = None


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
    # So an agent marked primary *after* it already registered learns about
    # it on its next heartbeat and can activate hub-relay behavior without
    # needing a restart.
    is_primary: bool


# Only ever sent by a hub (is_primary), and only carries meaning then — a
# normal spoke agent's heartbeat body stays the empty `{}` it's always been.
# Reported on every heartbeat (not just once) since a hub's LAN address can
# genuinely change (DHCP lease renewal, reconnecting Wi-Fi) — kept in-memory
# only (see relay_service), never persisted, so there's nothing to go stale
# in the database if a hub goes offline without a graceful shutdown.
class HeartbeatRequest(BaseModel):
    relay_listen_addr: str | None = Field(default=None, max_length=255)
    # Proactive, real capability check (agent/tp_agent.py's
    # _check_capabilities) — distinct from the older reactive
    # _maybe_auto_fix_source path, which only reacts to an existing source's
    # failure rather than reporting status before a source even exists.
    # Windows-only; left unset (None) on other platforms or if the check
    # itself failed, so "unknown" is never conflated with "false".
    event_log_reader_member: bool | None = None
    sysmon_installed: bool | None = None


class RelayChildCreatedResponse(BaseModel):
    agent: AgentOut
    enrollment_key: str
    enrollment_expires_at: datetime
    # Populated from the hub's most recently reported relay_listen_addr (see
    # HeartbeatRequest above) so the dashboard's deploy screen can show one
    # thing to copy onto the child machine instead of the admin having to
    # find the hub's LAN IP themselves. None if the hub hasn't heartbeated
    # with an address yet (e.g. it was only just marked primary).
    hub_relay_addr: str | None = None


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


# Response envelope for POST /agents/{agent_id}/relay-proxy — exactly one of
# the three fields is populated, matching the request's `kind`. `heartbeat`
# doubles as the response shape for kind == "register" too (both just
# confirm the child's resulting id/status/last_seen_at — a register call's
# extra effect, setting hostname, doesn't need echoing back to a caller that
# already knows its own hostname).
class RelayProxyResponse(BaseModel):
    heartbeat: HeartbeatResponse | None = None
    sources: list[AgentSourceOut] | None = None
    logs: LogIngestResponse | None = None
    source_status: SourceStatusReportResponse | None = None
