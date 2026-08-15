from app.models.alert import Alert, AlertStatus
from app.models.alert_rule import AlertRule
from app.models.common import Severity


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
