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
    HeartbeatResponse,
)
from app.schemas.log_sources import SourceStatusReportRequest, SourceStatusReportResponse
from app.schemas.logs import LogIngestRequest, LogIngestResponse
from app.services import agent_service, log_service, log_source_service
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
# auth: this copy is generic, nothing agent- or org-specific is in it.
@router.get("/download/windows")
def download_windows_agent():
    return Response(
        content=_read_agent_binary(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="truepositive-agent.exe"'},
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
    return Response(
        content=binary_path.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="truepositive-agent-setup.exe"'},
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


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return agent_service.get_agent(db, current_user.org_id, agent_id)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    agent_service.delete_agent(db, current_user.org_id, agent_id)


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
# these two are called by the agent process, not the dashboard.
@router.post("/{agent_id}/register", response_model=AgentOut)
def register_agent(
    payload: AgentRegisterRequest, agent: Agent = Depends(get_current_agent), db: Session = Depends(get_db)
):
    return agent_service.register_agent(db, agent, payload)


@router.post("/{agent_id}/heartbeat", response_model=HeartbeatResponse)
def heartbeat(agent: Agent = Depends(get_current_agent), db: Session = Depends(get_db)):
    return agent_service.heartbeat(db, agent)


# Polled by the agent each cycle rather than baked into its downloaded
# config, so adding/editing/pausing a source in Settings takes effect
# without redeploying the agent at all.
@router.get("/{agent_id}/sources", response_model=list[AgentSourceOut])
def list_agent_sources(agent: Agent = Depends(get_current_agent), db: Session = Depends(get_db)):
    sources = log_source_service.list_active_local_sources_for_agent(db, agent.id)
    return [AgentSourceOut.model_validate(s) for s in sources]


@router.post("/{agent_id}/logs", response_model=LogIngestResponse)
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
