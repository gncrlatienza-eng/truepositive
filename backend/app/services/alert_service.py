import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertStatus
from app.models.common import Severity
from app.models.user import User
from app.schemas.alerts import AlertUpdate

MAX_LIMIT = 200
DEFAULT_LIMIT = 50


def _filtered_stmt(
    org_id: uuid.UUID,
    *,
    status_filter: AlertStatus | None,
    severity: Severity | None,
    rule_id: uuid.UUID | None,
    assignee_id: uuid.UUID | None,
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
    return stmt


def list_alerts(
    db: Session,
    org_id: uuid.UUID,
    *,
    status_filter: AlertStatus | None = None,
    severity: Severity | None = None,
    rule_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> tuple[list[Alert], int]:
    limit = min(limit, MAX_LIMIT)
    stmt = _filtered_stmt(
        org_id, status_filter=status_filter, severity=severity, rule_id=rule_id, assignee_id=assignee_id
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Alert.created_at.desc()).limit(limit).offset(offset)).all()
    return list(rows), total


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
