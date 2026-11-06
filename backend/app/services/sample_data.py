"""Realistic sample agents, sources, rules, logs and alerts for one org.

Used by scripts/seed_dashboard_data.py (local dev) and by demo_service
(the public read-only demo, refreshed nightly). Re-running is safe: rows it
previously created (identified by a "Seed:" name prefix) are cleared first.
"""

import random
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.agent import Agent, AgentPlatform, AgentStatus
from app.models.alert import Alert, AlertStatus
from app.models.alert_rule import AlertRule
from app.models.common import Severity
from app.models.log import Log
from app.models.log_source import LogSource, LogSourceStatus, LogSourceType

SEED_PREFIX = "Seed:"

EVENT_TYPES = [
    "An account was successfully logged on",
    "A process was created",
    "PowerShell script block logged",
    "A privileged service was called",
    "Special privileges assigned to new logon",
    "An account failed to log on",
    "A network share object was accessed",
]

RULES = [
    ("Seed: Failed login burst", Severity.HIGH, "An account failed to log on"),
    ("Seed: Port scan detected", Severity.MEDIUM, "A network share object was accessed"),
    ("Seed: New admin account created", Severity.CRITICAL, "Special privileges assigned to new logon"),
    ("Seed: Obfuscated PowerShell command", Severity.HIGH, "PowerShell script block logged"),
]

LOG_COUNT = 900
ALERT_COUNT = 70


def _random_business_hour_timestamp(now: datetime, days_back: int) -> datetime:
    day_offset = random.randint(0, days_back - 1)
    day = now - timedelta(days=day_offset)
    # Business-hours bias: most events cluster 8am-7pm.
    hour = random.choices(range(24), weights=[1] * 8 + [4] * 11 + [1] * 5)[0]
    minute = random.randint(0, 59)
    ts = day.replace(hour=hour, minute=minute, second=random.randint(0, 59), microsecond=0)
    # Today's slot may land later than now; keep every event in the past.
    return min(ts, now - timedelta(minutes=1))


def clear_sample_data(db: Session, org_id: uuid.UUID) -> None:
    seeded_source_ids = [
        s.id for s in db.query(LogSource).filter(LogSource.org_id == org_id, LogSource.name.startswith(SEED_PREFIX))
    ]
    seeded_rule_ids = [
        r.id for r in db.query(AlertRule).filter(AlertRule.org_id == org_id, AlertRule.name.startswith(SEED_PREFIX))
    ]
    if seeded_rule_ids:
        db.query(Alert).filter(Alert.org_id == org_id, Alert.rule_id.in_(seeded_rule_ids)).delete(
            synchronize_session=False
        )
    if seeded_source_ids:
        db.query(Log).filter(Log.org_id == org_id, Log.source_id.in_(seeded_source_ids)).delete(
            synchronize_session=False
        )
    db.query(AlertRule).filter(AlertRule.org_id == org_id, AlertRule.name.startswith(SEED_PREFIX)).delete(
        synchronize_session=False
    )
    db.query(LogSource).filter(LogSource.org_id == org_id, LogSource.name.startswith(SEED_PREFIX)).delete(
        synchronize_session=False
    )
    db.query(Agent).filter(Agent.org_id == org_id, Agent.name.startswith(SEED_PREFIX)).delete(synchronize_session=False)
    db.flush()


def seed_sample_data(db: Session, org_id: uuid.UUID, days_back: int = 30) -> dict[str, int]:
    """Replaces this org's sample rows with fresh ones spread over the last
    `days_back` days. Flushes but doesn't commit; returns row counts."""
    now = datetime.now(UTC)
    clear_sample_data(db, org_id)

    agents = [
        Agent(
            org_id=org_id,
            name=f"{SEED_PREFIX} WIN-SOC-01",
            platform=AgentPlatform.WINDOWS,
            agent_key_hash="unused-seed-hash",
            status=AgentStatus.CONNECTED,
            last_seen_at=now - timedelta(seconds=20),
            hostname="WIN-SOC-01",
        ),
        Agent(
            org_id=org_id,
            name=f"{SEED_PREFIX} lnx-jump-04",
            platform=AgentPlatform.LINUX,
            agent_key_hash="unused-seed-hash",
            status=AgentStatus.CONNECTED,
            last_seen_at=now - timedelta(seconds=45),
            hostname="lnx-jump-04",
        ),
        Agent(
            org_id=org_id,
            name=f"{SEED_PREFIX} edge-fw-02",
            platform=AgentPlatform.LINUX,
            agent_key_hash="unused-seed-hash",
            status=AgentStatus.DISCONNECTED,
            last_seen_at=now - timedelta(hours=6),
            hostname="edge-fw-02",
        ),
    ]
    db.add_all(agents)
    db.flush()

    sources = [
        LogSource(
            org_id=org_id,
            agent_id=agents[0].id,
            name=f"{SEED_PREFIX} Security Event Log",
            type=LogSourceType.LOCAL,
            path="Security",
            status=LogSourceStatus.ACTIVE,
            host="WIN-SOC-01",
        ),
        LogSource(
            org_id=org_id,
            agent_id=agents[1].id,
            name=f"{SEED_PREFIX} auth.log",
            type=LogSourceType.LOCAL,
            path="/var/log/auth.log",
            status=LogSourceStatus.ACTIVE,
            host="lnx-jump-04",
        ),
        LogSource(
            org_id=org_id,
            agent_id=agents[2].id,
            name=f"{SEED_PREFIX} firewall syslog",
            type=LogSourceType.LOCAL,
            path="/var/log/syslog",
            status=LogSourceStatus.ACTIVE,
            host="edge-fw-02",
        ),
    ]
    db.add_all(sources)
    db.flush()

    rules = [
        AlertRule(
            org_id=org_id,
            name=name,
            description=f"Seeded rule for {event_type}",
            conditions={"event_type": event_type},
            severity=severity,
            enabled=True,
        )
        for name, severity, event_type in RULES
    ]
    db.add_all(rules)
    db.flush()

    logs = []
    for _ in range(LOG_COUNT):
        source = random.choice(sources)
        event_type = random.choice(EVENT_TYPES)
        severity = random.choices(
            [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.OK], weights=[2, 10, 25, 63]
        )[0]
        logs.append(
            Log(
                org_id=org_id,
                source_id=source.id,
                agent_id=source.agent_id,
                timestamp=_random_business_hour_timestamp(now, days_back=days_back),
                severity=severity,
                event_type=event_type,
                message=f"{event_type} on {source.host}",
                raw={"host": source.host},
            )
        )
    db.add_all(logs)
    db.flush()

    rule_by_event_type = {event_type: rule for rule, (_, _, event_type) in zip(rules, RULES, strict=True)}
    candidate_logs = [log for log in logs if log.event_type in rule_by_event_type]
    random.shuffle(candidate_logs)

    alerts = []
    for log in candidate_logs[:ALERT_COUNT]:
        rule = rule_by_event_type[log.event_type]
        created_at = log.timestamp
        # Most alerts stay OPEN; a minority are past OPEN so the Triage metric
        # has something to show, with plausible triage-time deltas.
        roll = random.random()
        if roll < 0.6:
            alert_status = AlertStatus.OPEN
            updated_at = created_at
        elif roll < 0.8:
            alert_status = AlertStatus.ACK
            updated_at = created_at + timedelta(minutes=random.randint(2, 45))
        elif roll < 0.93:
            alert_status = AlertStatus.ESCALATED
            updated_at = created_at + timedelta(minutes=random.randint(5, 90))
        else:
            alert_status = AlertStatus.RESOLVED
            updated_at = created_at + timedelta(minutes=random.randint(10, 240))

        alerts.append(
            Alert(
                org_id=org_id,
                rule_id=rule.id,
                log_id=log.id,
                severity=rule.severity,
                status=alert_status,
                title=f"{rule.name.removeprefix(SEED_PREFIX).strip()} — {log.event_type}",
                description=log.message,
                created_at=created_at,
                updated_at=updated_at,
            )
        )
    db.add_all(alerts)
    db.flush()
    return {
        "agents": len(agents),
        "sources": len(sources),
        "rules": len(rules),
        "logs": len(logs),
        "alerts": len(alerts),
    }
