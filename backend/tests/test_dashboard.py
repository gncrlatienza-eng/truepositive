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


def test_agents_panel_shows_distinct_per_agent_counts(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    agent_a = Agent(org_id=org_id, name="a", platform="linux", agent_key_hash="x", status="connected")
    agent_b = Agent(org_id=org_id, name="b", platform="linux", agent_key_hash="x", status="connected")
    db_session.add_all([agent_a, agent_b])
    db_session.flush()

    now = datetime.now(UTC)
    # agent_a: 2 logs, 1 alert. agent_b: 1 log, 0 alerts.
    log_a1 = Log(
        org_id=org_id, agent_id=agent_a.id, timestamp=now, severity=Severity.HIGH, event_type="e", message="m", raw={}
    )
    log_a2 = Log(
        org_id=org_id, agent_id=agent_a.id, timestamp=now, severity=Severity.OK, event_type="e", message="m", raw={}
    )
    log_b1 = Log(
        org_id=org_id, agent_id=agent_b.id, timestamp=now, severity=Severity.OK, event_type="e", message="m", raw={}
    )
    db_session.add_all([log_a1, log_a2, log_b1])
    db_session.flush()
    db_session.add(Alert(org_id=org_id, log_id=log_a1.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t"))
    db_session.flush()

    response = client.get("/dashboard/panels/agents", headers=auth_headers)
    assert response.status_code == 200, response.text
    rows = {row["id"]: row for row in response.json()["agents"]}
    assert rows[str(agent_a.id)]["event_count"] == 2
    assert rows[str(agent_a.id)]["alert_count"] == 1
    assert rows[str(agent_b.id)]["event_count"] == 1
    assert rows[str(agent_b.id)]["alert_count"] == 0


def test_agents_panel_respects_window(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    agent = Agent(org_id=org_id, name="a", platform="linux", agent_key_hash="x", status="connected")
    db_session.add(agent)
    db_session.flush()

    old_log = Log(
        org_id=org_id,
        agent_id=agent.id,
        timestamp=datetime.now(UTC) - timedelta(days=10),
        severity=Severity.OK,
        event_type="e",
        message="m",
        raw={},
    )
    db_session.add(old_log)
    db_session.flush()

    response = client.get("/dashboard/panels/agents?window=24h", headers=auth_headers)
    rows = {row["id"]: row for row in response.json()["agents"]}
    assert rows[str(agent.id)]["event_count"] == 0  # outside the 24h window


def test_agents_panel_cross_org_isolation(client, auth_headers, second_org_headers, db_session):
    org_id = _org_id(client, auth_headers)
    other_org_id = _org_id(client, second_org_headers)
    db_session.add(Agent(org_id=org_id, name="mine", platform="linux", agent_key_hash="x", status="connected"))
    db_session.add(Agent(org_id=other_org_id, name="theirs", platform="linux", agent_key_hash="x", status="connected"))
    db_session.flush()

    response = client.get("/dashboard/panels/agents", headers=auth_headers)
    names = [row["name"] for row in response.json()["agents"]]
    assert names == ["mine"]


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


def test_kpi_deltas_compare_against_previous_equal_window(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    rule = AlertRule(org_id=org_id, name="r", conditions={}, severity=Severity.HIGH, enabled=True)
    db_session.add(rule)
    db_session.flush()

    now = datetime.now(UTC)
    # 2 alerts in the current 24h window, 1 alert just outside it (in the
    # previous 24h window) — delta should be +100% (2 vs 1), not None/0.
    db_session.add_all(
        [
            Alert(org_id=org_id, rule_id=rule.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="new1"),
            Alert(org_id=org_id, rule_id=rule.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="new2"),
        ]
    )
    db_session.flush()
    old_alert = Alert(org_id=org_id, rule_id=rule.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="old")
    db_session.add(old_alert)
    db_session.flush()
    old_alert.created_at = now - timedelta(hours=30)
    db_session.flush()

    data = client.get("/dashboard/summary", headers=auth_headers).json()
    kpi_by_key = {k["key"]: k for k in data["kpis"]}
    assert kpi_by_key["alerts"]["delta"] == 100.0
    assert len(kpi_by_key["alerts"]["sparkline"]) >= 1
    # Ingestion rate's delta is None with zero logs on both sides (no
    # previous total to compare against) — _pct_change returns None for a
    # zero denominator rather than a misleading 0%.
    assert kpi_by_key["ingestion"]["delta"] is None


def test_summary_and_panels_scope_by_agent_id(client, auth_headers, db_session):
    # Backs the dashboard's Scope Switcher: picking a specific device must
    # narrow every KPI/panel to that device's own logs/alerts, not the org's.
    org_id = _org_id(client, auth_headers)
    agent_a = Agent(org_id=org_id, name="a", platform="linux", agent_key_hash="x", status="connected")
    agent_b = Agent(org_id=org_id, name="b", platform="linux", agent_key_hash="x", status="connected")
    db_session.add_all([agent_a, agent_b])
    db_session.flush()
    rule = AlertRule(org_id=org_id, name="r", conditions={}, severity=Severity.CRITICAL, enabled=True)
    db_session.add(rule)
    db_session.flush()

    now = datetime.now(UTC)
    log_a = Log(
        org_id=org_id,
        agent_id=agent_a.id,
        timestamp=now,
        severity=Severity.CRITICAL,
        event_type="e",
        message="m",
        raw={},
    )
    log_b = Log(
        org_id=org_id,
        agent_id=agent_b.id,
        timestamp=now,
        severity=Severity.CRITICAL,
        event_type="e",
        message="m",
        raw={},
    )
    db_session.add_all([log_a, log_b])
    db_session.flush()
    db_session.add_all(
        [
            Alert(
                org_id=org_id,
                rule_id=rule.id,
                log_id=log_a.id,
                severity=Severity.CRITICAL,
                status=AlertStatus.OPEN,
                title="from-a",
            ),
            Alert(
                org_id=org_id,
                rule_id=rule.id,
                log_id=log_b.id,
                severity=Severity.CRITICAL,
                status=AlertStatus.OPEN,
                title="from-b",
            ),
        ]
    )
    db_session.flush()

    all_summary = client.get("/dashboard/summary", headers=auth_headers).json()
    assert all_summary["ingest"]["today_total"] == 2
    assert len(all_summary["alert_queue"]) == 2
    by_sev_all = {row["severity"]: row["count"] for row in all_summary["severity_breakdown"]}
    assert by_sev_all["critical"] == 2

    scoped_summary = client.get("/dashboard/summary", params={"agent_id": agent_a.id}, headers=auth_headers).json()
    assert scoped_summary["ingest"]["today_total"] == 1
    assert len(scoped_summary["alert_queue"]) == 1
    assert scoped_summary["alert_queue"][0]["title"] == "from-a"
    by_sev_scoped = {row["severity"]: row["count"] for row in scoped_summary["severity_breakdown"]}
    assert by_sev_scoped["critical"] == 1
    # active_alerts KPI narrows too.
    kpi_by_key = {k["key"]: k for k in scoped_summary["kpis"]}
    assert kpi_by_key["alerts"]["value"] == "1"
    assert kpi_by_key["events"]["value"] == "1"

    scoped_events = client.get("/dashboard/panels/events", params={"agent_id": agent_b.id}, headers=auth_headers).json()
    assert scoped_events["total"] == 1

    scoped_alerts = client.get("/dashboard/panels/alerts", params={"agent_id": agent_b.id}, headers=auth_headers).json()
    assert scoped_alerts["total"] == 1
    assert scoped_alerts["recent"][0]["title"] == "from-b"

    scoped_risk = client.get("/dashboard/panels/risk", params={"agent_id": agent_a.id}, headers=auth_headers).json()
    assert scoped_risk["score"] == 4.0  # 1 critical * 4, not 2 critical * 4

    scoped_critical = client.get(
        "/dashboard/panels/critical", params={"agent_id": agent_a.id}, headers=auth_headers
    ).json()
    assert scoped_critical["count"] == 1
    assert scoped_critical["recent"][0]["title"] == "from-a"

    scoped_severity = client.get(
        "/dashboard/panels/severity/critical", params={"agent_id": agent_b.id}, headers=auth_headers
    ).json()
    assert scoped_severity["count"] == 1

    scoped_rule = client.get(
        f"/dashboard/panels/rule/{rule.id}", params={"agent_id": agent_a.id}, headers=auth_headers
    ).json()
    assert scoped_rule["count_today"] == 1

    scoped_event_type = client.get(
        "/dashboard/panels/event-type/e", params={"agent_id": agent_a.id}, headers=auth_headers
    ).json()
    assert scoped_event_type["log_count"] == 1
    assert scoped_event_type["alert_count"] == 1

    # agents_online/agents_total stay fleet-wide even when scoped — a
    # deliberate exception (see dashboard_service.get_summary's own comment).
    assert scoped_summary["banner"]["agents_total"] == all_summary["banner"]["agents_total"]


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
