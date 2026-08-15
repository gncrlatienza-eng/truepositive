import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.log import Log
from app.models.log_source import LogSource, LogSourceStatus, LogSourceType
from app.schemas.log_sources import LogSourceCreate, LogSourceUpdate, SourceStatusReportRequest
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
    # Detach rather than cascade-delete: the logs this source already shipped
    # are audit/security-relevant history that must survive it being removed
    # — logs.source_id is nullable for exactly this reason (see migration 0005).
    db.execute(update(Log).where(Log.source_id == source.id).values(source_id=None))
    db.delete(source)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Could not delete data source: it still has associated records"
        ) from exc


# Local-only by design: real collection this sprint only reads the agent's
# own host (Windows Event Log channels / local files), never a remote SSH
# target, so remote sources are deliberately excluded here.
def list_active_local_sources_for_agent(db: Session, agent_id: uuid.UUID) -> list[LogSource]:
    return list(
        db.scalars(
            select(LogSource).where(
                LogSource.agent_id == agent_id,
                LogSource.status == LogSourceStatus.ACTIVE,
                LogSource.type == LogSourceType.LOCAL,
            )
        ).all()
    )


def report_source_status(db: Session, agent: Agent, payload: SourceStatusReportRequest) -> int:
    source_ids = {item.source_id for item in payload.results}
    owned_sources = db.scalars(
        select(LogSource.id).where(LogSource.id.in_(source_ids), LogSource.agent_id == agent.id)
    ).all()
    unknown = source_ids - set(owned_sources)
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Source id(s) not assigned to this agent: {', '.join(str(u) for u in sorted(unknown, key=str))}",
        )

    now = datetime.now(UTC)
    for item in payload.results:
        db.execute(
            update(LogSource)
            .where(LogSource.id == item.source_id)
            .values(
                last_collected_at=now,
                last_status=item.status,
                last_status_reason=item.reason if item.status == "error" else None,
            )
        )
    db.commit()
    return len(payload.results)
