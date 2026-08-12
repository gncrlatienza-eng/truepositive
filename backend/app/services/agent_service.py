import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.agent import Agent, AgentStatus
from app.models.log_source import LogSource
from app.schemas.agents import AgentCreate, AgentRegisterRequest
from app.utils.security import generate_agent_key, hash_password

ENROLLMENT_WINDOW = timedelta(hours=24)
# 3 missed 30s heartbeats — matches the interval agents/OnboardingStep2 use.
STALE_AFTER = timedelta(seconds=90)


def _sweep_stale(db: Session, agent: Agent) -> Agent:
    if (
        agent.status == AgentStatus.CONNECTED
        and agent.last_seen_at is not None
        and datetime.now(UTC) - agent.last_seen_at > STALE_AFTER
    ):
        agent.status = AgentStatus.DISCONNECTED
        db.commit()
        db.refresh(agent)
    return agent


def create_agent(db: Session, org_id: uuid.UUID, payload: AgentCreate) -> tuple[Agent, str]:
    raw_key = generate_agent_key()
    agent = Agent(
        org_id=org_id,
        name=payload.name,
        platform=payload.platform,
        agent_key_hash=hash_password(raw_key),
        status=AgentStatus.PENDING,
        enrollment_expires_at=datetime.now(UTC) + ENROLLMENT_WINDOW,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent, raw_key


def list_agents(db: Session, org_id: uuid.UUID) -> list[Agent]:
    agents = db.scalars(select(Agent).where(Agent.org_id == org_id)).all()
    return [_sweep_stale(db, agent) for agent in agents]


def get_agent(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID) -> Agent:
    agent = db.scalar(select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id))
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    return _sweep_stale(db, agent)


def register_agent(db: Session, agent: Agent, payload: AgentRegisterRequest) -> Agent:
    if (
        agent.status == AgentStatus.PENDING
        and agent.enrollment_expires_at is not None
        and datetime.now(UTC) > agent.enrollment_expires_at
    ):
        raise HTTPException(status.HTTP_410_GONE, "Enrollment key has expired — generate new credentials")

    agent.status = AgentStatus.CONNECTED
    agent.hostname = payload.hostname
    agent.last_seen_at = datetime.now(UTC)
    db.commit()
    db.refresh(agent)
    return agent


def heartbeat(db: Session, agent: Agent) -> Agent:
    agent.last_seen_at = datetime.now(UTC)
    agent.status = AgentStatus.CONNECTED
    db.commit()
    db.refresh(agent)
    return agent


def rotate_key(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID) -> tuple[Agent, str]:
    # For when the original download/config was lost — the raw key was never
    # stored (only its hash), so there's no way to reissue the same one.
    # Rotating invalidates it and issues a fresh credential; status is left
    # as-is (a disconnected agent doesn't need "pending" again — the next
    # successful register/heartbeat with the new key marks it connected).
    agent = get_agent(db, org_id, agent_id)
    raw_key = generate_agent_key()
    agent.agent_key_hash = hash_password(raw_key)
    agent.enrollment_expires_at = datetime.now(UTC) + ENROLLMENT_WINDOW
    db.commit()
    db.refresh(agent)
    return agent, raw_key


def delete_agent(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID) -> None:
    agent = get_agent(db, org_id, agent_id)
    # Detach rather than cascade-delete: a log source someone configured is
    # worth keeping even if the agent that was going to feed it never
    # connected (or gets replaced) — log_sources.agent_id is nullable for
    # exactly this reason.
    db.execute(update(LogSource).where(LogSource.agent_id == agent.id).values(agent_id=None))
    db.delete(agent)
    db.commit()
