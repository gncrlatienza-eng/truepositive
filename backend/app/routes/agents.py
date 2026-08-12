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
    HeartbeatResponse,
)
from app.services import agent_service
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
    binary_path = AGENT_BINARY_DIR / "tp_agent.exe"
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
        headers={"Content-Disposition": 'attachment; filename="tp_agent.exe"'},
    )


# The dashboard's actual "Download agent" button: one file, pre-configured,
# nothing else to place alongside it. Requires the caller to already hold
# the real enrollment key (verified against the stored hash below) — the
# backend never persists the raw key itself, only its bcrypt hash, so the
# frontend hands back the same key it received once from POST /agents.
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
        headers={"Content-Disposition": 'attachment; filename="tp_agent.exe"'},
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
