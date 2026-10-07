"""Regression tests for the 2026-10-04 audit fixes — one test per real
failure mode found (expired enrollment keys still working, unbounded inputs,
explicit-null PATCH 500s, wildcard search, wrong scheduled-report period,
rate-limiter memory growth). See docs/AUDIT_2026-10-04.md.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from starlette.requests import Request

from app.models.agent import Agent
from app.models.alert_rule import AlertRule
from app.models.common import Severity
from app.services import report_scheduler
from app.utils import rate_limit


def _create_agent(client, auth_headers, name="dc-01"):
    response = client.post("/agents", json={"name": name, "platform": "windows"}, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_local_source(client, auth_headers, agent_id):
    response = client.post(
        "/logs/sources",
        json={"name": "Security", "type": "local", "agent_id": agent_id, "path": "Security"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _log_entry(source_id, **overrides):
    entry = {
        "source_id": source_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "severity": "high",
        "event_type": "Logon",
        "message": "hello world",
        "raw": {},
    }
    entry.update(overrides)
    return entry


def _org_id(client, headers) -> str:
    return client.get("/auth/me", headers=headers).json()["org"]["id"]


# ── Agent enrollment ──────────────────────────────────────────────────────────


def test_expired_pending_key_rejected_on_heartbeat_and_logs(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)

    agent = db_session.get(Agent, uuid.UUID(agent_id))
    agent.enrollment_expires_at = datetime.now(UTC) - timedelta(hours=1)
    db_session.flush()

    headers = {"X-Agent-Key": key}
    assert client.post(f"/agents/{agent_id}/heartbeat", headers=headers).status_code == 410
    logs = client.post(f"/agents/{agent_id}/logs", json={"logs": [_log_entry(source["id"])]}, headers=headers)
    assert logs.status_code == 410
    assert client.get(f"/agents/{agent_id}", headers=auth_headers).json()["status"] == "pending"


def test_unknown_agent_id_still_401(client):
    response = client.post(f"/agents/{uuid.uuid4()}/heartbeat", headers={"X-Agent-Key": "tpa_x"})
    assert response.status_code == 401


# ── Log ingestion ─────────────────────────────────────────────────────────────


def test_long_rule_name_truncates_alert_title_instead_of_failing_batch(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)
    db_session.add(
        AlertRule(
            org_id=_org_id(client, auth_headers),
            name="R" * 255,
            conditions={"event_type": "E" * 100},
            severity=Severity.HIGH,
            enabled=True,
        )
    )
    db_session.flush()

    response = client.post(
        f"/agents/{agent_id}/logs",
        json={"logs": [_log_entry(source["id"], event_type="E" * 100)]},
        headers={"X-Agent-Key": key},
    )
    assert response.status_code == 200, response.text
    assert response.json()["alerts_created"] == 1
    title = client.get("/alerts", headers=auth_headers).json()["items"][0]["title"]
    assert len(title) == 255


def test_oversized_log_message_is_422(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)
    response = client.post(
        f"/agents/{agent_id}/logs",
        json={"logs": [_log_entry(source["id"], message="x" * 40_000)]},
        headers={"X-Agent-Key": key},
    )
    assert response.status_code == 422


# ── Input validation ──────────────────────────────────────────────────────────


def test_patch_explicit_null_on_required_field_is_422(client, auth_headers):
    inc = client.post("/incidents", json={"title": "t", "severity": "high"}, headers=auth_headers).json()
    for body in ({"status": None}, {"title": None}):
        response = client.patch(f"/incidents/{inc['id']}", json=body, headers=auth_headers)
        assert response.status_code == 422, body
    # A null that *is* meaningful (clearing the assignee) still works.
    assert client.patch(f"/incidents/{inc['id']}", json={"assignee_id": None}, headers=auth_headers).status_code == 200


def test_negative_pagination_is_422(client, auth_headers):
    for path in ("/logs", "/alerts", "/incidents", "/reports"):
        assert client.get(path, params={"offset": -1}, headers=auth_headers).status_code == 422, path
        assert client.get(path, params={"limit": -5}, headers=auth_headers).status_code == 422, path


def test_reports_invalid_type_filter_is_422(client, auth_headers):
    assert client.get("/reports", params={"type": "bogus"}, headers=auth_headers).status_code == 422


def test_custom_report_range_is_validated(client, auth_headers):
    backwards = {"type": "daily", "period_start": "2026-05-02", "period_end": "2026-05-01"}
    assert client.get("/reports/generate", params=backwards, headers=auth_headers).status_code == 422
    too_long = {"type": "daily", "period_start": "2000-01-01", "period_end": "2026-01-01"}
    assert client.get("/reports/generate", params=too_long, headers=auth_headers).status_code == 422
    detail = client.get("/reports/generate", params=backwards, headers=auth_headers).json()["detail"]
    assert "period_start" in detail


def test_create_incident_rejects_other_orgs_assignee(client, auth_headers, second_org_headers):
    other_user_id = client.get("/auth/me", headers=second_org_headers).json()["user"]["id"]
    response = client.post(
        "/incidents", json={"title": "t", "severity": "high", "assignee_id": other_user_id}, headers=auth_headers
    )
    assert response.status_code == 404


def test_schedule_email_rejects_header_injection(client, auth_headers):
    response = client.post(
        "/reports/schedules",
        json={"report_type": "daily", "frequency": "daily", "email": "a@example.com\r\nBcc: x@example.com"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_intel_lookup_treats_wildcards_literally(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = _create_local_source(client, auth_headers, agent_id)
    client.post(f"/agents/{agent_id}/logs", json={"logs": [_log_entry(source["id"])]}, headers={"X-Agent-Key": key})

    wildcard = client.get("/intel/lookup", params={"type": "domain", "value": "___"}, headers=auth_headers)
    assert wildcard.status_code == 200
    assert wildcard.json()["log_count"] == 0

    literal = client.get("/intel/lookup", params={"type": "domain", "value": "hello"}, headers=auth_headers)
    assert literal.json()["log_count"] == 1


def test_link_to_incident_rejects_empty_value(client, auth_headers):
    inc = client.post("/incidents", json={"title": "t", "severity": "high"}, headers=auth_headers).json()
    response = client.post(
        "/intel/link-to-incident", json={"type": "ip", "value": "", "incident_id": inc["id"]}, headers=auth_headers
    )
    assert response.status_code == 422


# ── Scheduled reports ─────────────────────────────────────────────────────────


def test_scheduled_run_reports_on_the_day_that_just_ended(db_session, monkeypatch):
    calls: list[date] = []

    class _Session:
        def __getattr__(self, name):
            return getattr(db_session, name)

        def close(self):
            pass

    monkeypatch.setattr(report_scheduler, "SessionLocal", _Session)
    monkeypatch.setattr(report_scheduler, "_already_generated_today", lambda *a: False)
    monkeypatch.setattr(
        report_scheduler.report_service, "generate_report", lambda db, org_id, rtype, ref: calls.append(ref)
    )

    report_scheduler.run_scheduled_reports("daily")

    assert calls, "expected at least one org in the test database"
    assert set(calls) == {datetime.now(UTC).date() - timedelta(days=1)}


# ── Rate limiter ──────────────────────────────────────────────────────────────


def _request(path_params: dict) -> Request:
    return Request({"type": "http", "path_params": path_params, "client": ("1.2.3.4", 1), "headers": []})


def test_rate_limit_agent_key_ignores_non_uuid_path_values():
    agent_id = uuid.uuid4()
    assert rate_limit.by_agent_id(_request({"agent_id": agent_id})) == str(agent_id)
    assert rate_limit.by_agent_id(_request({"agent_id": "junk-1"})) == "ip:1.2.3.4"
    assert rate_limit.by_agent_id(_request({"agent_id": "junk-2"})) == "ip:1.2.3.4"


def test_rate_limit_sweeps_idle_buckets(monkeypatch):
    rate_limit.reset()
    now = [1000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(rate_limit, "_last_sweep", 0.0)
    rate_limit._check("scope:a", limit=5, window_seconds=60)
    assert "scope:a" in rate_limit._buckets

    now[0] += rate_limit._SWEEP_INTERVAL_SECONDS + 61
    rate_limit._check("scope:b", limit=5, window_seconds=60)
    assert "scope:a" not in rate_limit._buckets
    assert "scope:b" in rate_limit._buckets
    rate_limit.reset()
