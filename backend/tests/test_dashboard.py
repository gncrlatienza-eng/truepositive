import uuid
from datetime import UTC, datetime, timedelta

from app.models.agent import Agent, AgentStatus
from app.models.alert import Alert, AlertStatus
from app.models.alert_rule import AlertRule
from app.models.common import Severity
from app.models.log import Log
from app.models.log_source import LogSource


def _org_id(client, headers) -> uuid.UUID:
    return uuid.UUID(client.get("/auth/me", headers=headers).json()["org"]["id"])


def _seed_source_and_agent(db_session, org_id):
    agent = Agent(org_id=org_id, name="a", platform="linux", agent_key_hash="x", status="pending")
    db_session.add(agent)
    db_session.flush()
    source = LogSource(org_id=org_id, agent_id=agent.id, name="s", type="local", status="active", host="h1")
    db_session.add(source)
    db_session.flush()
    return agent, source


def test_summary_empty_org_returns_zero_state(client, auth_headers):
    response = client.get("/dashboard/summary", headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["banner"]["agents_online"] == 0
    assert data["banner"]["agents_total"] == 0
    assert data["severity_breakdown"] == [
        {"severity": sev, "label": label, "count": 0, "pct": 0.0}
        for sev, label in [("critical", "Critical"), ("high", "High"), ("medium", "Medium"), ("ok", "OK")]
    ]
    assert data["alert_queue"] == []
    assert data["top_sources"] == []
    assert data["ingest"]["today_total"] == 0
    assert data["ingest"]["status"] == "quiet"


def test_summary_reflects_seeded_data(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    _agent, source = _seed_source_and_agent(db_session, org_id)
    rule = AlertRule(org_id=org_id, name="Failed login burst", conditions={}, severity=Severity.HIGH, enabled=True)
    db_session.add(rule)
    db_session.flush()

    now = datetime.now(UTC)
    log = Log(
        org_id=org_id,
        source_id=source.id,
        agent_id=source.agent_id,
        timestamp=now,
        severity=Severity.HIGH,
        event_type="An account failed to log on",
        message="m",
        raw={},
    )
    db_session.add(log)
    db_session.flush()

    db_session.add_all(
        [
            Alert(
                org_id=org_id,
                rule_id=rule.id,
                log_id=log.id,
                severity=Severity.HIGH,
                status=AlertStatus.OPEN,
                title="t1",
            ),
            Alert(
                org_id=org_id,
                rule_id=rule.id,
                log_id=log.id,
                severity=Severity.CRITICAL,
                status=AlertStatus.OPEN,
                title="t2",
            ),
        ]
    )
    db_session.flush()

    response = client.get("/dashboard/summary", headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["ingest"]["today_total"] == 1
    by_sev = {row["severity"]: row["count"] for row in data["severity_breakdown"]}
    assert by_sev["high"] == 1
    assert by_sev["critical"] == 1
    assert len(data["alert_queue"]) == 2
    assert data["top_alert_types"][0]["label"] == "Failed login burst"
    assert data["top_alert_types"][0]["count"] == 2


def test_cross_org_isolation(client, auth_headers, second_org_headers, db_session):
    org_id = _org_id(client, auth_headers)
    _agent, source = _seed_source_and_agent(db_session, org_id)
    rule = AlertRule(org_id=org_id, name="Org A rule", conditions={}, severity=Severity.HIGH, enabled=True)
    db_session.add(rule)
    db_session.flush()
    db_session.add(Alert(org_id=org_id, rule_id=rule.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t"))
    db_session.flush()

    other_summary = client.get("/dashboard/summary", headers=second_org_headers).json()
    assert other_summary["top_alert_types"] == []
    assert other_summary["alert_queue"] == []

    cross_org_panel = client.get(f"/dashboard/panels/rule/{rule.id}", headers=second_org_headers)
    assert cross_org_panel.status_code == 404


def test_agent_staleness_excluded_from_online_count(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    stale_agent = Agent(
        org_id=org_id,
        name="stale",
        platform="linux",
        agent_key_hash="x",
        status=AgentStatus.CONNECTED,
        last_seen_at=datetime.now(UTC) - timedelta(seconds=200),
    )
    db_session.add(stale_agent)
    db_session.flush()

    data = client.get("/dashboard/summary", headers=auth_headers).json()
    assert data["banner"]["agents_online"] == 0
    assert data["banner"]["agents_total"] == 1


def test_risk_score_formula(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    rule = AlertRule(org_id=org_id, name="r", conditions={}, severity=Severity.CRITICAL, enabled=True)
    db_session.add(rule)
    db_session.flush()
    db_session.add_all(
        [
            Alert(org_id=org_id, rule_id=rule.id, severity=Severity.CRITICAL, status=AlertStatus.OPEN, title="c1"),
            Alert(org_id=org_id, rule_id=rule.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="h1"),
        ]
    )
    db_session.flush()

    data = client.get("/dashboard/panels/risk", headers=auth_headers).json()
    # 1 critical * 4 + 1 high * 2 = 6.0 -> "Low" (<= 8 threshold)
    assert data["score"] == 6.0
    assert data["level"] == "Low"


def test_triage_panel_empty_when_no_status_transitions(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    rule = AlertRule(org_id=org_id, name="r", conditions={}, severity=Severity.HIGH, enabled=True)
    db_session.add(rule)
    db_session.flush()
    db_session.add(Alert(org_id=org_id, rule_id=rule.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t"))
    db_session.flush()

    data = client.get("/dashboard/panels/triage", headers=auth_headers).json()
    assert data["median_seconds"] is None
    assert data["sample_size"] == 0
