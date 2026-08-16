"""Tests for incidents endpoints — auth, CRUD, status machine, SLA, notes,
history/timeline, alert linking, cross-org isolation, CSV export.

Follows test_alerts.py's exact patterns: direct ORM inserts for test data,
HTTP client for the routes under test, rollback-per-test isolation.
"""

from datetime import UTC, datetime, timedelta

from app.models.alert import Alert, AlertStatus
from app.models.common import Severity
from app.models.incident import Incident, IncidentStatus


def _org_id(client, headers) -> str:
    return client.get("/auth/me", headers=headers).json()["org"]["id"]


def _create_incident(client, headers, **overrides):
    payload = {"title": "Test incident", "severity": "high"}
    payload.update(overrides)
    r = client.post("/incidents", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── CRUD ──────────────────────────────────────────────────────────────────────


def test_create_and_list_incidents(client, auth_headers):
    _create_incident(client, auth_headers, title="INC-1")
    _create_incident(client, auth_headers, title="INC-2")

    r = client.get("/incidents", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    titles = {i["title"] for i in data["items"]}
    assert titles == {"INC-1", "INC-2"}


def test_get_incident(client, auth_headers):
    created = _create_incident(client, auth_headers, title="Detail test")
    r = client.get(f"/incidents/{created['id']}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["title"] == "Detail test"


def test_update_incident_title_and_description(client, auth_headers):
    created = _create_incident(client, auth_headers)
    r = client.patch(
        f"/incidents/{created['id']}",
        json={"title": "Updated title", "description": "Some detail"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Updated title"
    assert body["description"] == "Some detail"


def test_delete_incident(client, auth_headers):
    created = _create_incident(client, auth_headers)
    r = client.delete(f"/incidents/{created['id']}", headers=auth_headers)
    assert r.status_code == 204
    assert client.get(f"/incidents/{created['id']}", headers=auth_headers).status_code == 404


# ── Status machine ────────────────────────────────────────────────────────────


def test_incident_status_transitions(client, auth_headers):
    created = _create_incident(client, auth_headers)
    inc_id = created["id"]
    assert created["status"] == "open"

    r = client.patch(f"/incidents/{inc_id}", json={"status": "investigating"}, headers=auth_headers)
    assert r.json()["status"] == "investigating"
    assert r.json()["resolved_at"] is None

    r = client.patch(f"/incidents/{inc_id}", json={"status": "resolved"}, headers=auth_headers)
    body = r.json()
    assert body["status"] == "resolved"
    assert body["resolved_at"] is not None


def test_resolved_at_clears_on_reopen(client, auth_headers):
    created = _create_incident(client, auth_headers)
    inc_id = created["id"]
    client.patch(f"/incidents/{inc_id}", json={"status": "resolved"}, headers=auth_headers)
    r = client.patch(f"/incidents/{inc_id}", json={"status": "open"}, headers=auth_headers)
    assert r.json()["resolved_at"] is None


# ── SLA breach flag ────────────────────────────────────────────────────────────


def test_incident_sla_breach_flag(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    # Backdate created_at by 73 hours so it breaches the 72-hour open SLA.
    old_time = datetime.now(UTC) - timedelta(hours=73)
    inc = Incident(
        org_id=org_id,
        title="Old incident",
        status=IncidentStatus.OPEN,
        risk_score=0,
        created_at=old_time,
    )
    db_session.add(inc)
    db_session.flush()

    r = client.get(f"/incidents/{inc.id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["sla_breached"] is True


def test_resolved_incident_not_sla_breached(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    old_time = datetime.now(UTC) - timedelta(hours=73)
    inc = Incident(
        org_id=org_id,
        title="Old resolved",
        status=IncidentStatus.RESOLVED,
        risk_score=0,
        created_at=old_time,
    )
    db_session.add(inc)
    db_session.flush()

    r = client.get(f"/incidents/{inc.id}", headers=auth_headers)
    assert r.json()["sla_breached"] is False


# ── Alert linking ─────────────────────────────────────────────────────────────


def test_link_and_unlink_alert(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="test alert")
    db_session.add(alert)
    db_session.flush()

    created = _create_incident(client, auth_headers)
    inc_id = created["id"]

    # Link
    r = client.post(
        f"/incidents/{inc_id}/alerts",
        json={"alert_id": str(alert.id)},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["alert_count"] == 1
    assert r.json()["risk_score"] == 75  # HIGH → 75

    # Verify alert count via alerts list endpoint
    r2 = client.get(f"/incidents/{inc_id}/alerts", headers=auth_headers)
    assert r2.status_code == 200
    assert len(r2.json()) == 1
    assert r2.json()[0]["id"] == str(alert.id)

    # Unlink
    r3 = client.delete(f"/incidents/{inc_id}/alerts/{alert.id}", headers=auth_headers)
    assert r3.status_code == 200
    assert r3.json()["alert_count"] == 0


def test_link_alert_cross_org_404(client, auth_headers, second_org_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="mine")
    db_session.add(alert)
    db_session.flush()

    created = _create_incident(client, second_org_headers)
    r = client.post(
        f"/incidents/{created['id']}/alerts",
        json={"alert_id": str(alert.id)},
        headers=second_org_headers,
    )
    assert r.status_code == 404


# ── Risk score recalculation ──────────────────────────────────────────────────


def test_risk_score_reflects_max_severity(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert_med = Alert(org_id=org_id, severity=Severity.MEDIUM, status=AlertStatus.OPEN, title="m")
    alert_crit = Alert(org_id=org_id, severity=Severity.CRITICAL, status=AlertStatus.OPEN, title="c")
    db_session.add_all([alert_med, alert_crit])
    db_session.flush()

    created = _create_incident(client, auth_headers)
    inc_id = created["id"]

    client.post(f"/incidents/{inc_id}/alerts", json={"alert_id": str(alert_med.id)}, headers=auth_headers)
    r = client.post(f"/incidents/{inc_id}/alerts", json={"alert_id": str(alert_crit.id)}, headers=auth_headers)
    assert r.json()["risk_score"] == 100  # CRITICAL → 100


# ── Notes ─────────────────────────────────────────────────────────────────────


def test_add_note_and_list(client, auth_headers):
    created = _create_incident(client, auth_headers)
    inc_id = created["id"]

    r = client.post(f"/incidents/{inc_id}/notes", json={"body": "First note"}, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["body"] == "First note"

    r2 = client.get(f"/incidents/{inc_id}/notes", headers=auth_headers)
    assert len(r2.json()) == 1
    assert r2.json()[0]["body"] == "First note"


def test_note_creates_history_entry(client, auth_headers):
    created = _create_incident(client, auth_headers)
    inc_id = created["id"]
    client.post(f"/incidents/{inc_id}/notes", json={"body": "Timeline note"}, headers=auth_headers)

    history = client.get(f"/incidents/{inc_id}/history", headers=auth_headers).json()
    kinds = [h["kind"] for h in history]
    assert "note_added" in kinds


# ── Timeline / history ────────────────────────────────────────────────────────


def test_history_reflects_all_changes(client, auth_headers):
    created = _create_incident(client, auth_headers)
    inc_id = created["id"]

    client.patch(f"/incidents/{inc_id}", json={"status": "investigating"}, headers=auth_headers)
    client.post(f"/incidents/{inc_id}/notes", json={"body": "noted"}, headers=auth_headers)

    history = client.get(f"/incidents/{inc_id}/history", headers=auth_headers).json()
    kinds = [h["kind"] for h in history]
    # CREATED always first; status_changed and note_added should follow.
    assert kinds[0] == "created"
    assert "status_changed" in kinds
    assert "note_added" in kinds


def test_alert_link_appears_in_history(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="linked")
    db_session.add(alert)
    db_session.flush()

    created = _create_incident(client, auth_headers)
    inc_id = created["id"]
    client.post(f"/incidents/{inc_id}/alerts", json={"alert_id": str(alert.id)}, headers=auth_headers)

    history = client.get(f"/incidents/{inc_id}/history", headers=auth_headers).json()
    kinds = [h["kind"] for h in history]
    assert "alert_linked" in kinds


# ── Cross-org isolation ───────────────────────────────────────────────────────


def test_cross_org_incident_404(client, auth_headers, second_org_headers):
    created = _create_incident(client, auth_headers)
    r = client.get(f"/incidents/{created['id']}", headers=second_org_headers)
    assert r.status_code == 404


def test_cross_org_list_empty(client, auth_headers, second_org_headers):
    _create_incident(client, auth_headers)
    r = client.get("/incidents", headers=second_org_headers)
    assert r.json()["total"] == 0


def test_reassign_to_outside_org_user_404(client, auth_headers, second_org_headers):
    created = _create_incident(client, auth_headers)
    other_user = client.get("/auth/me", headers=second_org_headers).json()["user"]["id"]
    r = client.patch(f"/incidents/{created['id']}", json={"assignee_id": other_user}, headers=auth_headers)
    assert r.status_code == 404


# ── CSV export ────────────────────────────────────────────────────────────────


def test_incidents_export_csv(client, auth_headers):
    _create_incident(client, auth_headers, title="csv-inc")
    r = client.get("/incidents/export.csv", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "csv-inc" in r.text
    assert r.text.splitlines()[0] == "id,created_at,status,risk_score,title,assignee_id,sla_breached"


def test_incidents_export_csv_cross_org_isolation(client, auth_headers, second_org_headers):
    _create_incident(client, auth_headers, title="only-mine")
    r = client.get("/incidents/export.csv", headers=second_org_headers)
    assert "only-mine" not in r.text


# ── Delete incident detaches alerts ──────────────────────────────────────────


def test_delete_incident_detaches_alerts(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    alert = Alert(org_id=org_id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="keep me")
    db_session.add(alert)
    db_session.flush()

    created = _create_incident(client, auth_headers)
    inc_id = created["id"]
    client.post(f"/incidents/{inc_id}/alerts", json={"alert_id": str(alert.id)}, headers=auth_headers)

    client.delete(f"/incidents/{inc_id}", headers=auth_headers)

    # Alert should still exist, but incident_id should be NULL.
    r = client.get(f"/alerts/{alert.id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["incident_id"] is None


# ── Filtering ─────────────────────────────────────────────────────────────────


def test_filter_by_status(client, auth_headers):
    _create_incident(client, auth_headers, title="open-inc")
    created2 = _create_incident(client, auth_headers, title="resolved-inc")
    client.patch(f"/incidents/{created2['id']}", json={"status": "resolved"}, headers=auth_headers)

    r = client.get("/incidents", params={"status": "open"}, headers=auth_headers)
    titles = [i["title"] for i in r.json()["items"]]
    assert "open-inc" in titles
    assert "resolved-inc" not in titles


def test_search_by_title(client, auth_headers):
    _create_incident(client, auth_headers, title="Database breach")
    _create_incident(client, auth_headers, title="Login anomaly")

    r = client.get("/incidents", params={"q": "database"}, headers=auth_headers)
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["title"] == "Database breach"
