import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.agent import Agent, AgentStatus
from app.models.log import Log
from app.models.log_source import LogSource
from app.schemas.agents import AgentCreate, AgentRegisterRequest
from app.utils.crypto import encrypt_secret
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


# Same staleness rule as _sweep_stale, batched into one UPDATE + one commit
# instead of one per agent — list_agents' per-agent commit/refresh was an N+1
# hit continuously exercised by the dashboard's 30s polling once an org has
# more than a couple of stale agents.
def _sweep_stale_batch(db: Session, agents: list[Agent]) -> None:
    threshold = datetime.now(UTC) - STALE_AFTER
    stale_ids = [
        a.id
        for a in agents
        if a.status == AgentStatus.CONNECTED and a.last_seen_at is not None and a.last_seen_at <= threshold
    ]
    if not stale_ids:
        return
    db.execute(update(Agent).where(Agent.id.in_(stale_ids)).values(status=AgentStatus.DISCONNECTED))
    db.commit()
    for agent in agents:
        if agent.id in stale_ids:
            agent.status = AgentStatus.DISCONNECTED


def create_agent(db: Session, org_id: uuid.UUID, payload: AgentCreate) -> tuple[Agent, str]:
    raw_key = generate_agent_key()
    agent = Agent(
        org_id=org_id,
        name=payload.name,
        platform=payload.platform,
        agent_key_hash=hash_password(raw_key),
        agent_key_encrypted=encrypt_secret(raw_key),
        status=AgentStatus.PENDING,
        enrollment_expires_at=datetime.now(UTC) + ENROLLMENT_WINDOW,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent, raw_key


# Mirrors _sweep_stale/_sweep_stale_batch's lazy-on-read pattern: rather than
# a background job, an expired-but-still-pending agent's decryptable
# credential copy is wiped the next time anything reads it, so it doesn't
# sit around retrievable past its own displayed expiry.
def _sweep_expired_credential(db: Session, agent: Agent) -> Agent:
    if (
        agent.agent_key_encrypted is not None
        and agent.status == AgentStatus.PENDING
        and agent.enrollment_expires_at is not None
        and datetime.now(UTC) > agent.enrollment_expires_at
    ):
        agent.agent_key_encrypted = None
        db.commit()
        db.refresh(agent)
    return agent


def _sweep_expired_credentials_batch(db: Session, agents: list[Agent]) -> None:
    now = datetime.now(UTC)
    expired_ids = [
        a.id
        for a in agents
        if a.agent_key_encrypted is not None
        and a.status == AgentStatus.PENDING
        and a.enrollment_expires_at is not None
        and a.enrollment_expires_at <= now
    ]
    if not expired_ids:
        return
    db.execute(update(Agent).where(Agent.id.in_(expired_ids)).values(agent_key_encrypted=None))
    db.commit()
    for agent in agents:
        if agent.id in expired_ids:
            agent.agent_key_encrypted = None


def list_agents(db: Session, org_id: uuid.UUID) -> list[Agent]:
    agents = list(db.scalars(select(Agent).where(Agent.org_id == org_id)).all())
    _sweep_stale_batch(db, agents)
    _sweep_expired_credentials_batch(db, agents)
    return agents


def get_agent(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID) -> Agent:
    agent = db.scalar(select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id))
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    agent = _sweep_stale(db, agent)
    return _sweep_expired_credential(db, agent)


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
    # No longer needed once connected — don't keep a decryptable copy around.
    agent.agent_key_encrypted = None
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
    agent.agent_key_encrypted = encrypt_secret(raw_key)
    agent.enrollment_expires_at = datetime.now(UTC) + ENROLLMENT_WINDOW
    db.commit()
    db.refresh(agent)
    return agent, raw_key


def count_online(db: Session, org_id: uuid.UUID) -> tuple[int, int]:
    """(online, total) agent counts for dashboard aggregation.

    Deliberately does not trust the raw `status` column: CONNECTED is only
    flipped to DISCONNECTED lazily, when an agent is read through
    list_agents/get_agent (see _sweep_stale above) — there's no background
    sweep. A bulk COUNT(*) GROUP BY status here would see stale CONNECTED
    rows, so "online" is computed directly from last_seen_at instead.
    """
    total = db.scalar(select(func.count()).select_from(Agent).where(Agent.org_id == org_id)) or 0
    online = (
        db.scalar(
            select(func.count())
            .select_from(Agent)
            .where(
                Agent.org_id == org_id,
                Agent.status == AgentStatus.CONNECTED,
                Agent.last_seen_at.is_not(None),
                Agent.last_seen_at > datetime.now(UTC) - STALE_AFTER,
            )
        )
        or 0
    )
    return online, total


def set_primary_agent(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID) -> Agent:
    """Mark this agent as the org's primary, unsetting any previous one first.

    Two statements in one transaction rather than a DB constraint (e.g. a
    partial unique index) — consistent with this file's other invariants
    (staleness, credential expiry) being enforced here rather than in the
    schema.
    """
    agent = get_agent(db, org_id, agent_id)
    db.execute(update(Agent).where(Agent.org_id == org_id, Agent.is_primary.is_(True)).values(is_primary=False))
    agent.is_primary = True
    db.commit()
    db.refresh(agent)
    return agent


def delete_agent(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID) -> None:
    agent = get_agent(db, org_id, agent_id)
    # Detach rather than cascade-delete: a log source someone configured is
    # worth keeping even if the agent that was going to feed it never
    # connected (or gets replaced) — log_sources.agent_id is nullable for
    # exactly this reason.
    db.execute(update(LogSource).where(LogSource.agent_id == agent.id).values(agent_id=None))
    # Same rationale for ingested logs: they're audit/security-relevant
    # history that must survive the agent being deleted — logs.agent_id is
    # nullable for exactly this reason (see migration 0004).
    db.execute(update(Log).where(Log.agent_id == agent.id).values(agent_id=None))
    db.delete(agent)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Could not delete agent: it still has associated records"
        ) from exc
