import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.common import Severity
from app.models.user import User
from app.schemas.dashboard import (
    AlertsPanel,
    CriticalPanel,
    DashboardSummary,
    EventsPanel,
    EventTypePanel,
    IngestionPanel,
    RiskPanel,
    RulePanel,
    SeverityPanel,
    TriagePanel,
)
from app.services import dashboard_service
from app.services.dashboard_service import Window
from app.utils.security import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/ping")
def ping():
    return {"router": "dashboard", "status": "ok"}


@router.get("/summary", response_model=DashboardSummary)
def get_summary(window: Window = "24h", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return dashboard_service.get_summary(db, current_user.org_id, window)


@router.get("/panels/critical", response_model=CriticalPanel)
def get_critical_panel(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return dashboard_service.get_critical_panel(db, current_user.org_id)


@router.get("/panels/ingestion", response_model=IngestionPanel)
def get_ingestion_panel(
    window: Window = "24h", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_ingestion_panel(db, current_user.org_id, window)


@router.get("/panels/events", response_model=EventsPanel)
def get_events_panel(
    window: Window = "24h", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_events_panel(db, current_user.org_id, window)


@router.get("/panels/alerts", response_model=AlertsPanel)
def get_alerts_panel(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return dashboard_service.get_alerts_panel(db, current_user.org_id)


@router.get("/panels/triage", response_model=TriagePanel)
def get_triage_panel(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return dashboard_service.get_triage_panel(db, current_user.org_id)


@router.get("/panels/risk", response_model=RiskPanel)
def get_risk_panel(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return dashboard_service.get_risk_panel(db, current_user.org_id)


@router.get("/panels/severity/{severity}", response_model=SeverityPanel)
def get_severity_panel(
    severity: Severity, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_severity_panel(db, current_user.org_id, severity)


@router.get("/panels/rule/{rule_id}", response_model=RulePanel)
def get_rule_panel(rule_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return dashboard_service.get_rule_panel(db, current_user.org_id, rule_id)


@router.get("/panels/event-type/{event_type}", response_model=EventTypePanel)
def get_event_type_panel(
    event_type: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_event_type_panel(db, current_user.org_id, event_type)
