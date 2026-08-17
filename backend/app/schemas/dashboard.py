import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.agent import AgentPlatform, AgentStatus
from app.models.alert import AlertStatus
from app.models.common import Severity


class SeverityBar(BaseModel):
    severity: Severity
    label: str
    count: int
    pct: float


class AlertTypeRow(BaseModel):
    rule_id: uuid.UUID | None
    label: str
    count: int
    pct: float


class AlertQueueItem(BaseModel):
    # Read-only by design this sprint — no ack/escalate action fields, since
    # Alert CRUD + status transitions are Sprint 5 backend scope. Omitting
    # them here (not just in the UI) means the frontend physically cannot
    # fake a mutation that doesn't exist yet.
    id: uuid.UUID
    created_at: datetime
    severity: Severity
    status: AlertStatus
    title: str
    rule_label: str | None
    source_label: str | None


class SourceRow(BaseModel):
    source_id: uuid.UUID
    name: str
    host: str | None
    count: int
    pct: float


class HourBar(BaseModel):
    hour_label: str
    count: int


class KpiCard(BaseModel):
    key: str
    label: str
    value: str
    delta: float | None  # pct change vs the previous equal-length period; frontend picks direction/color per key
    delta_color: str | None
    sparkline: list[HourBar]  # reuses HourBar's (hour_label, count) shape so the chart can show a real axis


class StatusBanner(BaseModel):
    agents_online: int
    agents_total: int
    events_flowing: bool
    events_per_min: float
    last_heartbeat_at: datetime | None
    updated_at: datetime


class IngestSummary(BaseModel):
    peak_hour_label: str | None
    peak_count: int
    avg_per_hour: float
    today_total: int
    delta_vs_previous_pct: float | None
    status: str  # "healthy" | "quiet" — see dashboard_service for the real (non-fabricated) definition


class DashboardSummary(BaseModel):
    window: str
    banner: StatusBanner
    kpis: list[KpiCard]
    severity_breakdown: list[SeverityBar]
    top_alert_types: list[AlertTypeRow]
    alert_queue: list[AlertQueueItem]
    top_sources: list[SourceRow]
    ingest: IngestSummary


class CriticalPanel(BaseModel):
    count: int
    oldest_age_seconds: int | None
    oldest_title: str | None
    sla_breached: bool
    recent: list[AlertQueueItem]


class IngestionPanel(BaseModel):
    window: str
    hourly: list[HourBar]
    peak_hour_label: str | None
    peak_count: int
    avg_per_hour: float
    today_total: int
    delta_vs_previous_pct: float | None
    top_type: AlertTypeRow | None
    top_source: SourceRow | None


class EventsPanel(BaseModel):
    window: str
    total: int
    by_type: list[AlertTypeRow]
    by_source: list[SourceRow]
    hourly: list[HourBar]


class AlertsPanel(BaseModel):
    total: int
    by_status: dict[str, int]
    by_severity: list[SeverityBar]
    recent: list[AlertQueueItem]


class TriagePanel(BaseModel):
    median_seconds: float | None
    sample_size: int
    slowest_by_rule: list[AlertTypeRow]


class RiskBreakdownRow(BaseModel):
    severity: Severity
    count: int
    weight: float
    contribution: float


class RiskPanel(BaseModel):
    score: float
    level: str
    breakdown: list[RiskBreakdownRow]
    top_rule: AlertTypeRow | None


class SeverityPanel(BaseModel):
    severity: Severity
    count: int
    pct_of_active: float
    by_rule: list[AlertTypeRow]
    by_source: list[SourceRow]
    recent: list[AlertQueueItem]


class RulePanel(BaseModel):
    rule_id: uuid.UUID
    rule_name: str
    severity: Severity
    enabled: bool
    count_today: int
    count_yesterday: int
    weekly_avg: float
    monthly_avg: float
    vs_yesterday_pct: float | None
    vs_weekly_pct: float | None
    hourly: list[HourBar]
    recent: list[AlertQueueItem]
    top_sources: list[SourceRow]
    other_rules: list[AlertTypeRow]


class EventTypePanel(BaseModel):
    event_type: str
    log_count: int
    alert_count: int
    by_severity: list[SeverityBar]


class AgentPanelRow(BaseModel):
    id: uuid.UUID
    name: str
    platform: AgentPlatform
    status: AgentStatus
    hostname: str | None
    last_seen_at: datetime | None
    is_primary: bool
    event_count: int
    alert_count: int


class AgentsPanel(BaseModel):
    window: str
    agents: list[AgentPanelRow]
