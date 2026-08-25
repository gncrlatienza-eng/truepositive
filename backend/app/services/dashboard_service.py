import statistics
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertStatus
from app.models.alert_rule import AlertRule
from app.models.common import Severity
from app.models.log import Log
from app.models.log_source import LogSource
from app.schemas.dashboard import (
    AgentPanelRow,
    AgentsPanel,
    AlertQueueItem,
    AlertsPanel,
    AlertTypeRow,
    CriticalPanel,
    DashboardSummary,
    EventsPanel,
    EventTypePanel,
    HourBar,
    IngestionPanel,
    IngestSummary,
    KpiCard,
    RiskBreakdownRow,
    RiskPanel,
    RulePanel,
    SeverityBar,
    SeverityPanel,
    SourceRow,
    StatusBanner,
    TriagePanel,
)
from app.services import agent_service

Window = Literal["24h", "7d", "30d"]
_WINDOW_DELTAS: dict[Window, timedelta] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

# Reused verbatim from the UI mockup's own stated formula ("Score weights:
# Critical x4, High x2, Medium x1, Low x0.3") — a real, documented,
# deterministic function of real severity counts, not an ML claim. The
# mockup's "Low" maps to this schema's Severity.OK (there is no separate
# "low" value).
RISK_WEIGHTS: dict[Severity, float] = {
    Severity.CRITICAL: 4,
    Severity.HIGH: 2,
    Severity.MEDIUM: 1,
    Severity.OK: 0.3,
}

# Mockup's own stated thresholds for the same formula.
_RISK_LEVEL_THRESHOLDS: list[tuple[float, str]] = [(40, "High"), (20, "Elevated"), (8, "Moderate")]

SLA_MINUTES = 15
INGEST_HEALTHY_WINDOW = timedelta(minutes=5)

_SEVERITY_LABELS: dict[Severity, str] = {
    Severity.CRITICAL: "Critical",
    Severity.HIGH: "High",
    Severity.MEDIUM: "Medium",
    Severity.OK: "OK",
}


def _pct(count: int, total: int) -> float:
    return round(count / total * 100, 1) if total else 0.0


def _pct_change(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def _log_org_scope(org_id: uuid.UUID, agent_id: uuid.UUID | None) -> tuple:
    """Base predicate for any Log query feeding a *live* fleet-health
    number on this page (Overview's KPIs/panels) -- as opposed to a full
    audit search like /logs, where a retired device's history should still
    show up. Deleting an agent nulls its logs' agent_id rather than
    removing them (agent_service.delete_agent's audit-preserving design),
    so without this, a long-gone device's old rows keep counting toward
    "All machines" totals forever -- and as the rolling time window crosses
    whatever old data that device happened to leave behind, the total
    visibly swings for reasons that have nothing to do with current
    activity. Narrowing to one specific agent_id already excludes NULLs via
    equality, so this only changes anything in the agent_id=None case.
    """
    if agent_id is not None:
        return (Log.org_id == org_id, Log.agent_id == agent_id)
    return (Log.org_id == org_id, Log.agent_id.is_not(None))


def _scope_alert_by_log(stmt, agent_id: uuid.UUID | None):
    """Same rationale as _log_org_scope, applied to an Alert-based query.
    Alert.log_id is nullable (some alerts are never tied to a log at all),
    so this outer-joins rather than inner-joins — an inner join would
    silently drop every log-less alert from every "All machines" total,
    which is a different bug than the one this is fixing. Only exclude an
    alert whose log demonstrably belongs to a since-deleted agent (a real
    Log row exists but its agent_id is NULL); a log-less alert was never
    eligible to be "orphaned by agent deletion" in the first place, so it
    stays. Narrowing to one agent_id keeps its pre-existing behavior
    (log-less alerts still excluded, since Log.agent_id can't equal
    anything for a row that doesn't exist) — only the agent_id=None branch
    is new behavior.
    """
    stmt = stmt.outerjoin(Log, Log.id == Alert.log_id)
    if agent_id is not None:
        return stmt.where(Log.agent_id == agent_id)
    return stmt.where(or_(Log.agent_id.is_not(None), Alert.log_id.is_(None)))


def _hour_label(dt: datetime) -> str:
    return dt.strftime("%H:00")


def _risk_level(score: float) -> str:
    for threshold, label in _RISK_LEVEL_THRESHOLDS:
        if score > threshold:
            return label
    return "Low"


def _severity_breakdown(
    db: Session, org_id: uuid.UUID, agent_id: uuid.UUID | None = None
) -> tuple[list[SeverityBar], int]:
    stmt = select(Alert.severity, func.count()).where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED)
    # Alert has no agent_id of its own — _scope_alert_by_log joins through
    # the log that raised it, same pattern used throughout this file for
    # scoping an Alert-based query to one device (backs the Scope Switcher)
    # or, at agent_id=None, excluding alerts raised from a device that's
    # since been deleted (see _log_org_scope's docstring for the same
    # rationale on the Log side).
    stmt = _scope_alert_by_log(stmt, agent_id)
    rows = db.execute(stmt.group_by(Alert.severity)).all()
    counts: dict[Severity, int] = {sev: count for sev, count in rows}
    total = sum(counts.values())
    bars = [
        SeverityBar(
            severity=sev, label=_SEVERITY_LABELS[sev], count=counts.get(sev, 0), pct=_pct(counts.get(sev, 0), total)
        )
        for sev in (Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.OK)
    ]
    return bars, total


def _top_alert_types(
    db: Session, org_id: uuid.UUID, limit: int = 5, agent_id: uuid.UUID | None = None
) -> tuple[list[AlertTypeRow], int]:
    stmt = (
        select(Alert.rule_id, AlertRule.name, func.count())
        .join(AlertRule, AlertRule.id == Alert.rule_id)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED)
    )
    total_stmt = (
        select(func.count()).select_from(Alert).where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED)
    )
    stmt = _scope_alert_by_log(stmt, agent_id)
    total_stmt = _scope_alert_by_log(total_stmt, agent_id)
    rows = db.execute(stmt.group_by(Alert.rule_id, AlertRule.name).order_by(func.count().desc()).limit(limit)).all()
    total = db.scalar(total_stmt) or 0
    return [
        AlertTypeRow(rule_id=rule_id, label=name, count=count, pct=_pct(count, total)) for rule_id, name, count in rows
    ], total


def _top_sources(db: Session, org_id: uuid.UUID, limit: int = 5, agent_id: uuid.UUID | None = None) -> list[SourceRow]:
    # Inner join is intentional here (unlike _recent_alerts' outerjoin):
    # SourceRow.source_id/name are non-nullable, so an alert whose source was
    # since deleted (Log.source_id -> NULL, see log_source_service's
    # detach-don't-destroy pattern) has no source to attribute to a row in
    # this breakdown and is excluded, rather than forcing a fake group.
    stmt = (
        select(LogSource.id, LogSource.name, LogSource.host, func.count())
        .select_from(Alert)
        .join(Log, Log.id == Alert.log_id)
        .join(LogSource, LogSource.id == Log.source_id)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED)
    )
    # Log is already joined above (unconditionally) — same exclusion as
    # every other Alert-based query in this file, see _log_org_scope.
    stmt = stmt.where(Log.agent_id == agent_id if agent_id is not None else Log.agent_id.is_not(None))
    rows = db.execute(
        stmt.group_by(LogSource.id, LogSource.name, LogSource.host).order_by(func.count().desc()).limit(limit)
    ).all()
    total = sum(count for *_rest, count in rows)
    return [
        SourceRow(source_id=source_id, name=name, host=host, count=count, pct=_pct(count, total))
        for source_id, name, host, count in rows
    ]


def _recent_alerts(
    db: Session,
    org_id: uuid.UUID,
    limit: int = 5,
    rule_id: uuid.UUID | None = None,
    agent_id: uuid.UUID | None = None,
) -> list[AlertQueueItem]:
    stmt = (
        select(Alert, AlertRule.name, LogSource.name)
        .outerjoin(AlertRule, AlertRule.id == Alert.rule_id)
        .outerjoin(Log, Log.id == Alert.log_id)
        .outerjoin(LogSource, LogSource.id == Log.source_id)
        .where(Alert.org_id == org_id)
        .order_by(Alert.created_at.desc())
        .limit(limit)
    )
    if rule_id is not None:
        stmt = stmt.where(Alert.rule_id == rule_id)
    # Log is already outer-joined above (unconditionally) — same exclusion
    # as _scope_alert_by_log, including its log-less-alert carve-out (a
    # log-less alert has no way to be "from a deleted device's log").
    if agent_id is not None:
        stmt = stmt.where(Log.agent_id == agent_id)
    else:
        stmt = stmt.where(or_(Log.agent_id.is_not(None), Alert.log_id.is_(None)))
    rows = db.execute(stmt).all()
    return [
        AlertQueueItem(
            id=alert.id,
            created_at=alert.created_at,
            severity=alert.severity,
            status=alert.status,
            title=alert.title,
            rule_label=rule_name,
            source_label=source_name,
        )
        for alert, rule_name, source_name in rows
    ]


def _hourly_log_buckets(
    db: Session, org_id: uuid.UUID, since: datetime, agent_id: uuid.UUID | None = None
) -> list[HourBar]:
    stmt = select(func.date_trunc("hour", Log.timestamp), func.count()).where(
        *_log_org_scope(org_id, agent_id), Log.timestamp >= since
    )
    rows = db.execute(
        stmt.group_by(func.date_trunc("hour", Log.timestamp)).order_by(func.date_trunc("hour", Log.timestamp))
    ).all()
    return [HourBar(hour_label=_hour_label(bucket), bucket_start=bucket, count=count) for bucket, count in rows]


# Bucketed by Alert.created_at (when it fired), not current status — these
# feed KPI sparklines as a "pace of new activity" trend, distinct from the
# active/non-resolved snapshot counts the KPI's headline value shows.
def _hourly_alert_buckets(
    db: Session,
    org_id: uuid.UUID,
    since: datetime,
    severity: Severity | None = None,
    agent_id: uuid.UUID | None = None,
) -> list[HourBar]:
    stmt = select(func.date_trunc("hour", Alert.created_at), func.count()).where(
        Alert.org_id == org_id, Alert.created_at >= since
    )
    if severity is not None:
        stmt = stmt.where(Alert.severity == severity)
    stmt = _scope_alert_by_log(stmt, agent_id)
    rows = db.execute(
        stmt.group_by(func.date_trunc("hour", Alert.created_at)).order_by(func.date_trunc("hour", Alert.created_at))
    ).all()
    return [HourBar(hour_label=_hour_label(bucket), bucket_start=bucket, count=count) for bucket, count in rows]


def _hourly_risk_buckets(
    db: Session, org_id: uuid.UUID, since: datetime, agent_id: uuid.UUID | None = None
) -> list[HourBar]:
    stmt = select(func.date_trunc("hour", Alert.created_at), Alert.severity, func.count()).where(
        Alert.org_id == org_id, Alert.created_at >= since
    )
    stmt = _scope_alert_by_log(stmt, agent_id)
    rows = db.execute(
        stmt.group_by(func.date_trunc("hour", Alert.created_at), Alert.severity).order_by(
            func.date_trunc("hour", Alert.created_at)
        )
    ).all()
    scores: dict[datetime, float] = {}
    for bucket, severity, count in rows:
        scores[bucket] = scores.get(bucket, 0.0) + count * RISK_WEIGHTS[severity]
    # HourBar.count is an int (shared with real event/alert counts elsewhere)
    # — round rather than widen the shared schema just for this one sparkline.
    return [
        HourBar(hour_label=_hour_label(bucket), bucket_start=bucket, count=round(v)) for bucket, v in scores.items()
    ]


# Same weighted formula as _risk_score, but over alerts *created* in a given
# window rather than the currently-active/non-resolved snapshot — answers
# "how much risk arrived in this period," used only for the KPI's delta.
def _weighted_score_for_period(
    db: Session,
    org_id: uuid.UUID,
    since: datetime,
    until: datetime | None = None,
    agent_id: uuid.UUID | None = None,
) -> float:
    stmt = select(Alert.severity, func.count()).where(Alert.org_id == org_id, Alert.created_at >= since)
    if until is not None:
        stmt = stmt.where(Alert.created_at < until)
    stmt = _scope_alert_by_log(stmt, agent_id)
    rows = db.execute(stmt.group_by(Alert.severity)).all()
    return round(sum(count * RISK_WEIGHTS[sev] for sev, count in rows), 1)


def _count_alerts(
    db: Session,
    org_id: uuid.UUID,
    since: datetime,
    until: datetime | None = None,
    severity: Severity | None = None,
    agent_id: uuid.UUID | None = None,
) -> int:
    stmt = select(func.count()).select_from(Alert).where(Alert.org_id == org_id, Alert.created_at >= since)
    if until is not None:
        stmt = stmt.where(Alert.created_at < until)
    if severity is not None:
        stmt = stmt.where(Alert.severity == severity)
    stmt = _scope_alert_by_log(stmt, agent_id)
    return db.scalar(stmt) or 0


def _ingest_summary(db: Session, org_id: uuid.UUID, window: Window, agent_id: uuid.UUID | None = None) -> IngestSummary:
    now = datetime.now(UTC)
    since = now - _WINDOW_DELTAS[window]
    buckets = _hourly_log_buckets(db, org_id, since, agent_id=agent_id)

    if buckets:
        peak = max(buckets, key=lambda b: b.count)
        peak_hour_label, peak_hour_start, peak_count = peak.hour_label, peak.bucket_start, peak.count
        avg_per_hour = round(sum(b.count for b in buckets) / len(buckets), 1)
    else:
        peak_hour_label, peak_hour_start, peak_count, avg_per_hour = None, None, 0, 0.0

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_stmt = (
        select(func.count()).select_from(Log).where(*_log_org_scope(org_id, agent_id), Log.timestamp >= today_start)
    )
    yesterday_start = today_start - timedelta(days=1)
    yesterday_stmt = (
        select(func.count())
        .select_from(Log)
        .where(*_log_org_scope(org_id, agent_id), Log.timestamp >= yesterday_start, Log.timestamp < today_start)
    )
    flowing_stmt = (
        select(func.count())
        .select_from(Log)
        .where(*_log_org_scope(org_id, agent_id), Log.timestamp >= now - INGEST_HEALTHY_WINDOW)
    )
    today_total = db.scalar(today_stmt) or 0
    yesterday_total = db.scalar(yesterday_stmt) or 0
    events_flowing = bool(db.scalar(flowing_stmt))

    return IngestSummary(
        peak_hour_label=peak_hour_label,
        peak_hour_start=peak_hour_start,
        peak_count=peak_count,
        avg_per_hour=avg_per_hour,
        today_total=today_total,
        delta_vs_previous_pct=_pct_change(today_total, yesterday_total),
        status="healthy" if events_flowing else "quiet",
    )


def get_summary(
    db: Session, org_id: uuid.UUID, window: Window = "24h", agent_id: uuid.UUID | None = None
) -> DashboardSummary:
    now = datetime.now(UTC)
    since = now - _WINDOW_DELTAS[window]
    prev_since = since - _WINDOW_DELTAS[window]  # equal-length window immediately before `since`, for KPI deltas

    # Deliberately NOT scoped by agent_id — "agents online X/Y" is fleet
    # health info, not something that means much narrowed to one device (it
    # would just read "1/1" or "0/1"). Every other stat below does scope.
    online, total_agents = agent_service.count_online(db, org_id)

    events_per_min_stmt = (
        select(func.count())
        .select_from(Log)
        .where(*_log_org_scope(org_id, agent_id), Log.timestamp >= now - timedelta(seconds=60))
    )
    last_heartbeat_stmt = select(func.max(Log.timestamp)).where(*_log_org_scope(org_id, agent_id))
    window_events_stmt = (
        select(func.count()).select_from(Log).where(*_log_org_scope(org_id, agent_id), Log.timestamp >= since)
    )
    prev_window_events_stmt = (
        select(func.count())
        .select_from(Log)
        .where(*_log_org_scope(org_id, agent_id), Log.timestamp >= prev_since, Log.timestamp < since)
    )
    active_alerts_stmt = _scope_alert_by_log(
        select(func.count()).select_from(Alert).where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED),
        agent_id,
    )
    critical_alerts_stmt = _scope_alert_by_log(
        select(func.count())
        .select_from(Alert)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.severity == Severity.CRITICAL),
        agent_id,
    )

    events_per_min = float(db.scalar(events_per_min_stmt) or 0)
    last_heartbeat_at = db.scalar(last_heartbeat_stmt)  # best real proxy for "last activity" available
    window_events = db.scalar(window_events_stmt) or 0
    prev_window_events = db.scalar(prev_window_events_stmt) or 0
    active_alerts = db.scalar(active_alerts_stmt) or 0
    critical_alerts = db.scalar(critical_alerts_stmt) or 0
    risk = _risk_score(db, org_id, agent_id=agent_id)

    # active_alerts/critical_alerts/risk above are current snapshots (no
    # history table to compare "as of the start of the window" against), so
    # their KPI deltas instead compare the *pace of new alerts* this window
    # vs the equal-length window before it — still a real, deterministic
    # signal, just answering "is it trending up" rather than "vs itself
    # earlier."
    alerts_created_window = _count_alerts(db, org_id, since, agent_id=agent_id)
    alerts_created_prev = _count_alerts(db, org_id, prev_since, since, agent_id=agent_id)
    critical_created_window = _count_alerts(db, org_id, since, severity=Severity.CRITICAL, agent_id=agent_id)
    critical_created_prev = _count_alerts(db, org_id, prev_since, since, severity=Severity.CRITICAL, agent_id=agent_id)
    risk_window_score = _weighted_score_for_period(db, org_id, since, agent_id=agent_id)
    risk_prev_score = _weighted_score_for_period(db, org_id, prev_since, since, agent_id=agent_id)

    severity_breakdown, _ = _severity_breakdown(db, org_id, agent_id=agent_id)
    top_alert_types, _ = _top_alert_types(db, org_id, agent_id=agent_id)
    ingest = _ingest_summary(db, org_id, window, agent_id=agent_id)
    # Shared by the Events and Ingestion rate sparklines.
    events_hourly = _hourly_log_buckets(db, org_id, since, agent_id=agent_id)

    kpis = [
        KpiCard(
            key="events",
            label="Events",
            value=f"{window_events:,}",
            delta=_pct_change(window_events, prev_window_events),
            delta_color=None,
            sparkline=events_hourly,
        ),
        KpiCard(
            key="alerts",
            label="Active alerts",
            value=str(active_alerts),
            delta=_pct_change(alerts_created_window, alerts_created_prev),
            delta_color=None,
            sparkline=_hourly_alert_buckets(db, org_id, since, agent_id=agent_id),
        ),
        KpiCard(
            key="critical",
            label="Critical",
            value=str(critical_alerts),
            delta=_pct_change(critical_created_window, critical_created_prev),
            delta_color="#dc2626" if critical_alerts else None,
            sparkline=_hourly_alert_buckets(db, org_id, since, severity=Severity.CRITICAL, agent_id=agent_id),
        ),
        KpiCard(
            key="ingestion",
            label="Ingestion rate",
            value=f"{events_per_min:.0f}/min",
            delta=ingest.delta_vs_previous_pct,
            delta_color=None,
            sparkline=events_hourly,
        ),
        KpiCard(
            key="risk",
            label="Risk score",
            # Only show a decimal when the weighted score actually has one —
            # whole scores (common, since OK-severity logs rarely generate
            # alerts) previously always rendered as e.g. "150.0", which reads
            # as an unpolished placeholder rather than a real weighted value.
            value=(
                f"{risk.score:.0f} · {risk.level}"
                if risk.score == round(risk.score)
                else f"{risk.score:.1f} · {risk.level}"
            ),
            delta=_pct_change(risk_window_score, risk_prev_score),
            delta_color=None,
            sparkline=_hourly_risk_buckets(db, org_id, since, agent_id=agent_id),
        ),
    ]

    return DashboardSummary(
        window=window,
        banner=StatusBanner(
            agents_online=online,
            agents_total=total_agents,
            events_flowing=ingest.status == "healthy",
            events_per_min=events_per_min,
            last_heartbeat_at=last_heartbeat_at,
            updated_at=now,
        ),
        kpis=kpis,
        severity_breakdown=severity_breakdown,
        top_alert_types=top_alert_types,
        alert_queue=_recent_alerts(db, org_id, agent_id=agent_id),
        top_sources=_top_sources(db, org_id, agent_id=agent_id),
        ingest=ingest,
    )


def get_critical_panel(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> CriticalPanel:
    now = datetime.now(UTC)
    count_stmt = (
        select(func.count())
        .select_from(Alert)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.severity == Severity.CRITICAL)
    )
    oldest_stmt = (
        select(Alert)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.severity == Severity.CRITICAL)
        .order_by(Alert.created_at.asc())
        .limit(1)
    )
    recent_stmt = (
        select(Alert, AlertRule.name, LogSource.name)
        .outerjoin(AlertRule, AlertRule.id == Alert.rule_id)
        .outerjoin(Log, Log.id == Alert.log_id)
        .outerjoin(LogSource, LogSource.id == Log.source_id)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.severity == Severity.CRITICAL)
        .order_by(Alert.created_at.desc())
        .limit(5)
    )
    count_stmt = _scope_alert_by_log(count_stmt, agent_id)
    oldest_stmt = _scope_alert_by_log(oldest_stmt, agent_id)
    # recent_stmt already outer-joins Log above (unconditionally) — same
    # exclusion as _scope_alert_by_log, including its log-less-alert
    # carve-out (a log-less alert has no way to be "from a deleted device").
    if agent_id is not None:
        recent_stmt = recent_stmt.where(Log.agent_id == agent_id)
    else:
        recent_stmt = recent_stmt.where(or_(Log.agent_id.is_not(None), Alert.log_id.is_(None)))

    count = db.scalar(count_stmt) or 0
    oldest = db.scalar(oldest_stmt)
    oldest_age_seconds = int((now - oldest.created_at).total_seconds()) if oldest else None
    recent = db.execute(recent_stmt).all()
    return CriticalPanel(
        count=count,
        oldest_age_seconds=oldest_age_seconds,
        oldest_title=oldest.title if oldest else None,
        sla_breached=oldest_age_seconds is not None and oldest_age_seconds > SLA_MINUTES * 60,
        recent=[
            AlertQueueItem(
                id=a.id,
                created_at=a.created_at,
                severity=a.severity,
                status=a.status,
                title=a.title,
                rule_label=rule_name,
                source_label=source_name,
            )
            for a, rule_name, source_name in recent
        ],
    )


def get_ingestion_panel(
    db: Session, org_id: uuid.UUID, window: Window = "24h", agent_id: uuid.UUID | None = None
) -> IngestionPanel:
    now = datetime.now(UTC)
    since = now - _WINDOW_DELTAS[window]
    summary = _ingest_summary(db, org_id, window, agent_id=agent_id)
    hourly = _hourly_log_buckets(db, org_id, since, agent_id=agent_id)
    top_types, _ = _top_alert_types(db, org_id, limit=1, agent_id=agent_id)
    top_sources = _top_sources(db, org_id, limit=1, agent_id=agent_id)
    return IngestionPanel(
        window=window,
        hourly=hourly,
        peak_hour_label=summary.peak_hour_label,
        peak_hour_start=summary.peak_hour_start,
        peak_count=summary.peak_count,
        avg_per_hour=summary.avg_per_hour,
        today_total=summary.today_total,
        delta_vs_previous_pct=summary.delta_vs_previous_pct,
        top_type=top_types[0] if top_types else None,
        top_source=top_sources[0] if top_sources else None,
    )


def get_events_panel(
    db: Session, org_id: uuid.UUID, window: Window = "24h", agent_id: uuid.UUID | None = None
) -> EventsPanel:
    now = datetime.now(UTC)
    since = now - _WINDOW_DELTAS[window]
    total_stmt = select(func.count()).select_from(Log).where(*_log_org_scope(org_id, agent_id), Log.timestamp >= since)
    type_stmt = (
        select(Log.event_type, func.count())
        .where(*_log_org_scope(org_id, agent_id), Log.timestamp >= since)
        .group_by(Log.event_type)
        .order_by(func.count().desc())
        .limit(5)
    )
    source_stmt = (
        select(LogSource.id, LogSource.name, LogSource.host, func.count())
        .select_from(Log)
        .join(LogSource, LogSource.id == Log.source_id)
        .where(*_log_org_scope(org_id, agent_id), Log.timestamp >= since)
        .group_by(LogSource.id, LogSource.name, LogSource.host)
        .order_by(func.count().desc())
        .limit(5)
    )

    total = db.scalar(total_stmt) or 0
    type_rows = db.execute(type_stmt).all()
    by_type = [
        AlertTypeRow(rule_id=None, label=event_type, count=count, pct=_pct(count, total))
        for event_type, count in type_rows
    ]

    source_rows = db.execute(source_stmt).all()
    # pct relative to these rows' own sum, not `total` (all logs in the
    # window) — a log's source_id can be null if its source was since
    # deleted (detach-don't-destroy), and those logs have no source to
    # attribute here; comparing against `total` would understate every row's
    # percentage without explaining why. Same convention as _top_sources.
    source_total = sum(count for *_rest, count in source_rows)
    by_source = [
        SourceRow(source_id=source_id, name=name, host=host, count=count, pct=_pct(count, source_total))
        for source_id, name, host, count in source_rows
    ]

    return EventsPanel(
        window=window,
        total=total,
        by_type=by_type,
        by_source=by_source,
        hourly=_hourly_log_buckets(db, org_id, since, agent_id=agent_id),
    )


def get_alerts_panel(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> AlertsPanel:
    total_stmt = (
        select(func.count()).select_from(Alert).where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED)
    )
    status_stmt = select(Alert.status, func.count()).where(Alert.org_id == org_id)
    total_stmt = _scope_alert_by_log(total_stmt, agent_id)
    status_stmt = _scope_alert_by_log(status_stmt, agent_id)

    total = db.scalar(total_stmt) or 0
    status_rows = db.execute(status_stmt.group_by(Alert.status)).all()
    by_status = {s.value: count for s, count in status_rows}
    severity_breakdown, _ = _severity_breakdown(db, org_id, agent_id=agent_id)
    return AlertsPanel(
        total=total,
        by_status=by_status,
        by_severity=severity_breakdown,
        recent=_recent_alerts(db, org_id, agent_id=agent_id),
    )


def get_triage_panel(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> TriagePanel:
    deltas_stmt = select(func.extract("epoch", Alert.updated_at - Alert.created_at)).where(
        Alert.org_id == org_id, Alert.status != AlertStatus.OPEN
    )
    slow_stmt = (
        select(Alert.rule_id, AlertRule.name, func.avg(func.extract("epoch", Alert.updated_at - Alert.created_at)))
        .join(AlertRule, AlertRule.id == Alert.rule_id)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.OPEN)
    )
    deltas_stmt = _scope_alert_by_log(deltas_stmt, agent_id)
    slow_stmt = _scope_alert_by_log(slow_stmt, agent_id)

    deltas = db.scalars(deltas_stmt).all()
    deltas = [d for d in deltas if d is not None]

    slow_rows = db.execute(
        slow_stmt.group_by(Alert.rule_id, AlertRule.name)
        .order_by(func.avg(func.extract("epoch", Alert.updated_at - Alert.created_at)).desc())
        .limit(5)
    ).all()

    return TriagePanel(
        median_seconds=statistics.median(deltas) if deltas else None,
        sample_size=len(deltas),
        slowest_by_rule=[
            AlertTypeRow(rule_id=rule_id, label=name, count=round(avg_seconds), pct=0.0)
            for rule_id, name, avg_seconds in slow_rows
        ],
    )


def _risk_score(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> RiskPanel:
    stmt = select(Alert.severity, func.count()).where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED)
    stmt = _scope_alert_by_log(stmt, agent_id)
    rows = db.execute(stmt.group_by(Alert.severity)).all()
    counts: dict[Severity, int] = {sev: count for sev, count in rows}
    breakdown = []
    score = 0.0
    for sev in (Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.OK):
        count = counts.get(sev, 0)
        weight = RISK_WEIGHTS[sev]
        contribution = round(count * weight, 1)
        score += contribution
        breakdown.append(RiskBreakdownRow(severity=sev, count=count, weight=weight, contribution=contribution))
    top_rules, _ = _top_alert_types(db, org_id, limit=1, agent_id=agent_id)
    return RiskPanel(
        score=round(score, 1),
        level=_risk_level(score),
        breakdown=breakdown,
        top_rule=top_rules[0] if top_rules else None,
    )


def get_risk_panel(db: Session, org_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> RiskPanel:
    return _risk_score(db, org_id, agent_id=agent_id)


def get_severity_panel(
    db: Session, org_id: uuid.UUID, severity: Severity, agent_id: uuid.UUID | None = None
) -> SeverityPanel:
    count_stmt = (
        select(func.count())
        .select_from(Alert)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.severity == severity)
    )
    total_active_stmt = (
        select(func.count()).select_from(Alert).where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED)
    )
    rule_stmt = (
        select(Alert.rule_id, AlertRule.name, func.count())
        .join(AlertRule, AlertRule.id == Alert.rule_id)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.severity == severity)
    )
    source_stmt = (
        select(LogSource.id, LogSource.name, LogSource.host, func.count())
        .select_from(Alert)
        .join(Log, Log.id == Alert.log_id)
        .join(LogSource, LogSource.id == Log.source_id)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.severity == severity)
    )
    recent_stmt = (
        select(Alert, AlertRule.name, LogSource.name)
        .outerjoin(AlertRule, AlertRule.id == Alert.rule_id)
        .outerjoin(Log, Log.id == Alert.log_id)
        .outerjoin(LogSource, LogSource.id == Log.source_id)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.severity == severity)
        .order_by(Alert.created_at.desc())
        .limit(5)
    )
    count_stmt = _scope_alert_by_log(count_stmt, agent_id)
    total_active_stmt = _scope_alert_by_log(total_active_stmt, agent_id)
    rule_stmt = _scope_alert_by_log(rule_stmt, agent_id)
    # source_stmt inner-joins Log above — a log-less alert has no source to
    # attribute either way, so it's correctly excluded regardless (matches
    # _top_sources' own convention). recent_stmt outer-joins, so it needs
    # the same log-less-alert carve-out as _scope_alert_by_log.
    if agent_id is not None:
        source_stmt = source_stmt.where(Log.agent_id == agent_id)
        recent_stmt = recent_stmt.where(Log.agent_id == agent_id)
    else:
        source_stmt = source_stmt.where(Log.agent_id.is_not(None))
        recent_stmt = recent_stmt.where(or_(Log.agent_id.is_not(None), Alert.log_id.is_(None)))

    count = db.scalar(count_stmt) or 0
    total_active = db.scalar(total_active_stmt) or 0

    rule_rows = db.execute(
        rule_stmt.group_by(Alert.rule_id, AlertRule.name).order_by(func.count().desc()).limit(5)
    ).all()
    by_rule = [AlertTypeRow(rule_id=rid, label=name, count=c, pct=_pct(c, count)) for rid, name, c in rule_rows]

    source_rows = db.execute(
        source_stmt.group_by(LogSource.id, LogSource.name, LogSource.host).order_by(func.count().desc()).limit(5)
    ).all()
    # pct relative to these rows' own sum, not `count` (total active alerts
    # of this severity) — see _top_sources for why alerts with a since-
    # deleted source are excluded here rather than skewing the percentages.
    source_total = sum(c for *_rest, c in source_rows)
    by_source = [
        SourceRow(source_id=sid, name=name, host=host, count=c, pct=_pct(c, source_total))
        for sid, name, host, c in source_rows
    ]

    recent = db.execute(recent_stmt).all()

    return SeverityPanel(
        severity=severity,
        count=count,
        pct_of_active=_pct(count, total_active),
        by_rule=by_rule,
        by_source=by_source,
        recent=[
            AlertQueueItem(
                id=a.id,
                created_at=a.created_at,
                severity=a.severity,
                status=a.status,
                title=a.title,
                rule_label=rn,
                source_label=sn,
            )
            for a, rn, sn in recent
        ],
    )


def get_rule_panel(db: Session, org_id: uuid.UUID, rule_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> RulePanel:
    rule = db.scalar(select(AlertRule).where(AlertRule.id == rule_id, AlertRule.org_id == org_id))
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert rule not found")

    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    def _count_since(since: datetime, until: datetime | None = None) -> int:
        stmt = (
            select(func.count())
            .select_from(Alert)
            .where(Alert.org_id == org_id, Alert.rule_id == rule_id, Alert.created_at >= since)
        )
        if until is not None:
            stmt = stmt.where(Alert.created_at < until)
        stmt = _scope_alert_by_log(stmt, agent_id)
        return db.scalar(stmt) or 0

    count_today = _count_since(today_start)
    count_yesterday = _count_since(yesterday_start, today_start)
    weekly_avg = round(_count_since(week_start) / 7, 1)
    monthly_avg = round(_count_since(month_start) / 30, 1)

    hourly_stmt = select(func.date_trunc("hour", Alert.created_at), func.count()).where(
        Alert.org_id == org_id, Alert.rule_id == rule_id, Alert.created_at >= now - timedelta(hours=24)
    )
    source_stmt = (
        select(LogSource.id, LogSource.name, LogSource.host, func.count())
        .select_from(Alert)
        .join(Log, Log.id == Alert.log_id)
        .join(LogSource, LogSource.id == Log.source_id)
        .where(Alert.org_id == org_id, Alert.rule_id == rule_id)
    )
    other_stmt = (
        select(Alert.rule_id, AlertRule.name, func.count())
        .join(AlertRule, AlertRule.id == Alert.rule_id)
        .where(Alert.org_id == org_id, Alert.status != AlertStatus.RESOLVED, Alert.rule_id != rule_id)
    )
    hourly_stmt = _scope_alert_by_log(hourly_stmt, agent_id)
    # source_stmt already joins Log above (unconditionally) — same exclusion
    # as every other Alert-based query in this file, see _log_org_scope.
    source_stmt = source_stmt.where(Log.agent_id == agent_id if agent_id is not None else Log.agent_id.is_not(None))
    other_stmt = _scope_alert_by_log(other_stmt, agent_id)

    hourly_rows = db.execute(
        hourly_stmt.group_by(func.date_trunc("hour", Alert.created_at)).order_by(
            func.date_trunc("hour", Alert.created_at)
        )
    ).all()
    hourly = [
        HourBar(hour_label=_hour_label(bucket), bucket_start=bucket, count=count) for bucket, count in hourly_rows
    ]

    source_rows = db.execute(
        source_stmt.group_by(LogSource.id, LogSource.name, LogSource.host).order_by(func.count().desc()).limit(5)
    ).all()
    # pct relative to these rows' own sum, not count_today (a different,
    # source-agnostic count) — see _top_sources for why alerts with a since-
    # deleted source are excluded here rather than skewing the percentages.
    source_total = sum(c for *_rest, c in source_rows) or 1
    top_sources = [
        SourceRow(source_id=sid, name=name, host=host, count=c, pct=_pct(c, source_total))
        for sid, name, host, c in source_rows
    ]

    other_rows = db.execute(
        other_stmt.group_by(Alert.rule_id, AlertRule.name).order_by(func.count().desc()).limit(5)
    ).all()
    other_total = sum(c for *_r, c in other_rows) or 1
    other_rules = [
        AlertTypeRow(rule_id=rid, label=name, count=c, pct=_pct(c, other_total)) for rid, name, c in other_rows
    ]

    return RulePanel(
        rule_id=rule.id,
        rule_name=rule.name,
        severity=rule.severity,
        enabled=rule.enabled,
        count_today=count_today,
        count_yesterday=count_yesterday,
        weekly_avg=weekly_avg,
        monthly_avg=monthly_avg,
        vs_yesterday_pct=_pct_change(count_today, count_yesterday),
        vs_weekly_pct=_pct_change(count_today, weekly_avg),
        hourly=hourly,
        recent=_recent_alerts(db, org_id, rule_id=rule_id, agent_id=agent_id),
        top_sources=top_sources,
        other_rules=other_rules,
    )


def get_event_type_panel(
    db: Session, org_id: uuid.UUID, event_type: str, agent_id: uuid.UUID | None = None
) -> EventTypePanel:
    log_count_stmt = (
        select(func.count()).select_from(Log).where(*_log_org_scope(org_id, agent_id), Log.event_type == event_type)
    )
    alert_count_stmt = (
        select(func.count())
        .select_from(Alert)
        .join(Log, Log.id == Alert.log_id)
        .where(
            Alert.org_id == org_id,
            Log.event_type == event_type,
            Log.agent_id == agent_id if agent_id is not None else Log.agent_id.is_not(None),
        )
    )
    sev_stmt = select(Log.severity, func.count()).where(*_log_org_scope(org_id, agent_id), Log.event_type == event_type)

    log_count = db.scalar(log_count_stmt) or 0
    alert_count = db.scalar(alert_count_stmt) or 0
    sev_rows = db.execute(sev_stmt.group_by(Log.severity)).all()
    sev_counts: dict[Severity, int] = {sev: count for sev, count in sev_rows}
    by_severity = [
        SeverityBar(
            severity=sev,
            label=_SEVERITY_LABELS[sev],
            count=sev_counts.get(sev, 0),
            pct=_pct(sev_counts.get(sev, 0), log_count),
        )
        for sev in (Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.OK)
    ]

    return EventTypePanel(event_type=event_type, log_count=log_count, alert_count=alert_count, by_severity=by_severity)


def get_agents_panel(db: Session, org_id: uuid.UUID, window: Window = "24h") -> AgentsPanel:
    """Sprint 7: the "Agents online X/Y" drill-down, enriched with real
    per-agent event/alert counts for the current window instead of just
    connection status. Backs `AgentsPanel.jsx`.
    """
    since = datetime.now(UTC) - _WINDOW_DELTAS[window]
    agents = agent_service.list_agents(db, org_id)  # reuses the existing lazy staleness sweep

    event_rows = db.execute(
        select(Log.agent_id, func.count())
        .where(Log.org_id == org_id, Log.agent_id.is_not(None), Log.timestamp >= since)
        .group_by(Log.agent_id)
    ).all()
    # mypy can't narrow Log.agent_id's nullable ORM type from the SQL-level
    # `.is_not(None)` filter above, even though it already guarantees no NULLs
    # come back — the comprehension re-asserts that at the Python level.
    event_counts: dict[uuid.UUID, int] = {agent_id: count for agent_id, count in event_rows if agent_id is not None}

    # Same join pattern as get_event_type_panel's alert_count above — Alert
    # has no agent_id of its own, only via the log it was raised from.
    alert_rows = db.execute(
        select(Log.agent_id, func.count())
        .select_from(Alert)
        .join(Log, Log.id == Alert.log_id)
        .where(Alert.org_id == org_id, Log.agent_id.is_not(None), Alert.created_at >= since)
        .group_by(Log.agent_id)
    ).all()
    alert_counts: dict[uuid.UUID, int] = {agent_id: count for agent_id, count in alert_rows if agent_id is not None}

    rows = [
        AgentPanelRow(
            id=agent.id,
            name=agent.name,
            platform=agent.platform,
            status=agent.status,
            hostname=agent.hostname,
            last_seen_at=agent.last_seen_at,
            is_primary=agent.is_primary,
            is_relay_child=agent.is_relay_child,
            event_count=event_counts.get(agent.id, 0),
            alert_count=alert_counts.get(agent.id, 0),
        )
        for agent in agents
    ]
    return AgentsPanel(window=window, agents=rows)
