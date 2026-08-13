"""Local-dev-only seed data for the Sprint 4 dashboard.

`logs`/`alerts` are empty in any real deployment right now (real ingestion
is Sprint 5 scope) — this script inserts realistic sample rows tied to an
*existing* org so the dashboard can be reviewed with real-looking numbers
instead of an all-zero empty state.

Usage (from backend/, with the venv/deps used by the app):
    python scripts/seed_dashboard_data.py <org-slug>

Deliberately manual-only: never invoked by docker-compose.yml or CI. Fails
loudly if the org doesn't exist rather than creating one, so it can't be run
by accident against a real tenant. Re-running is safe — it clears rows it
previously seeded (identified by a "Seed:" name prefix) before inserting
fresh ones, rather than piling up duplicates.
"""

import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database.session import SessionLocal  # noqa: E402
from app.models.agent import Agent, AgentPlatform, AgentStatus  # noqa: E402
from app.models.alert import Alert, AlertStatus  # noqa: E402
from app.models.alert_rule import AlertRule  # noqa: E402
from app.models.common import Severity  # noqa: E402
from app.models.log import Log  # noqa: E402
from app.models.log_source import LogSource, LogSourceStatus, LogSourceType  # noqa: E402
from app.models.org import Org  # noqa: E402

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
    return day.replace(hour=hour, minute=minute, second=random.randint(0, 59), microsecond=0)


def _clear_previous_seed(db, org_id: uuid.UUID) -> None:
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


def seed(org_slug: str) -> None:
    db = SessionLocal()
    now = datetime.now(UTC)
    try:
        org = db.query(Org).filter(Org.slug == org_slug).one_or_none()
        if org is None:
            print(f"No org found with slug {org_slug!r} — sign up first, then re-run with that workspace slug.")
            sys.exit(1)

        _clear_previous_seed(db, org.id)

        agents = [
            Agent(
                org_id=org.id,
                name=f"{SEED_PREFIX} WIN-SOC-01",
                platform=AgentPlatform.WINDOWS,
                agent_key_hash="unused-seed-hash",
                status=AgentStatus.CONNECTED,
                last_seen_at=now - timedelta(seconds=20),
                hostname="WIN-SOC-01",
            ),
            Agent(
                org_id=org.id,
                name=f"{SEED_PREFIX} lnx-jump-04",
                platform=AgentPlatform.LINUX,
                agent_key_hash="unused-seed-hash",
                status=AgentStatus.CONNECTED,
                last_seen_at=now - timedelta(seconds=45),
                hostname="lnx-jump-04",
            ),
            Agent(
                org_id=org.id,
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
                org_id=org.id,
                agent_id=agents[0].id,
                name=f"{SEED_PREFIX} Security Event Log",
                type=LogSourceType.LOCAL,
                path="Security",
                status=LogSourceStatus.ACTIVE,
                host="WIN-SOC-01",
            ),
            LogSource(
                org_id=org.id,
                agent_id=agents[1].id,
                name=f"{SEED_PREFIX} auth.log",
                type=LogSourceType.LOCAL,
                path="/var/log/auth.log",
                status=LogSourceStatus.ACTIVE,
                host="lnx-jump-04",
            ),
            LogSource(
                org_id=org.id,
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
                org_id=org.id,
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
                    org_id=org.id,
                    source_id=source.id,
                    agent_id=source.agent_id,
                    timestamp=_random_business_hour_timestamp(now, days_back=30),
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
            # Most alerts stay OPEN (matches reality — nothing acks/escalates
            # until Sprint 5 ships those mutations); a minority are seeded
            # past OPEN purely so the Triage metric has something real to
            # show locally, with plausible triage-time deltas.
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
                    org_id=org.id,
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

        db.commit()
        print(
            f"Seeded org {org_slug!r}: {len(agents)} agents, {len(sources)} sources, "
            f"{len(rules)} rules, {len(logs)} logs, {len(alerts)} alerts."
        )
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/seed_dashboard_data.py <org-slug>")
        sys.exit(1)
    seed(sys.argv[1])
