from datetime import UTC, datetime

from app.models.alert import Alert, AlertStatus
from app.models.alert_rule import AlertRule
from app.models.common import Severity
from app.models.log import Log


def _org_id(client, headers) -> str:
    return client.get("/auth/me", headers=headers).json()["org"]["id"]


def _create_rule(client, auth_headers, **overrides):
    payload = {"name": "r1", "conditions": {"event_type": "x"}, "severity": "high", "enabled": True}
    payload.update(overrides)
    response = client.post("/alerts/rules", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_list_rules(client, auth_headers):
    _create_rule(client, auth_headers, name="A")
    _create_rule(client, auth_headers, name="B", enabled=False)

    all_rules = client.get("/alerts/rules", headers=auth_headers).json()
    assert {r["name"] for r in all_rules} == {"A", "B"}

    enabled_only = client.get("/alerts/rules", params={"enabled": True}, headers=auth_headers).json()
    assert [r["name"] for r in enabled_only] == ["A"]


def test_rule_conditions_round_trip(client, auth_headers):
    created = _create_rule(
        client, auth_headers, conditions={"event_type": "A process was created", "min_severity": "critical"}
    )
    assert created["conditions"] == {"event_type": "A process was created", "min_severity": "critical"}


def test_update_and_delete_rule(client, auth_headers):
    created = _create_rule(client, auth_headers)
    updated = client.patch(f"/alerts/rules/{created['id']}", json={"enabled": False}, headers=auth_headers)
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False

    deleted = client.delete(f"/alerts/rules/{created['id']}", headers=auth_headers)
    assert deleted.status_code == 204
    assert client.get(f"/alerts/rules/{created['id']}", headers=auth_headers).status_code == 404


def test_delete_rule_detaches_existing_alerts(client, auth_headers, db_session):
    created = _create_rule(client, auth_headers)
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, rule_id=created["id"], severity=Severity.HIGH, status=AlertStatus.OPEN, title="t")
    db_session.add(alert)
    db_session.flush()

    client.delete(f"/alerts/rules/{created['id']}", headers=auth_headers)

    fetched = client.get(f"/alerts/{alert.id}", headers=auth_headers).json()
    assert fetched["rule_id"] is None


def test_cross_org_rule_404(client, auth_headers, second_org_headers):
    created = _create_rule(client, auth_headers)
    response = client.get(f"/alerts/rules/{created['id']}", headers=second_org_headers)
    assert response.status_code == 404


def test_list_alerts_filters(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    rule = AlertRule(org_id=org_id, name="r", conditions={}, severity=Severity.HIGH, enabled=True)
    db_session.add(rule)
    db_session.flush()
    db_session.add_all(
        [
            Alert(org_id=org_id, rule_id=rule.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="open-one"),
            Alert(
                org_id=org_id,
                rule_id=rule.id,
                severity=Severity.CRITICAL,
                status=AlertStatus.RESOLVED,
                title="resolved-one",
            ),
        ]
    )
    db_session.flush()

    open_only = client.get("/alerts", params={"status": "open"}, headers=auth_headers).json()
    assert open_only["total"] == 1
    assert open_only["items"][0]["title"] == "open-one"

    critical_only = client.get("/alerts", params={"severity": "critical"}, headers=auth_headers).json()
    assert critical_only["total"] == 1
    assert critical_only["items"][0]["title"] == "resolved-one"


def test_list_alerts_filters_by_agent_id(client, auth_headers):
    # Alert has no agent_id of its own -- this exercises the join-through-Log
    # path that backs the dashboard's Scope Switcher for per-device alerts.
    _create_rule(client, auth_headers, conditions={"min_severity": "high"})

    def _create_agent(name):
        response = client.post("/agents", json={"name": name, "platform": "windows"}, headers=auth_headers)
        assert response.status_code == 201, response.text
        return response.json()

    def _ship_triggering_log(agent, message):
        agent_id, key = agent["agent"]["id"], agent["enrollment_key"]
        source = client.post(
            "/logs/sources",
            json={"name": "s", "type": "local", "agent_id": agent_id, "path": "Security"},
            headers=auth_headers,
        ).json()
        response = client.post(
            f"/agents/{agent_id}/logs",
            json={
                "logs": [
                    {
                        "source_id": source["id"],
                        "timestamp": datetime.now(UTC).isoformat(),
                        "severity": "high",
                        "event_type": "x",
                        "message": message,
                        "raw": {},
                    }
                ]
            },
            headers={"X-Agent-Key": key},
        )
        assert response.status_code == 200, response.text

    first = _create_agent("dc-01")
    second = _create_agent("dc-02")
    _ship_triggering_log(first, "from-first")
    _ship_triggering_log(second, "from-second")

    scoped = client.get("/alerts", params={"agent_id": first["agent"]["id"]}, headers=auth_headers).json()
    assert scoped["total"] == 1
    assert scoped["items"][0]["description"] == "from-first"

    all_alerts = client.get("/alerts", headers=auth_headers).json()
    assert all_alerts["total"] == 2


def test_ack_escalate_resolve_transitions(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t")
    db_session.add(alert)
    db_session.flush()
    alert_id = alert.id

    ack = client.patch(f"/alerts/{alert_id}", json={"status": "ack"}, headers=auth_headers)
    assert ack.status_code == 200
    assert ack.json()["status"] == "ack"

    escalate = client.patch(f"/alerts/{alert_id}", json={"status": "escalated"}, headers=auth_headers)
    assert escalate.json()["status"] == "escalated"

    resolve = client.patch(f"/alerts/{alert_id}", json={"status": "resolved"}, headers=auth_headers)
    assert resolve.json()["status"] == "resolved"


def test_reassign_to_user_outside_org_404(client, auth_headers, second_org_headers, db_session):
    org_id = _org_id(client, auth_headers)
    other_user_id = client.get("/auth/me", headers=second_org_headers).json()["user"]["id"]
    alert = Alert(org_id=org_id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t")
    db_session.add(alert)
    db_session.flush()

    response = client.patch(f"/alerts/{alert.id}", json={"assignee_id": other_user_id}, headers=auth_headers)
    assert response.status_code == 404


def test_cross_org_alert_404(client, auth_headers, second_org_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t")
    db_session.add(alert)
    db_session.flush()

    response = client.get(f"/alerts/{alert.id}", headers=second_org_headers)
    assert response.status_code == 404


def test_list_alerts_search_and_log_id_filter(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    now = datetime.now(UTC)
    log_a = Log(org_id=org_id, timestamp=now, severity=Severity.HIGH, event_type="x", message="m1")
    log_b = Log(org_id=org_id, timestamp=now, severity=Severity.MEDIUM, event_type="x", message="m2")
    db_session.add_all([log_a, log_b])
    db_session.flush()

    db_session.add_all(
        [
            Alert(
                org_id=org_id,
                severity=Severity.HIGH,
                status=AlertStatus.OPEN,
                title="Obfuscated PowerShell command",
                log_id=log_a.id,
            ),
            Alert(
                org_id=org_id,
                severity=Severity.MEDIUM,
                status=AlertStatus.OPEN,
                title="Port scan detected",
                description="A network share object was accessed",
                log_id=log_b.id,
            ),
        ]
    )
    db_session.flush()

    by_title = client.get("/alerts", params={"q": "PowerShell"}, headers=auth_headers).json()
    assert by_title["total"] == 1
    assert by_title["items"][0]["title"] == "Obfuscated PowerShell command"

    by_description = client.get("/alerts", params={"q": "network share"}, headers=auth_headers).json()
    assert by_description["total"] == 1
    assert by_description["items"][0]["title"] == "Port scan detected"

    by_log_id = client.get("/alerts", params={"log_id": log_b.id}, headers=auth_headers).json()
    assert by_log_id["total"] == 1
    assert by_log_id["items"][0]["title"] == "Port scan detected"


def test_create_manual_alert_from_log(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    now = datetime.now(UTC)
    log = Log(org_id=org_id, timestamp=now, severity=Severity.MEDIUM, event_type="x", message="suspicious thing")
    db_session.add(log)
    db_session.flush()

    r = client.post(
        "/alerts",
        json={"title": "Manually escalated log", "severity": "high", "log_id": log.id},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "Manually escalated log"
    assert body["severity"] == "high"
    assert body["status"] == "open"
    assert body["rule_id"] is None
    assert body["log_id"] == log.id


def test_create_manual_alert_without_log(client, auth_headers):
    r = client.post("/alerts", json={"title": "No log yet", "severity": "medium"}, headers=auth_headers)
    assert r.status_code == 201, r.text
    assert r.json()["log_id"] is None


def test_create_manual_alert_rejects_cross_org_log(client, auth_headers, second_org_headers, db_session):
    other_org_id = _org_id(client, second_org_headers)
    log = Log(org_id=other_org_id, timestamp=datetime.now(UTC), severity=Severity.HIGH, event_type="x", message="m")
    db_session.add(log)
    db_session.flush()

    r = client.post("/alerts", json={"title": "t", "severity": "high", "log_id": log.id}, headers=auth_headers)
    assert r.status_code == 404


def test_alerts_export_csv(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, severity=Severity.CRITICAL, status=AlertStatus.OPEN, title="csv row alert")
    db_session.add(alert)
    db_session.flush()

    response = client.get("/alerts/export.csv", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "csv row alert" in response.text
    assert response.text.splitlines()[0] == "id,created_at,severity,status,title,rule_id,log_id,assignee_id"


def test_alerts_export_csv_cross_org_isolation(client, auth_headers, second_org_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="only-mine")
    db_session.add(alert)
    db_session.flush()

    response = client.get("/alerts/export.csv", headers=second_org_headers)
    assert "only-mine" not in response.text
