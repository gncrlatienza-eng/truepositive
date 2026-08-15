import csv
import io
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertStatus
from app.models.common import Severity
from app.models.user import User
from app.schemas.alerts import AlertUpdate
from app.utils.csv import csv_safe

MAX_LIMIT = 200
DEFAULT_LIMIT = 50
CSV_EXPORT_CAP = 5000


def _filtered_stmt(
    org_id: uuid.UUID,
    *,
    status_filter: AlertStatus | None,
    severity: Severity | None,
    rule_id: uuid.UUID | None,
    assignee_id: uuid.UUID | None,
    log_id: int | None = None,
    q: str | None = None,
):
    stmt = select(Alert).where(Alert.org_id == org_id)
    if status_filter is not None:
        stmt = stmt.where(Alert.status == status_filter)
    if severity is not None:
        stmt = stmt.where(Alert.severity == severity)
    if rule_id is not None:
        stmt = stmt.where(Alert.rule_id == rule_id)
    if assignee_id is not None:
        stmt = stmt.where(Alert.assignee_id == assignee_id)
    if log_id is not None:
        stmt = stmt.where(Alert.log_id == log_id)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Alert.title.ilike(pattern), Alert.description.ilike(pattern)))
    return stmt


def list_alerts(
    db: Session,
    org_id: uuid.UUID,
    *,
    status_filter: AlertStatus | None = None,
    severity: Severity | None = None,
    rule_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    log_id: int | None = None,
    q: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> tuple[list[Alert], int]:
    limit = min(limit, MAX_LIMIT)
    stmt = _filtered_stmt(
        org_id,
        status_filter=status_filter,
        severity=severity,
        rule_id=rule_id,
        assignee_id=assignee_id,
        log_id=log_id,
        q=q,
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Alert.created_at.desc()).limit(limit).offset(offset)).all()
    return list(rows), total


def export_alerts_csv(
    db: Session,
    org_id: uuid.UUID,
    *,
    status_filter: AlertStatus | None = None,
    severity: Severity | None = None,
    rule_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    q: str | None = None,
) -> str:
    stmt = _filtered_stmt(
        org_id, status_filter=status_filter, severity=severity, rule_id=rule_id, assignee_id=assignee_id, q=q
    )
    rows = db.scalars(stmt.order_by(Alert.created_at.desc()).limit(CSV_EXPORT_CAP)).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "created_at", "severity", "status", "title", "rule_id", "log_id", "assignee_id"])
    for alert in rows:
        writer.writerow(
            [
                alert.id,
                alert.created_at.isoformat(),
                alert.severity.value,
                alert.status.value,
                csv_safe(alert.title),
                alert.rule_id,
                alert.log_id,
                alert.assignee_id,
            ]
        )
    return buffer.getvalue()


def get_alert(db: Session, org_id: uuid.UUID, alert_id: uuid.UUID) -> Alert:
    alert = db.scalar(select(Alert).where(Alert.id == alert_id, Alert.org_id == org_id))
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    return alert


def update_alert(db: Session, org_id: uuid.UUID, alert_id: uuid.UUID, payload: AlertUpdate) -> Alert:
    alert = get_alert(db, org_id, alert_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("assignee_id") is not None:
        assignee = db.scalar(select(User).where(User.id == data["assignee_id"], User.org_id == org_id))
        if assignee is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignee not found in this org")
    for field, value in data.items():
        setattr(alert, field, value)
    db.commit()
    db.refresh(alert)
    return alert
