import csv
import io
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.alert import Alert, AlertStatus
from app.models.alert_rule import AlertRule
from app.models.common import Severity
from app.models.log import Log
from app.models.log_source import LogSource
from app.schemas.alert_rules import AlertRuleConditions
from app.schemas.logs import LogIngestRequest, LogIngestResponse, SortOrder
from app.utils.csv import csv_safe

MAX_LIMIT = 200
DEFAULT_LIMIT = 50
CSV_EXPORT_CAP = 5000

_SEVERITY_RANK: dict[Severity, int] = {Severity.OK: 0, Severity.MEDIUM: 1, Severity.HIGH: 2, Severity.CRITICAL: 3}


def _rule_matches(log: Log, conditions: dict) -> bool:
    # Re-validated through the same schema AlertRuleCreate/Update constrain
    # rule authoring with, rather than read as a raw dict — the schema
    # (what a rule's conditions can contain) and this matcher (what actually
    # gets evaluated) share one source of truth instead of two field lists
    # that could silently drift apart.
    parsed = AlertRuleConditions.model_validate(conditions)
    if parsed.event_type and log.event_type != parsed.event_type:
        return False
    if parsed.min_severity and _SEVERITY_RANK[log.severity] < _SEVERITY_RANK[parsed.min_severity]:
        return False
    if parsed.message_contains and parsed.message_contains.lower() not in log.message.lower():
        return False
    return True


def ingest_logs(db: Session, agent: Agent, payload: LogIngestRequest) -> LogIngestResponse:
    source_ids = {item.source_id for item in payload.logs}
    owned_sources = db.scalars(
        select(LogSource.id).where(LogSource.id.in_(source_ids), LogSource.agent_id == agent.id)
    ).all()
    unknown = source_ids - set(owned_sources)
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Source id(s) not assigned to this agent: {', '.join(str(u) for u in sorted(unknown, key=str))}",
        )

    logs = [
        Log(
            org_id=agent.org_id,
            agent_id=agent.id,
            source_id=item.source_id,
            timestamp=item.timestamp,
            severity=item.severity,
            event_type=item.event_type,
            message=item.message,
            raw=item.raw,
        )
        for item in payload.logs
    ]
    db.add_all(logs)
    db.flush()  # assigns Log.id so alerts below can reference log_id

    rules = list(db.scalars(select(AlertRule).where(AlertRule.org_id == agent.org_id, AlertRule.enabled)))
    alerts_created = 0
    for log in logs:
        for rule in rules:
            if _rule_matches(log, rule.conditions):
                db.add(
                    Alert(
                        org_id=agent.org_id,
                        rule_id=rule.id,
                        log_id=log.id,
                        severity=rule.severity,
                        status=AlertStatus.OPEN,
                        title=f"{rule.name} — {log.event_type}",
                        description=log.message,
                    )
                )
                alerts_created += 1

    # Flush alerts before playbook evaluation so alert.id is set and playbooks
    # can link the newly-created alert to any auto-created incident.
    db.flush()

    # Evaluate playbooks synchronously, matching the "no scheduler, inline"
    # philosophy established by alert-rule evaluation above (Sprint 5).
    # Imported here to avoid the circular dependency: playbook_service imports
    # _SEVERITY_RANK from this module.
    from app.services.playbook_service import evaluate_playbooks_for_log

    for log in logs:
        evaluate_playbooks_for_log(db, agent.org_id, log)

    db.commit()
    return LogIngestResponse(ingested=len(logs), alerts_created=alerts_created)


def _filtered_stmt(
    org_id: uuid.UUID,
    *,
    source_id: uuid.UUID | None,
    severity: Severity | None,
    event_type: str | None,
    since: datetime | None,
    until: datetime | None,
    q: str | None,
):
    stmt = select(Log).where(Log.org_id == org_id)
    if source_id is not None:
        stmt = stmt.where(Log.source_id == source_id)
    if severity is not None:
        stmt = stmt.where(Log.severity == severity)
    if event_type is not None:
        stmt = stmt.where(Log.event_type == event_type)
    if since is not None:
        stmt = stmt.where(Log.timestamp >= since)
    if until is not None:
        stmt = stmt.where(Log.timestamp < until)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Log.message.ilike(pattern), Log.event_type.ilike(pattern)))
    return stmt


def list_logs(
    db: Session,
    org_id: uuid.UUID,
    *,
    source_id: uuid.UUID | None = None,
    severity: Severity | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    q: str | None = None,
    sort: SortOrder = "timestamp_desc",
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> tuple[list[Log], int]:
    limit = min(limit, MAX_LIMIT)
    stmt = _filtered_stmt(
        org_id, source_id=source_id, severity=severity, event_type=event_type, since=since, until=until, q=q
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    order = Log.timestamp.desc() if sort == "timestamp_desc" else Log.timestamp.asc()
    rows = db.scalars(stmt.order_by(order).limit(limit).offset(offset)).all()
    return list(rows), total


def get_log(db: Session, org_id: uuid.UUID, log_id: int) -> Log:
    log = db.scalar(select(Log).where(Log.id == log_id, Log.org_id == org_id))
    if log is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Log not found")
    return log


def export_logs_csv(
    db: Session,
    org_id: uuid.UUID,
    *,
    source_id: uuid.UUID | None = None,
    severity: Severity | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    q: str | None = None,
) -> str:
    stmt = _filtered_stmt(
        org_id, source_id=source_id, severity=severity, event_type=event_type, since=since, until=until, q=q
    )
    rows = db.scalars(stmt.order_by(Log.timestamp.desc()).limit(CSV_EXPORT_CAP)).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "timestamp", "severity", "event_type", "source_id", "agent_id", "message"])
    for log in rows:
        writer.writerow(
            [
                log.id,
                log.timestamp.isoformat(),
                log.severity.value,
                csv_safe(log.event_type),
                log.source_id,
                log.agent_id,
                csv_safe(log.message),
            ]
        )
    return buffer.getvalue()
