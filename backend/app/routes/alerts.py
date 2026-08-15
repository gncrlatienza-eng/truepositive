import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.alert import AlertStatus
from app.models.common import Severity
from app.models.user import User
from app.schemas.alert_rules import AlertRuleCreate, AlertRuleOut, AlertRuleUpdate
from app.schemas.alerts import AlertListResponse, AlertOut, AlertUpdate
from app.services import alert_rule_service, alert_service
from app.utils.security import get_current_user

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/ping")
def ping():
    return {"router": "alerts", "status": "ok"}


# "rules" is a literal sub-collection of /alerts, registered ahead of the
# typed {alert_id} lookup below — same discipline as /logs/sources.
@router.post("/rules", response_model=AlertRuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: AlertRuleCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return alert_rule_service.create_rule(db, current_user.org_id, payload)


@router.get("/rules", response_model=list[AlertRuleOut])
def list_rules(
    enabled: bool | None = None,
    q: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return alert_rule_service.list_rules(db, current_user.org_id, enabled=enabled, q=q)


@router.get("/rules/{rule_id}", response_model=AlertRuleOut)
def get_rule(rule_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return alert_rule_service.get_rule(db, current_user.org_id, rule_id)


@router.patch("/rules/{rule_id}", response_model=AlertRuleOut)
def update_rule(
    rule_id: uuid.UUID,
    payload: AlertRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return alert_rule_service.update_rule(db, current_user.org_id, rule_id, payload)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert_rule_service.delete_rule(db, current_user.org_id, rule_id)


@router.get("", response_model=AlertListResponse)
def list_alerts(
    status: AlertStatus | None = None,
    severity: Severity | None = None,
    rule_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alerts, total = alert_service.list_alerts(
        db,
        current_user.org_id,
        status_filter=status,
        severity=severity,
        rule_id=rule_id,
        assignee_id=assignee_id,
        limit=limit,
        offset=offset,
    )
    return AlertListResponse(
        items=[AlertOut.model_validate(a) for a in alerts], total=total, limit=limit, offset=offset
    )


@router.get("/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return alert_service.get_alert(db, current_user.org_id, alert_id)


@router.patch("/{alert_id}", response_model=AlertOut)
def update_alert(
    alert_id: uuid.UUID,
    payload: AlertUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return alert_service.update_alert(db, current_user.org_id, alert_id, payload)
