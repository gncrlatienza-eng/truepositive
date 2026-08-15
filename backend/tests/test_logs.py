from datetime import UTC, datetime

from app.models.alert_rule import AlertRule
from app.models.common import Severity


def _create_agent(client, auth_headers, name="dc-01", platform="windows"):
    response = client.post("/agents", json={"name": name, "platform": platform}, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_local_source(client, auth_headers, agent_id, name="Security"):
    response = client.post(
        "/logs/sources",
        json={"name": name, "type": "local", "agent_id": agent_id, "path": "Security"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _log_entry(source_id, **overrides):
    entry = {
        "source_id": source_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "severity": "high",
        "event_type": "An account failed to log on",
        "message": "failed logon for user x",
        "raw": {},
    }
    entry.update(overrides)
    return entry


def test_ingest_requires_agent_auth(client, auth_headers):
    created = _create_agent(client, auth_headers)
    source = _create_local_source(client, auth_headers, created["agent"]["id"])
    response = client.post(f"/agents/{created['agent']['id']}/logs", json={"logs": [_log_entry(source["id"])]})
    assert response.status_code == 401


def test_ingest_rejects_source_not_assigned_to_agent(client, auth_headers):
    created = _create_agent(client, auth_headers)
    other_agent = _create_agent(client, auth_headers, name="dc-02")
    source = _create_local_source(client, auth_headers, other_agent["agent"]["id"])

    response = client.post(
        f"/agents/{created['agent']['id']}/logs",
        json={"logs": [_log_entry(source["id"])]},
        headers={"X-Agent-Key": created["enrollment_key"]},
    )
    assert response.status_code == 422


def test_ingest_writes_logs_and_evaluates_rules(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)

    org_id = client.get("/auth/me", headers=auth_headers).json()["org"]["id"]
    rule = AlertRule(
        org_id=org_id,
        name="Failed login burst",
        conditions={"event_type": "An account failed to log on", "min_severity": "high"},
        severity=Severity.HIGH,
        enabled=True,
    )
    db_session.add(rule)
    db_session.flush()

    response = client.post(
        f"/agents/{agent_id}/logs",
        json={"logs": [_log_entry(source["id"]), _log_entry(source["id"], severity="ok", event_type="benign")]},
        headers={"X-Agent-Key": key},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ingested"] == 2
    assert body["alerts_created"] == 1  # only the matching high-severity failed-login entry

    listed = client.get("/logs", headers=auth_headers).json()
    assert listed["total"] == 2

    alerts = client.get("/alerts", headers=auth_headers).json()
    assert alerts["total"] == 1
    assert alerts["items"][0]["rule_id"] == str(rule.id)


def test_delete_source_detaches_logs(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)

    ingest = client.post(
        f"/agents/{agent_id}/logs",
        json={"logs": [_log_entry(source["id"])]},
        headers={"X-Agent-Key": key},
    )
    assert ingest.status_code == 200, ingest.text

    delete = client.delete(f"/logs/sources/{source['id']}", headers=auth_headers)
    assert delete.status_code == 204, delete.text

    logs = client.get("/logs", headers=auth_headers).json()
    assert logs["total"] == 1
    assert logs["items"][0]["source_id"] is None


def test_ingest_disabled_rule_does_not_fire(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)

    org_id = client.get("/auth/me", headers=auth_headers).json()["org"]["id"]
    db_session.add(
        AlertRule(org_id=org_id, name="disabled", conditions={"event_type": "x"}, severity=Severity.HIGH, enabled=False)
    )
    db_session.flush()

    response = client.post(
        f"/agents/{agent_id}/logs",
        json={"logs": [_log_entry(source["id"], event_type="x")]},
        headers={"X-Agent-Key": key},
    )
    assert response.json()["alerts_created"] == 0


def test_list_logs_filters_by_severity_and_search(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)

    client.post(
        f"/agents/{agent_id}/logs",
        json={
            "logs": [
                _log_entry(source["id"], severity="critical", event_type="A", message="alpha"),
                _log_entry(source["id"], severity="medium", event_type="B", message="beta"),
            ]
        },
        headers={"X-Agent-Key": key},
    )

    by_severity = client.get("/logs", params={"severity": "critical"}, headers=auth_headers).json()
    assert by_severity["total"] == 1
    assert by_severity["items"][0]["message"] == "alpha"

    by_search = client.get("/logs", params={"q": "beta"}, headers=auth_headers).json()
    assert by_search["total"] == 1
    assert by_search["items"][0]["event_type"] == "B"


def test_get_log_and_cross_org_404(client, auth_headers, second_org_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)
    client.post(f"/agents/{agent_id}/logs", json={"logs": [_log_entry(source["id"])]}, headers={"X-Agent-Key": key})

    log_id = client.get("/logs", headers=auth_headers).json()["items"][0]["id"]

    same_org = client.get(f"/logs/{log_id}", headers=auth_headers)
    assert same_org.status_code == 200

    cross_org = client.get(f"/logs/{log_id}", headers=second_org_headers)
    assert cross_org.status_code == 404


def test_export_csv(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)
    client.post(
        f"/agents/{agent_id}/logs",
        json={"logs": [_log_entry(source["id"], message="csv row")]},
        headers={"X-Agent-Key": key},
    )

    response = client.get("/logs/export.csv", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "csv row" in response.text
    assert response.text.splitlines()[0] == "id,timestamp,severity,event_type,source_id,agent_id,message"


def test_agent_sources_endpoint_returns_only_active_local_for_that_agent(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    _create_local_source(client, auth_headers, agent_id, name="active")
    remote_source_payload = {
        "name": "remote",
        "type": "remote",
        "agent_id": agent_id,
        "host": "10.0.0.1",
        "protocol": "ssh",
        "credential_type": "password",
        "credential": "secret",
    }
    remote = client.post("/logs/sources", json=remote_source_payload, headers=auth_headers)
    assert remote.status_code == 201, remote.text

    paused_source = _create_local_source(client, auth_headers, agent_id, name="paused")
    client.patch(f"/logs/sources/{paused_source['id']}", json={"status": "paused"}, headers=auth_headers)

    response = client.get(f"/agents/{agent_id}/sources", headers={"X-Agent-Key": key})
    assert response.status_code == 200, response.text
    names = [s["name"] for s in response.json()]
    assert names == ["active"]
