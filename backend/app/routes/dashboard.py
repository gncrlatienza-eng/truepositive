import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.common import Severity
from app.models.user import User
from app.schemas.dashboard import (
    AgentsPanel,
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
def get_summary(
    window: Window = "24h",
    # Backs the dashboard's Scope Switcher — narrows every KPI/chart to one
    # device's own logs/alerts when a specific machine (not "All machines")
    # is selected. agents_online/agents_total stay fleet-wide regardless
    # (see dashboard_service.get_summary's own comment for why).
    agent_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_summary(db, current_user.org_id, window, agent_id=agent_id)


@router.get("/panels/critical", response_model=CriticalPanel)
def get_critical_panel(
    agent_id: uuid.UUID | None = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_critical_panel(db, current_user.org_id, agent_id=agent_id)


@router.get("/panels/ingestion", response_model=IngestionPanel)
def get_ingestion_panel(
    window: Window = "24h",
    agent_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_ingestion_panel(db, current_user.org_id, window, agent_id=agent_id)


@router.get("/panels/events", response_model=EventsPanel)
def get_events_panel(
    window: Window = "24h",
    agent_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_events_panel(db, current_user.org_id, window, agent_id=agent_id)


@router.get("/panels/alerts", response_model=AlertsPanel)
def get_alerts_panel(
    agent_id: uuid.UUID | None = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_alerts_panel(db, current_user.org_id, agent_id=agent_id)


@router.get("/panels/triage", response_model=TriagePanel)
def get_triage_panel(
    agent_id: uuid.UUID | None = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_triage_panel(db, current_user.org_id, agent_id=agent_id)


@router.get("/panels/risk", response_model=RiskPanel)
def get_risk_panel(
    agent_id: uuid.UUID | None = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_risk_panel(db, current_user.org_id, agent_id=agent_id)


@router.get("/panels/severity/{severity}", response_model=SeverityPanel)
def get_severity_panel(
    severity: Severity,
    agent_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_severity_panel(db, current_user.org_id, severity, agent_id=agent_id)


@router.get("/panels/rule/{rule_id}", response_model=RulePanel)
def get_rule_panel(
    rule_id: uuid.UUID,
    agent_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_rule_panel(db, current_user.org_id, rule_id, agent_id=agent_id)


@router.get("/panels/event-type/{event_type}", response_model=EventTypePanel)
def get_event_type_panel(
    event_type: str,
    agent_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_event_type_panel(db, current_user.org_id, event_type, agent_id=agent_id)


@router.get("/panels/agents", response_model=AgentsPanel)
def get_agents_panel(
    window: Window = "24h", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return dashboard_service.get_agents_panel(db, current_user.org_id, window)
