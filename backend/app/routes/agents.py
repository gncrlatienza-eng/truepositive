import hashlib
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.agent import Agent
from app.models.user import User
from app.schemas.agents import (
    AgentCreate,
    AgentCreatedResponse,
    AgentDownloadRequest,
    AgentOut,
    AgentRegisterRequest,
    AgentSourceOut,
    HeartbeatRequest,
    HeartbeatResponse,
    RelayChildCreate,
    RelayChildCreatedResponse,
    RelayProxyRequest,
    RelayProxyResponse,
)
from app.schemas.log_sources import SourceStatusReportRequest, SourceStatusReportResponse
from app.schemas.logs import LogIngestRequest, LogIngestResponse
from app.services import agent_service, log_service, log_source_service, relay_service
from app.utils.rate_limit import by_agent_id, rate_limit
from app.utils.security import get_current_agent, get_current_user, verify_password

router = APIRouter(prefix="/agents", tags=["agents"])

# Mounted read-only from agent/dist/ in docker-compose.yml — a locally-built
# PyInstaller artifact (see agent/README.md), not baked into the image.
AGENT_BINARY_DIR = Path("/app/agent_dist")

# Must match agent/tp_agent.py's CONFIG_MARKER exactly.
AGENT_CONFIG_MARKER = b"\n#TPCONFIG_V1#\n"


@router.get("/ping")
def ping():
    return {"router": "agents", "status": "ok"}


@router.post("", response_model=AgentCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    agent, raw_key = agent_service.create_agent(db, current_user.org_id, payload)
    return AgentCreatedResponse(
        agent=AgentOut.model_validate(agent),
        enrollment_key=raw_key,
        enrollment_expires_at=agent.enrollment_expires_at,
    )


@router.get("", response_model=list[AgentOut])
def list_agents(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return agent_service.list_agents(db, current_user.org_id)


# Two path segments ("download", "windows"), so this can never collide with
# the single-segment /{agent_id} below regardless of registration order.
def _read_agent_binary() -> bytes:
    binary_path = AGENT_BINARY_DIR / "truepositive-agent.exe"
    if not binary_path.exists():
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Agent binary not built yet — see agent/README.md for how to build it.",
        )
    return binary_path.read_bytes()


# Raw, unconfigured binary — for anyone assembling a deployment manually
# (their own agent_config.json alongside it, or scripted provisioning). No
# auth: this copy is generic, nothing agent- or org-specific is in it. The
# binary itself isn't code-signed (a real gap — needs a purchased cert, not
# a code fix), but the X-SHA256 header at least lets anyone compare against
# a known-good hash to catch tampering in transit.
@router.get("/download/windows")
def download_windows_agent():
    content = _read_agent_binary()
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": 'attachment; filename="truepositive-agent.exe"',
            "X-SHA256": hashlib.sha256(content).hexdigest(),
        },
    )


# The dashboard's primary Windows download: a real installer (EULA, install
# location, Start Menu shortcut, proper uninstall) built from agent/installer.iss
# — see agent/README.md. Same generic file for every org (no per-agent config
# baked in, unlike the raw binary above) — the installed app asks for the
# Server URL/Agent ID/Key on first launch instead. No auth, same reasoning
# as the raw binary above.
@router.get("/download/windows-installer")
def download_windows_installer():
    binary_path = AGENT_BINARY_DIR / "truepositive-agent-setup.exe"
    if not binary_path.exists():
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Agent installer not built yet — see agent/README.md for how to build it.",
        )
    content = binary_path.read_bytes()
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": 'attachment; filename="truepositive-agent-setup.exe"',
            "X-SHA256": hashlib.sha256(content).hexdigest(),
        },
    )


# The dashboard's actual "Download agent" button: one file, pre-configured,
# nothing else to place alongside it. Requires the caller to already hold
# the real enrollment key (verified against the stored hash below) — the
# frontend hands back the same key it got from POST /agents or GET
# /agents(/{id}) (Agent.enrollment_key, while still pending and unexpired).
@router.post("/download/windows")
def download_windows_agent_configured(
    payload: AgentDownloadRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    agent = agent_service.get_agent(db, current_user.org_id, payload.id)
    if not verify_password(payload.key, agent.agent_key_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid enrollment key")

    config = json.dumps({"url": payload.url, "id": str(payload.id), "key": payload.key}).encode("utf-8")
    combined = _read_agent_binary() + AGENT_CONFIG_MARKER + config

    return Response(
        content=combined,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="truepositive-agent.exe"'},
    )


# Dashboard-initiated (Phase 1 manual pairing) — the admin creating this
# credential from the dashboard is itself the authorization, same trust
# model as POST /agents above; no separate approval step exists yet (that
# only becomes necessary in Phase 2, for a device the hub finds on its own).
# A static two-segment path, defined ahead of the single-segment /{agent_id}
# routes below so it can never be shadowed by them — same reasoning as the
# /download/* routes above.
@router.post("/relay-children", response_model=RelayChildCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_relay_child(
    payload: RelayChildCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    agent, raw_key, hub_relay_addr = relay_service.create_relay_child(db, current_user.org_id, payload)
    return RelayChildCreatedResponse(
        agent=AgentOut.model_validate(agent),
        enrollment_key=raw_key,
        enrollment_expires_at=agent.enrollment_expires_at,
        hub_relay_addr=hub_relay_addr,
    )


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return agent_service.get_agent(db, current_user.org_id, agent_id)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    agent_service.delete_agent(db, current_user.org_id, agent_id)


# Marks this agent as the org's "main machine" — unsets any previous primary
# first, so at most one is ever true per org (Sprint 7).
@router.post("/{agent_id}/primary", response_model=AgentOut)
def set_primary_agent(
    agent_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return agent_service.set_primary_agent(db, current_user.org_id, agent_id)


# For when the original download/config was lost — issues a new credential
# (invalidating the old one) so a pending/disconnected agent can be
# redeployed without deleting and recreating it.
@router.post("/{agent_id}/rotate-key", response_model=AgentCreatedResponse)
def rotate_agent_key(
    agent_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    agent, raw_key = agent_service.rotate_key(db, current_user.org_id, agent_id)
    return AgentCreatedResponse(
        agent=AgentOut.model_validate(agent),
        enrollment_key=raw_key,
        enrollment_expires_at=agent.enrollment_expires_at,
    )


# Auth here is the agent's own enrollment key (X-Agent-Key), not a user JWT —
# these two are called by the agent process, not the dashboard. Rate-limited
# per agent_id (not IP) — the thing worth bounding is "how much can one
# agent identity do," regardless of which network it connects from.
@router.post(
    "/{agent_id}/register",
    response_model=AgentOut,
    dependencies=[Depends(rate_limit("agent_register", limit=10, window_seconds=60, key_by=by_agent_id))],
)
def register_agent(
    payload: AgentRegisterRequest, agent: Agent = Depends(get_current_agent), db: Session = Depends(get_db)
):
    return agent_service.register_agent(db, agent, payload)


@router.post(
    "/{agent_id}/heartbeat",
    response_model=HeartbeatResponse,
    dependencies=[Depends(rate_limit("agent_heartbeat", limit=10, window_seconds=60, key_by=by_agent_id))],
)
def heartbeat(
    payload: HeartbeatRequest | None = None,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    # Only a hub ever sends a non-null relay_listen_addr (see HeartbeatRequest);
    # ignored for every other agent even if somehow present, since it's only
    # meaningful once this agent is actually acting as a relay hub.
    if agent.is_primary and payload is not None:
        relay_service.record_hub_relay_addr(agent.id, payload.relay_listen_addr)
    event_log_reader_member = payload.event_log_reader_member if payload is not None else None
    sysmon_installed = payload.sysmon_installed if payload is not None else None
    return agent_service.heartbeat(
        db, agent, event_log_reader_member=event_log_reader_member, sysmon_installed=sysmon_installed
    )


# Polled by the agent each cycle rather than baked into its downloaded
# config, so adding/editing/pausing a source in Settings takes effect
# without redeploying the agent at all.
@router.get("/{agent_id}/sources", response_model=list[AgentSourceOut])
def list_agent_sources(agent: Agent = Depends(get_current_agent), db: Session = Depends(get_db)):
    sources = log_source_service.list_active_local_sources_for_agent(db, agent.id)
    return [AgentSourceOut.model_validate(s) for s in sources]


# Rate-limited per agent_id: a leaked/guessed agent key previously allowed
# unlimited fabricated log rows (and the alerts they'd trigger) to be
# injected into a real org's data with no throttle at all — a real
# integrity attack on a product whose whole point is being trustworthy
# evidence. 30/min is well above one agent's real ~30s collection cadence
# (allows bursts from multiple sources reporting in the same cycle) while
# still bounding a compromised-key abuse case to a fixed rate instead of
# "as fast as the network allows."
@router.post(
    "/{agent_id}/logs",
    response_model=LogIngestResponse,
    dependencies=[Depends(rate_limit("agent_logs", limit=30, window_seconds=60, key_by=by_agent_id))],
)
def ingest_agent_logs(
    payload: LogIngestRequest, agent: Agent = Depends(get_current_agent), db: Session = Depends(get_db)
):
    return log_service.ingest_logs(db, agent, payload)


# Called once per collection cycle for every local source the agent was
# assigned — independent of whether that cycle shipped any logs — so
# Settings can show a genuinely agent-reported health status, not a guess.
@router.post("/{agent_id}/sources/status", response_model=SourceStatusReportResponse)
def report_agent_source_status(
    payload: SourceStatusReportRequest, agent: Agent = Depends(get_current_agent), db: Session = Depends(get_db)
):
    updated = log_source_service.report_source_status(db, agent, payload)
    return SourceStatusReportResponse(updated=updated)


# What a hub calls on behalf of one of its relay children — authenticated at
# two layers: X-Agent-Key proves this caller is a legitimate hub agent
# (get_current_agent below), and payload.key proves it's actually acting on
# behalf of *this specific* child (relay_service._get_relay_child verifies
# it against the child's own agent_key_hash) — hub ownership of *some*
# child_id was previously being treated as authorization for *any*
# child_id, which a security review found exploitable by anyone able to
# reach the hub's local LAN listener (see SECURITY.md). Rate-limited per hub
# agent id, at a higher ceiling than a single direct-connect agent's own
# /heartbeat + /sources + /logs combined, since one hub call here can stand
# in for several children's worth of traffic each cycle.
@router.post(
    "/{agent_id}/relay-proxy",
    response_model=RelayProxyResponse,
    dependencies=[Depends(rate_limit("agent_relay_proxy", limit=120, window_seconds=60, key_by=by_agent_id))],
)
def relay_proxy(payload: RelayProxyRequest, agent: Agent = Depends(get_current_agent), db: Session = Depends(get_db)):
    if payload.kind == "register":
        if not payload.hostname:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "'hostname' is required when kind is 'register'")
        child = relay_service.relay_register(db, agent, payload.child_id, payload.key, payload.hostname)
        return RelayProxyResponse(heartbeat=HeartbeatResponse.model_validate(child))
    if payload.kind == "heartbeat":
        child = relay_service.relay_heartbeat(db, agent, payload.child_id, payload.key)
        return RelayProxyResponse(heartbeat=HeartbeatResponse.model_validate(child))
    if payload.kind == "sources":
        sources = relay_service.relay_list_sources(db, agent, payload.child_id, payload.key)
        return RelayProxyResponse(sources=[AgentSourceOut.model_validate(s) for s in sources])
    if payload.kind == "source_status":
        updated = relay_service.relay_report_source_status(
            db, agent, payload.child_id, payload.key, payload.source_status_results
        )
        return RelayProxyResponse(source_status=SourceStatusReportResponse(updated=updated))
    result = relay_service.relay_ingest_logs(db, agent, payload.child_id, payload.key, payload.logs)
    return RelayProxyResponse(logs=result)
