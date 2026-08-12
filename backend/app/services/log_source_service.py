import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.log_source import LogSource, LogSourceStatus
from app.schemas.log_sources import LogSourceCreate, LogSourceUpdate
from app.utils.crypto import encrypt_secret


def _check_agent_ownership(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID | None) -> None:
    if agent_id is None:
        return
    agent = db.scalar(select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id))
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")


def create_log_source(db: Session, org_id: uuid.UUID, payload: LogSourceCreate) -> LogSource:
    _check_agent_ownership(db, org_id, payload.agent_id)

    log_source = LogSource(
        org_id=org_id,
        agent_id=payload.agent_id,
        name=payload.name,
        type=payload.type,
        protocol=payload.protocol,
        path=payload.path,
        host=payload.host,
        port=payload.port,
        username=payload.username,
        credential_type=payload.credential_type,
        credential_encrypted=encrypt_secret(payload.credential) if payload.credential else None,
        tags=payload.tags,
    )
    db.add(log_source)
    db.commit()
    db.refresh(log_source)
    return log_source


def list_log_sources(
    db: Session,
    org_id: uuid.UUID,
    status_filter: LogSourceStatus | None = None,
    agent_id: uuid.UUID | None = None,
) -> list[LogSource]:
    stmt = select(LogSource).where(LogSource.org_id == org_id)
    if status_filter is not None:
        stmt = stmt.where(LogSource.status == status_filter)
    if agent_id is not None:
        stmt = stmt.where(LogSource.agent_id == agent_id)
    return list(db.scalars(stmt).all())


def get_log_source(db: Session, org_id: uuid.UUID, source_id: uuid.UUID) -> LogSource:
    source = db.scalar(select(LogSource).where(LogSource.id == source_id, LogSource.org_id == org_id))
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Log source not found")
    return source


def update_log_source(db: Session, org_id: uuid.UUID, source_id: uuid.UUID, payload: LogSourceUpdate) -> LogSource:
    source = get_log_source(db, org_id, source_id)
    data = payload.model_dump(exclude_unset=True, exclude={"credential"})
    for field, value in data.items():
        setattr(source, field, value)
    if payload.credential is not None:
        source.credential_encrypted = encrypt_secret(payload.credential)
    db.commit()
    db.refresh(source)
    return source


def delete_log_source(db: Session, org_id: uuid.UUID, source_id: uuid.UUID) -> None:
    source = get_log_source(db, org_id, source_id)
    db.delete(source)
    db.commit()
