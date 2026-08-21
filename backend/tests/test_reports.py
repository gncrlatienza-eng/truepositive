"""Tests for reports endpoints — generation, listing, cross-org isolation,
CSV export, and schedule CRUD.

Follows test_dashboard.py's exact patterns: direct ORM inserts for test
data, HTTP client for the routes under test, rollback-per-test isolation.
"""

import uuid
from datetime import UTC, datetime

from app.models.alert import Alert, AlertStatus
from app.models.common import Severity
from app.models.log import Log


def _org_id(client, headers) -> uuid.UUID:
    return uuid.UUID(client.get("/auth/me", headers=headers).json()["org"]["id"])


def _seed_some_logs_and_alerts(db_session, org_id):
    now = datetime.now(UTC)
    log = Log(org_id=org_id, timestamp=now, severity=Severity.HIGH, event_type="e", message="m", raw={})
    db_session.add(log)
    db_session.flush()
    db_session.add(Alert(org_id=org_id, log_id=log.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t"))
    db_session.flush()


# ── Generation ───────────────────────────────────────────────────────────────


def test_generate_daily_report(client, auth_headers):
    r = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["type"] == "daily"
    assert body["period_start"] == body["period_end"]


def test_generate_report_returns_real_data(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    _seed_some_logs_and_alerts(db_session, org_id)

    r = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    events_kpi = next(k for k in data["kpis"] if k["label"] == "Events ingested")
    assert isinstance(events_kpi["value"], int)
    assert events_kpi["value"] >= 1
    assert len(data["hour_bars"]) == 24
    assert all("today_count" in b and "yesterday_count" in b for b in data["hour_bars"])


def test_generate_daily_report_includes_agent_status(client, auth_headers):
    r = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers)
    data = r.json()["data"]
    assert data["agent_summary"] == "0 of 0 reporting"
    assert data["agents"] == []


def test_generate_weekly_report_has_daily_alert_buckets(client, auth_headers):
    r = client.get("/reports/generate", params={"type": "weekly"}, headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert len(data["alerts_by_day"]) == 7
    assert isinstance(data["trending_rules"], list)


def test_generate_monthly_report_has_executive_summary(client, auth_headers):
    r = client.get("/reports/generate", params={"type": "monthly"}, headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert isinstance(data["executive_summary"], str)
    assert "events processed" in data["executive_summary"]


def test_generate_with_custom_period(client, auth_headers):
    r = client.get(
        "/reports/generate",
        params={"type": "weekly", "period_start": "2026-01-01", "period_end": "2026-01-10"},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["period_start"] == "2026-01-01"
    assert body["period_end"] == "2026-01-10"
    # 10 real days, not the type's usual 7-day rolling window.
    assert len(body["data"]["alerts_by_day"]) == 10


def test_generate_compliance_report_has_framework_rows(client, auth_headers):
    r = client.get("/reports/generate", params={"type": "compliance"}, headers=auth_headers)
    assert r.status_code == 200, r.text
    rows = r.json()["data"]["framework_rows"]
    assert len(rows) == 4
    assert all(row["status"] in ("pass", "review", "n/a") for row in rows)


def test_generate_invalid_type_422(client, auth_headers):
    r = client.get("/reports/generate", params={"type": "yearly"}, headers=auth_headers)
    assert r.status_code == 422


def test_generate_requires_auth(client):
    r = client.get("/reports/generate", params={"type": "daily"})
    assert r.status_code == 401


# ── Listing ──────────────────────────────────────────────────────────────────


def test_list_reports_empty(client, auth_headers):
    r = client.get("/reports", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 0


def test_list_reports_after_generate(client, auth_headers):
    generated = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers).json()
    r = client.get("/reports", headers=auth_headers)
    ids = [item["id"] for item in r.json()["items"]]
    assert generated["id"] in ids


def test_get_report_cross_org_404(client, auth_headers, second_org_headers):
    generated = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers).json()
    r = client.get(f"/reports/{generated['id']}", headers=second_org_headers)
    assert r.status_code == 404


def test_list_reports_includes_real_report_data(client, auth_headers):
    client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers)
    r = client.get("/reports", headers=auth_headers)
    assert "kpis" in r.json()["items"][0]["data"]


def test_list_reports_shows_real_owner(client, auth_headers):
    client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers)
    r = client.get("/reports", headers=auth_headers)
    assert r.json()["items"][0]["owner_email"] == "fixture-user@example.com"


# ── CSV export ───────────────────────────────────────────────────────────────


def test_report_csv_export(client, auth_headers):
    generated = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers).json()
    r = client.get(f"/reports/{generated['id']}/export.csv", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "field,value" in r.text


def test_report_pdf_export(client, auth_headers):
    generated = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers).json()
    r = client.get(f"/reports/{generated['id']}/export.pdf", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"  # a real PDF, not a placeholder


# ── Schedules ────────────────────────────────────────────────────────────────


def test_create_schedule(client, auth_headers):
    r = client.post(
        "/reports/schedules",
        json={"report_type": "daily", "frequency": "daily", "email": "soc@example.com"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    schedule_id = r.json()["id"]

    listed = client.get("/reports/schedules", headers=auth_headers).json()
    assert any(s["id"] == schedule_id for s in listed)


def test_delete_schedule(client, auth_headers):
    created = client.post(
        "/reports/schedules",
        json={"report_type": "weekly", "frequency": "weekly", "email": "soc@example.com"},
        headers=auth_headers,
    ).json()
    r = client.delete(f"/reports/schedules/{created['id']}", headers=auth_headers)
    assert r.status_code == 204

    listed = client.get("/reports/schedules", headers=auth_headers).json()
    assert all(s["id"] != created["id"] for s in listed)


def test_schedule_cross_org_404(client, auth_headers, second_org_headers):
    created = client.post(
        "/reports/schedules",
        json={"report_type": "daily", "frequency": "daily", "email": "soc@example.com"},
        headers=auth_headers,
    ).json()
    r = client.delete(f"/reports/schedules/{created['id']}", headers=second_org_headers)
    assert r.status_code == 404


# ── Quick stats ──────────────────────────────────────────────────────────────


def test_quick_stats_all_zero_for_fresh_org(client, auth_headers):
    r = client.get("/reports/stats", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reports_this_month"] == 0
    assert body["active_schedules"] == 0
    assert body["last_export_at"] is None


def test_quick_stats_counts_real_generated_reports(client, auth_headers):
    client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers)
    client.get("/reports/generate", params={"type": "weekly"}, headers=auth_headers)
    r = client.get("/reports/stats", headers=auth_headers)
    assert r.json()["reports_this_month"] == 2


def test_quick_stats_counts_enabled_schedules_only(client, auth_headers):
    client.post(
        "/reports/schedules",
        json={"report_type": "daily", "frequency": "daily", "email": "soc@example.com"},
        headers=auth_headers,
    )
    r = client.get("/reports/stats", headers=auth_headers)
    assert r.json()["active_schedules"] == 1


def test_quick_stats_last_export_set_by_real_export_call(client, auth_headers):
    generated = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers).json()
    before = client.get("/reports/stats", headers=auth_headers).json()
    assert before["last_export_at"] is None

    client.get(f"/reports/{generated['id']}/export.csv", headers=auth_headers)
    after = client.get("/reports/stats", headers=auth_headers).json()
    assert after["last_export_at"] is not None


def test_quick_stats_requires_auth(client):
    r = client.get("/reports/stats")
    assert r.status_code == 401


def test_quick_stats_scoped_to_org(client, auth_headers, second_org_headers):
    client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers)
    r = client.get("/reports/stats", headers=second_org_headers)
    assert r.json()["reports_this_month"] == 0
