import csv
import io
import logging
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

from fastapi import HTTPException, status
from fpdf import FPDF
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.alert import Alert, AlertStatus
from app.models.alert_rule import AlertRule
from app.models.common import Severity
from app.models.incident import Incident, IncidentStatus
from app.models.log import Log
from app.models.report import Report, ReportType
from app.models.report_schedule import ReportSchedule
from app.schemas.reports import ReportScheduleCreate
from app.utils.csv import csv_safe

logger = logging.getLogger(__name__)

GeneratableType = Literal["daily", "weekly", "monthly", "compliance"]

# Rolling-window lengths ending on the reference date — matches the rest of
# the app's 24h/7d/30d window convention (dashboard_service) rather than
# introducing a separate calendar-month/ISO-week concept.
_PERIOD_DAYS: dict[str, int] = {"daily": 1, "weekly": 7, "monthly": 30, "compliance": 30}

_LOG_RETENTION_LOOKBACK_DAYS = 90
_LOG_RETENTION_THRESHOLD = 1000
_INCIDENT_SLA_PCT_THRESHOLD = 80
_RULE_COVERAGE_THRESHOLD = 3


def _period_bounds(report_type: str, ref_date: date) -> tuple[date, date]:
    days = _PERIOD_DAYS.get(report_type, 1)
    return ref_date - timedelta(days=days - 1), ref_date


def _day_bounds_utc(d: date) -> tuple[datetime, datetime]:
    return datetime.combine(d, time.min, tzinfo=UTC), datetime.combine(d, time.max, tzinfo=UTC)


def _range_bounds_utc(start_d: date, end_d: date) -> tuple[datetime, datetime]:
    return _day_bounds_utc(start_d)[0], _day_bounds_utc(end_d)[1]


def _count_logs(db: Session, org_id: uuid.UUID, start: datetime, end: datetime) -> int:
    return (
        db.scalar(select(func.count()).where(Log.org_id == org_id, Log.timestamp >= start, Log.timestamp <= end)) or 0
    )


def _count_alerts(
    db: Session, org_id: uuid.UUID, start: datetime, end: datetime, *, severities: list[Severity] | None = None
) -> int:
    stmt = select(func.count()).where(Alert.org_id == org_id, Alert.created_at >= start, Alert.created_at <= end)
    if severities:
        stmt = stmt.where(Alert.severity.in_(severities))
    return db.scalar(stmt) or 0


def _mean_time_seconds(
    db: Session, org_id: uuid.UUID, start: datetime, end: datetime, *, status_filter: AlertStatus | None = None
) -> int | None:
    """Mean time from Alert.created_at to Alert.updated_at, for alerts whose
    *current* status changed away from OPEN inside this window. Alert has no
    dedicated ack/resolved timestamp -- updated_at is the closest real
    signal, same approximation the rest of this codebase already makes.
    status_filter=None means "any non-open status" (a proxy for triage time);
    RESOLVED specifically is used for a true resolve-time metric.
    """
    stmt = select(Alert.created_at, Alert.updated_at).where(
        Alert.org_id == org_id, Alert.updated_at >= start, Alert.updated_at <= end
    )
    if status_filter is not None:
        stmt = stmt.where(Alert.status == status_filter)
    else:
        stmt = stmt.where(Alert.status != AlertStatus.OPEN)
    rows = db.execute(stmt).all()
    if not rows:
        return None
    deltas = [(updated - created).total_seconds() for created, updated in rows]
    return round(sum(deltas) / len(deltas))


def _format_duration(seconds: int | None) -> str:
    """Human-readable duration for KPI display -- raw seconds (e.g. "5445")
    reads as a meaningless number, not a real bug fix without this, since
    the value has no unit context on its own.
    """
    if not seconds:
        return "-"
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{round(seconds / 60)}m"
    if seconds < 86400:
        return f"{round(seconds / 3600)}h {round((seconds % 3600) / 60)}m"
    return f"{round(seconds / 86400)}d"


def _delta_pct(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def _kpi(
    label: str, value, current: float, previous: float, *, lower_is_better: bool = False, previous_display=None
) -> dict:
    """One KPI card's worth of data: current value, delta vs. the prior
    equal-length period, a literal (not `lower_is_better`-flipped) trend
    direction, and a separate good/bad verdict the frontend maps to its own
    theme colors -- same "backend returns meaning, frontend owns color"
    convention as Severity elsewhere in this app. `trend` must always match
    the arithmetic sign of `delta_pct` (up = value increased, down =
    decreased) -- direction and "is this good" are two different questions,
    and conflating them here previously made the frontend's arrow contradict
    the number next to it (e.g. alerts 2->4, a real increase, rendered as
    a down arrow because more alerts is bad). `trend_good` is the only field
    that should ever depend on `lower_is_better`.
    `previous_display` overrides the raw `previous` number shown to the user
    (e.g. a formatted duration string) while `previous` itself stays the raw
    number the delta/trend math needs.
    """
    delta_pct = _delta_pct(current, previous)
    if delta_pct is None or delta_pct == 0:
        trend = "flat"
    elif delta_pct > 0:
        trend = "up"
    else:
        trend = "down"
    good = None if delta_pct is None else (trend == "flat" or (trend == "up") != lower_is_better)
    return {
        "label": label,
        "value": value,
        "delta_pct": delta_pct,
        "trend": trend,
        "trend_good": good,
        "previous_value": previous_display if previous_display is not None else previous,
    }


def _hourly_dual_buckets(db: Session, org_id: uuid.UUID, today: date) -> list[dict]:
    """24 hours of {hour, today_count, yesterday_count} — backs the
    Today-vs-Yesterday overlay chart. Both series are real ingested-log
    counts, not simulated.
    """
    yesterday = today - timedelta(days=1)
    start, end = _range_bounds_utc(yesterday, today)
    rows = db.execute(
        select(func.date_trunc("hour", Log.timestamp), func.count())
        .where(Log.org_id == org_id, Log.timestamp >= start, Log.timestamp <= end)
        .group_by(func.date_trunc("hour", Log.timestamp))
    ).all()
    today_counts = {ts.hour: count for ts, count in rows if ts.date() == today}
    yesterday_counts = {ts.hour: count for ts, count in rows if ts.date() == yesterday}
    return [
        {"hour": f"{h:02d}:00", "today_count": today_counts.get(h, 0), "yesterday_count": yesterday_counts.get(h, 0)}
        for h in range(24)
    ]


def _daily_alert_buckets(db: Session, org_id: uuid.UUID, period_start: date, period_end: date) -> list[dict]:
    start, end = _range_bounds_utc(period_start, period_end)
    rows = db.execute(
        select(func.date_trunc("day", Alert.created_at), func.count())
        .where(Alert.org_id == org_id, Alert.created_at >= start, Alert.created_at <= end)
        .group_by(func.date_trunc("day", Alert.created_at))
    ).all()
    counts = {ts.date(): count for ts, count in rows}
    days = (period_end - period_start).days + 1
    return [
        {
            "date": (period_start + timedelta(days=i)).isoformat(),
            "count": counts.get(period_start + timedelta(days=i), 0),
        }
        for i in range(days)
    ]


def _severity_distribution(db: Session, org_id: uuid.UUID, start: datetime, end: datetime) -> dict[str, int]:
    rows = db.execute(
        select(Alert.severity, func.count())
        .where(Alert.org_id == org_id, Alert.created_at >= start, Alert.created_at <= end)
        .group_by(Alert.severity)
    ).all()
    counts = {sev: count for sev, count in rows}
    return {
        "critical": counts.get(Severity.CRITICAL, 0),
        "high": counts.get(Severity.HIGH, 0),
        "medium": counts.get(Severity.MEDIUM, 0),
        "ok": counts.get(Severity.OK, 0),
    }


def _top_event_types(db: Session, org_id: uuid.UUID, start: datetime, end: datetime, limit: int = 5) -> list[dict]:
    rows = db.execute(
        select(Log.event_type, func.count())
        .where(Log.org_id == org_id, Log.timestamp >= start, Log.timestamp <= end)
        .group_by(Log.event_type)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()
    total = rows[0][1] if rows else 0
    return [{"name": name, "count": count, "pct": round(count / total * 100) if total else 0} for name, count in rows]


def _rule_counts(db: Session, org_id: uuid.UUID, start: datetime, end: datetime) -> dict[str, int]:
    rows = db.execute(
        select(AlertRule.name, func.count())
        .select_from(Alert)
        .join(AlertRule, AlertRule.id == Alert.rule_id)
        .where(Alert.org_id == org_id, Alert.created_at >= start, Alert.created_at <= end)
        .group_by(AlertRule.name)
    ).all()
    return {name: count for name, count in rows}


def _trending_rules(db: Session, org_id: uuid.UUID, period_start: date, period_end: date, limit: int = 5) -> list[dict]:
    """Top rules this period vs. the immediately preceding equal-length
    period, with a real week-over-week (or period-over-period) trend.
    """
    start, end = _range_bounds_utc(period_start, period_end)
    days = (period_end - period_start).days + 1
    prior_start, prior_end = period_start - timedelta(days=days), period_start - timedelta(days=1)
    p_start, p_end = _range_bounds_utc(prior_start, prior_end)

    current = _rule_counts(db, org_id, start, end)
    prior = _rule_counts(db, org_id, p_start, p_end)
    top_names = sorted(current, key=lambda n: current[n], reverse=True)[:limit]
    rows = []
    for name in top_names:
        cur_count = current[name]
        prev_count = prior.get(name, 0)
        pct = _delta_pct(cur_count, prev_count)
        rows.append({"name": name, "count": cur_count, "trend_pct": pct})
    return rows


def _agent_status_list(db: Session, org_id: uuid.UUID) -> list[dict]:
    """Real per-agent status -- name/host/platform/status/last_seen. No
    fabricated uptime percentage: this app has no historical connectivity
    log to compute one honestly, so it isn't shown.
    """
    agents = db.scalars(select(Agent).where(Agent.org_id == org_id).order_by(Agent.name)).all()
    return [
        {
            "name": a.name,
            "hostname": a.hostname,
            "platform": a.platform.value,
            "status": a.status.value,
            "last_seen_at": a.last_seen_at.isoformat() if a.last_seen_at else None,
        }
        for a in agents
    ]


def _compliance_rows(db: Session, org_id: uuid.UUID, ref_date: date) -> list[dict]:
    now = datetime.now(UTC)
    retention_start = now - timedelta(days=_LOG_RETENTION_LOOKBACK_DAYS)
    log_count = db.scalar(select(func.count()).where(Log.org_id == org_id, Log.timestamp >= retention_start)) or 0

    incidents = db.scalars(select(Incident).where(Incident.org_id == org_id)).all()
    resolved_within_sla = sum(
        1
        for i in incidents
        if i.status == IncidentStatus.RESOLVED
        and i.resolved_at is not None
        and (i.resolved_at - i.created_at) <= timedelta(hours=i.sla_hours)
    )
    total_resolved = sum(1 for i in incidents if i.status == IncidentStatus.RESOLVED)
    sla_pct = round(resolved_within_sla / total_resolved * 100) if total_resolved else None

    period_start, period_end = _range_bounds_utc(ref_date - timedelta(days=_PERIOD_DAYS["compliance"] - 1), ref_date)
    high_severity_count = (
        db.scalar(
            select(func.count()).where(
                Alert.org_id == org_id,
                Alert.severity.in_([Severity.CRITICAL, Severity.HIGH]),
                Alert.created_at >= period_start,
                Alert.created_at <= period_end,
            )
        )
        or 0
    )
    enabled_rule_count = (
        db.scalar(select(func.count()).where(AlertRule.org_id == org_id, AlertRule.enabled.is_(True))) or 0
    )

    return [
        {
            "framework": "SOC 2 (CC7.2)",
            "control": "Log retention",
            "metric_label": f"Logs in last {_LOG_RETENTION_LOOKBACK_DAYS}d",
            "value": log_count,
            "threshold": f">= {_LOG_RETENTION_THRESHOLD}",
            "status": "pass" if log_count >= _LOG_RETENTION_THRESHOLD else "review",
        },
        {
            "framework": "SOC 2 (CC7.3)",
            "control": "Incident SLA",
            "metric_label": "Incidents resolved within SLA",
            "value": f"{sla_pct}%" if sla_pct is not None else "n/a",
            "threshold": f">= {_INCIDENT_SLA_PCT_THRESHOLD}%",
            "status": "n/a" if sla_pct is None else ("pass" if sla_pct >= _INCIDENT_SLA_PCT_THRESHOLD else "review"),
        },
        {
            "framework": "HIPAA (§164.312(b))",
            "control": "Access anomalies",
            "metric_label": "Critical/High alerts this period",
            "value": high_severity_count,
            "threshold": "0",
            "status": "pass" if high_severity_count == 0 else "review",
        },
        {
            "framework": "PCI-DSS (Req. 10.6)",
            "control": "Rule coverage",
            "metric_label": "Enabled detection rules",
            "value": enabled_rule_count,
            "threshold": f">= {_RULE_COVERAGE_THRESHOLD}",
            "status": "pass" if enabled_rule_count >= _RULE_COVERAGE_THRESHOLD else "review",
        },
    ]


def _daily_data(db: Session, org_id: uuid.UUID, ref_date: date) -> dict:
    start, end = _day_bounds_utc(ref_date)
    yesterday = ref_date - timedelta(days=1)
    y_start, y_end = _day_bounds_utc(yesterday)

    events_total = _count_logs(db, org_id, start, end)
    events_yesterday = _count_logs(db, org_id, y_start, y_end)
    alerts_total = _count_alerts(db, org_id, start, end)
    alerts_yesterday = _count_alerts(db, org_id, y_start, y_end)
    critical_total = _count_alerts(db, org_id, start, end, severities=[Severity.CRITICAL])
    critical_yesterday = _count_alerts(db, org_id, y_start, y_end, severities=[Severity.CRITICAL])
    mttriage = _mean_time_seconds(db, org_id, start, end)
    mttriage_yesterday = _mean_time_seconds(db, org_id, y_start, y_end)

    agents = _agent_status_list(db, org_id)
    connected = sum(1 for a in agents if a["status"] == "connected")

    return {
        "kpis": [
            _kpi("Events ingested", events_total, events_total, events_yesterday),
            _kpi("Alerts created", alerts_total, alerts_total, alerts_yesterday, lower_is_better=True),
            _kpi("Critical alerts", critical_total, critical_total, critical_yesterday, lower_is_better=True),
            _kpi(
                "Mean time to triage",
                _format_duration(mttriage),
                mttriage or 0,
                mttriage_yesterday or 0,
                lower_is_better=True,
                previous_display=_format_duration(mttriage_yesterday),
            ),
        ],
        "hour_bars": _hourly_dual_buckets(db, org_id, ref_date),
        "top_event_types": _top_event_types(db, org_id, start, end),
        "severity_breakdown": _severity_distribution(db, org_id, start, end),
        "alerts_total": alerts_total,
        "agent_summary": f"{connected} of {len(agents)} reporting",
        "agents": agents,
    }


def _weekly_data(db: Session, org_id: uuid.UUID, period_start: date, period_end: date) -> dict:
    start, end = _range_bounds_utc(period_start, period_end)
    days = _PERIOD_DAYS["weekly"]
    prior_start, prior_end = period_start - timedelta(days=days), period_start - timedelta(days=1)
    p_start, p_end = _range_bounds_utc(prior_start, prior_end)

    events_total = _count_logs(db, org_id, start, end)
    events_prior = _count_logs(db, org_id, p_start, p_end)
    alerts_total = _count_alerts(db, org_id, start, end)
    alerts_prior = _count_alerts(db, org_id, p_start, p_end)
    critical_total = _count_alerts(db, org_id, start, end, severities=[Severity.CRITICAL])
    critical_prior = _count_alerts(db, org_id, p_start, p_end, severities=[Severity.CRITICAL])
    mttr = _mean_time_seconds(db, org_id, start, end, status_filter=AlertStatus.RESOLVED)
    mttr_prior = _mean_time_seconds(db, org_id, p_start, p_end, status_filter=AlertStatus.RESOLVED)

    return {
        "kpis": [
            _kpi("Events ingested", events_total, events_total, events_prior),
            _kpi("Alerts created", alerts_total, alerts_total, alerts_prior, lower_is_better=True),
            _kpi("Critical alerts", critical_total, critical_total, critical_prior, lower_is_better=True),
            _kpi(
                "Mean time to resolve",
                _format_duration(mttr),
                mttr or 0,
                mttr_prior or 0,
                lower_is_better=True,
                previous_display=_format_duration(mttr_prior),
            ),
        ],
        "alerts_by_day": _daily_alert_buckets(db, org_id, period_start, period_end),
        "trending_rules": _trending_rules(db, org_id, period_start, period_end),
        "severity_breakdown": _severity_distribution(db, org_id, start, end),
        "agents": _agent_status_list(db, org_id),
    }


def _monthly_data(db: Session, org_id: uuid.UUID, period_start: date, period_end: date) -> dict:
    start, end = _range_bounds_utc(period_start, period_end)
    days = _PERIOD_DAYS["monthly"]
    prior_start, prior_end = period_start - timedelta(days=days), period_start - timedelta(days=1)
    p_start, p_end = _range_bounds_utc(prior_start, prior_end)

    events_total = _count_logs(db, org_id, start, end)
    events_prior = _count_logs(db, org_id, p_start, p_end)
    alerts_total = _count_alerts(db, org_id, start, end)
    incidents_opened = (
        db.scalar(
            select(func.count()).where(
                Incident.org_id == org_id, Incident.created_at >= start, Incident.created_at <= end
            )
        )
        or 0
    )
    incidents_resolved = (
        db.scalar(
            select(func.count()).where(
                Incident.org_id == org_id,
                Incident.resolved_at.is_not(None),
                Incident.resolved_at >= start,
                Incident.resolved_at <= end,
            )
        )
        or 0
    )
    trend_pct = _delta_pct(events_total, events_prior)

    trend_phrase = "up" if (trend_pct or 0) > 0 else "down" if (trend_pct or 0) < 0 else "flat"
    summary = (
        f"{events_total:,} events processed, {alerts_total:,} alerts created, "
        f"{incidents_opened} incident{'s' if incidents_opened != 1 else ''} opened and "
        f"{incidents_resolved} resolved this period. Event volume is {trend_phrase}"
        f"{f' {abs(trend_pct):.1f}%' if trend_pct is not None else ''} versus the prior 30 days."
    )

    return {
        "executive_summary": summary,
        "kpis": [
            _kpi("Events ingested", events_total, events_total, events_prior),
            {
                "label": "Alerts created",
                "value": alerts_total,
                "delta_pct": None,
                "trend": "flat",
                "trend_good": None,
                "previous_value": None,
            },
            {
                "label": "Incidents opened",
                "value": incidents_opened,
                "delta_pct": None,
                "trend": "flat",
                "trend_good": None,
                "previous_value": None,
            },
            {
                "label": "Incidents resolved",
                "value": incidents_resolved,
                "delta_pct": None,
                "trend": "flat",
                "trend_good": None,
                "previous_value": None,
            },
        ],
        "agents": _agent_status_list(db, org_id),
    }


def _build_report_data(db: Session, org_id: uuid.UUID, report_type: str, period_start: date, period_end: date) -> dict:
    if report_type == "daily":
        return _daily_data(db, org_id, period_end)
    if report_type == "weekly":
        return _weekly_data(db, org_id, period_start, period_end)
    if report_type == "monthly":
        return _monthly_data(db, org_id, period_start, period_end)
    return {"framework_rows": _compliance_rows(db, org_id, period_end)}


def generate_report(
    db: Session,
    org_id: uuid.UUID,
    report_type: GeneratableType,
    ref_date: date,
    created_by: uuid.UUID | None = None,
    *,
    period_start: date | None = None,
    period_end: date | None = None,
) -> Report:
    # A caller-supplied (period_start, period_end) — the Builder tab's real
    # custom date range — overrides the default rolling window for that type.
    if period_start is None or period_end is None:
        period_start, period_end = _period_bounds(report_type, ref_date)
    data = _build_report_data(db, org_id, report_type, period_start, period_end)
    report = Report(
        org_id=org_id,
        type=ReportType(report_type),
        period_start=period_start,
        period_end=period_end,
        data=data,
        created_by=created_by,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    _deliver_to_matching_schedules(db, org_id, report)
    return report


def _deliver_to_matching_schedules(db: Session, org_id: uuid.UUID, report: Report) -> None:
    schedules = db.scalars(
        select(ReportSchedule).where(
            ReportSchedule.org_id == org_id,
            ReportSchedule.report_type == report.type.value,
            ReportSchedule.enabled.is_(True),
        )
    ).all()
    for schedule in schedules:
        logger.info(
            "[REPORT DELIVERY] would email %s report (period %s to %s) to %s",
            report.type.value,
            report.period_start,
            report.period_end,
            schedule.email,
        )


def list_reports(
    db: Session, org_id: uuid.UUID, *, report_type: str | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[Report], int]:
    stmt = select(Report).where(Report.org_id == org_id)
    if report_type:
        stmt = stmt.where(Report.type == report_type)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Report.generated_at.desc()).limit(limit).offset(offset)).all()
    return list(rows), total


def get_report(db: Session, org_id: uuid.UUID, report_id: uuid.UUID) -> Report:
    report = db.scalar(select(Report).where(Report.id == report_id, Report.org_id == org_id))
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return report


def get_quick_stats(db: Session, org_id: uuid.UUID) -> dict:
    """Real, currently-computable aggregates for the Reports quick-stats
    strip. Deliberately excludes a "next scheduled run" figure: there is no
    real scheduler in this app -- ReportSchedule is a static config row and
    _deliver_to_matching_schedules only ever fires (as a log line) when a
    matching-type report happens to be generated manually. A "next run"
    timestamp would have to be fabricated, so the frontend shows honest
    static copy for that tile instead.
    """
    now = datetime.now(UTC)
    month_start = datetime(now.year, now.month, 1, tzinfo=UTC)
    reports_this_month = (
        db.scalar(select(func.count()).where(Report.org_id == org_id, Report.generated_at >= month_start)) or 0
    )
    active_schedules = (
        db.scalar(select(func.count()).where(ReportSchedule.org_id == org_id, ReportSchedule.enabled.is_(True))) or 0
    )
    last_export_at = db.scalar(select(func.max(Report.last_exported_at)).where(Report.org_id == org_id))
    return {
        "reports_this_month": reports_this_month,
        "active_schedules": active_schedules,
        "last_export_at": last_export_at,
    }


def export_report_csv(db: Session, org_id: uuid.UUID, report_id: uuid.UUID) -> str:
    report = get_report(db, org_id, report_id)
    report.last_exported_at = datetime.now(UTC)
    db.commit()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["field", "value"])
    for key, value in report.data.items():
        if isinstance(value, list):
            if value and isinstance(value[0], dict):
                writer.writerow([])
                writer.writerow([csv_safe(key)] + [csv_safe(str(k)) for k in value[0]])
                for row in value:
                    writer.writerow([""] + [csv_safe(str(row.get(k, ""))) for k in value[0]])
            else:
                writer.writerow([csv_safe(key), csv_safe(str(value))])
        elif isinstance(value, dict):
            writer.writerow([])
            writer.writerow([csv_safe(key), "count"])
            for sub_key, sub_value in value.items():
                writer.writerow([csv_safe(str(sub_key)), csv_safe(str(sub_value))])
        else:
            writer.writerow([csv_safe(key), csv_safe(str(value))])
    return buf.getvalue()


def _pdf_safe(text: str) -> str:
    """fpdf2's core "Helvetica" font is Latin-1 only -- any character
    outside that range (em dashes, curly quotes, emoji, non-Latin scripts)
    raises FPDFUnicodeEncodingException and crashes the whole export.
    Verified this for real: report data used to include an em dash and the
    PDF endpoint 500'd. Report fields also include user-entered text (agent
    hostnames, rule names) that could contain anything, so this is applied
    broadly rather than just patching the one string that happened to fail
    first. Swapping a full Unicode font in is the alternative, but this app
    doesn't otherwise need one, so a safe ASCII fallback for the rare
    unsupported character is the simpler real fix.
    """
    return text.encode("latin-1", errors="replace").decode("latin-1")


def export_report_pdf(db: Session, org_id: uuid.UUID, report_id: uuid.UUID) -> bytes:
    """Real PDF generation (fpdf2, pure-Python) — same field-flattening
    approach as the CSV export, laid out as a simple readable document
    rather than trying to replicate the dashboard's charts in PDF form.
    """
    report = get_report(db, org_id, report_id)
    report.last_exported_at = datetime.now(UTC)
    db.commit()
    pdf = FPDF()
    pdf.add_page()
    # Explicit width (not the usual w=0 "rest of the page") plus resetting X
    # before every multi_cell: fpdf2 has a real bug where relying on w=0
    # across many consecutive cell()/multi_cell() calls on one page
    # eventually miscomputes the available width down to ~0 and raises
    # "Not enough horizontal space to render a single character" -- verified
    # by reproducing it locally against this exact report shape. This is
    # the documented workaround, not a paper-over: every cell/multi_cell
    # below passes epw explicitly.
    epw = pdf.w - pdf.l_margin - pdf.r_margin

    pdf.set_font("Helvetica", "B", 16)
    pdf.set_x(pdf.l_margin)
    pdf.cell(epw, 10, f"{report.type.value.capitalize()} Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.set_x(pdf.l_margin)
    pdf.cell(epw, 6, f"{report.period_start} to {report.period_end}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(pdf.l_margin)
    pdf.cell(epw, 6, f"Generated {report.generated_at:%Y-%m-%d %H:%M UTC}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_text_color(0, 0, 0)

    for key, value in report.data.items():
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_x(pdf.l_margin)
        pdf.cell(epw, 8, _pdf_safe(key.replace("_", " ").title()), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        if isinstance(value, list):
            for row in value:
                text = ", ".join(f"{k}: {v}" for k, v in row.items()) if isinstance(row, dict) else str(row)
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(epw, 5, _pdf_safe(text[:180]))
        elif isinstance(value, dict):
            for sub_key, sub_value in value.items():
                pdf.set_x(pdf.l_margin)
                pdf.cell(epw, 5, _pdf_safe(f"{sub_key}: {sub_value}"), new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(epw, 5, _pdf_safe(str(value)))
        pdf.ln(2)

    return bytes(pdf.output())


# ── Schedules ────────────────────────────────────────────────────────────────


def list_schedules(db: Session, org_id: uuid.UUID) -> list[ReportSchedule]:
    return list(
        db.scalars(
            select(ReportSchedule).where(ReportSchedule.org_id == org_id).order_by(ReportSchedule.created_at.desc())
        ).all()
    )


def create_schedule(db: Session, org_id: uuid.UUID, payload: ReportScheduleCreate) -> ReportSchedule:
    schedule = ReportSchedule(
        org_id=org_id, report_type=payload.report_type, frequency=payload.frequency, email=payload.email
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


def delete_schedule(db: Session, org_id: uuid.UUID, schedule_id: uuid.UUID) -> None:
    schedule = db.scalar(
        select(ReportSchedule).where(ReportSchedule.id == schedule_id, ReportSchedule.org_id == org_id)
    )
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    db.delete(schedule)
    db.commit()
