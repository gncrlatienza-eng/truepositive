"""Tests for threat intel endpoints — IOC search against the static curated
feed, single-indicator lookup/enrichment, MITRE ATT&CK tag grouping, and
linking an indicator's real related alerts to an incident.
"""

from datetime import UTC, datetime

from app.models.alert import Alert, AlertStatus
from app.models.common import Severity
from app.models.log import Log


def _org_id(client, headers) -> str:
    return client.get("/auth/me", headers=headers).json()["org"]["id"]


def test_ioc_search_known_ip_hit(client, auth_headers):
    r = client.get("/intel/search", params={"q": "185.220.101.1"}, headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 1
    assert body["results"][0]["type"] == "ip"


def test_ioc_search_no_match(client, auth_headers):
    r = client.get("/intel/search", params={"q": "999.999.999.999"}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"query": "999.999.999.999", "results": [], "total": 0}


def test_ioc_search_min_chars(client, auth_headers):
    r = client.get("/intel/search", params={"q": "x"}, headers=auth_headers)
    assert r.status_code == 422


def test_ioc_search_requires_auth(client):
    r = client.get("/intel/search", params={"q": "185.220.101.1"})
    assert r.status_code == 401


def test_ioc_search_shows_existing_whitelist_status(client, auth_headers):
    # Real bug this guards against: search results never told the analyst an
    # indicator was already allowed/blocked, so Allow/Block looked safe to
    # click again and instead hit a 409 with no explanation.
    fresh = client.get("/intel/search", params={"q": "185.220.101.1"}, headers=auth_headers)
    assert fresh.json()["results"][0]["whitelist_status"] is None

    client.post(
        "/settings/whitelist", json={"type": "ip", "value": "185.220.101.1", "kind": "block"}, headers=auth_headers
    )

    after = client.get("/intel/search", params={"q": "185.220.101.1"}, headers=auth_headers)
    assert after.json()["results"][0]["whitelist_status"] == "block"


def test_ioc_search_status_is_org_scoped(client, auth_headers, second_org_headers):
    client.post(
        "/settings/whitelist", json={"type": "ip", "value": "185.220.101.1", "kind": "block"}, headers=auth_headers
    )
    other_org = client.get("/intel/search", params={"q": "185.220.101.1"}, headers=second_org_headers)
    assert other_org.json()["results"][0]["whitelist_status"] is None


# ── Lookup (single-indicator enrichment) ────────────────────────────────────


def test_lookup_known_ip_returns_real_score(client, auth_headers):
    r = client.get("/intel/lookup", params={"type": "ip", "value": "185.220.101.1"}, headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["found_in_feed"] is True
    assert body["score"] == 85  # high confidence -> 85, per the documented deterministic formula
    assert body["log_count"] == 0
    assert body["related_alerts"] == []


def test_lookup_unknown_indicator_is_honest_not_found(client, auth_headers):
    r = client.get("/intel/lookup", params={"type": "ip", "value": "203.0.113.99"}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["found_in_feed"] is False
    assert body["score"] is None
    assert body["category"] is None


def test_lookup_finds_real_seen_in_workspace(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    now = datetime.now(UTC)
    log = Log(
        org_id=org_id,
        timestamp=now,
        severity=Severity.HIGH,
        event_type="e",
        message="outbound connection to 185.220.101.1 blocked",
        raw={},
    )
    db_session.add(log)
    db_session.flush()
    alert = Alert(org_id=org_id, log_id=log.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="Tor traffic")
    db_session.add(alert)
    db_session.flush()

    r = client.get("/intel/lookup", params={"type": "ip", "value": "185.220.101.1"}, headers=auth_headers)
    body = r.json()
    assert body["log_count"] == 1
    assert body["first_seen"] is not None
    assert len(body["related_alerts"]) == 1
    assert body["related_alerts"][0]["title"] == "Tor traffic"


# ── Link to incident ─────────────────────────────────────────────────────────


def test_link_to_incident_links_real_related_alerts(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="e",
        message="hit from 185.220.101.1",
        raw={},
    )
    db_session.add(log)
    db_session.flush()
    alert = Alert(org_id=org_id, log_id=log.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t")
    db_session.add(alert)
    db_session.flush()

    incident = client.post(
        "/incidents", json={"title": "Tor investigation", "severity": "high"}, headers=auth_headers
    ).json()

    r = client.post(
        "/intel/link-to-incident",
        json={"type": "ip", "value": "185.220.101.1", "incident_id": incident["id"]},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["alert_count"] == 1

    linked_alert = client.get(f"/alerts/{alert.id}", headers=auth_headers).json()
    assert linked_alert["incident_id"] == incident["id"]


def test_link_to_incident_with_no_related_alerts_still_validates_incident(client, auth_headers):
    incident = client.post("/incidents", json={"title": "Empty", "severity": "ok"}, headers=auth_headers).json()
    r = client.post(
        "/intel/link-to-incident",
        json={"type": "ip", "value": "203.0.113.5", "incident_id": incident["id"]},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["alert_count"] == 0


def test_link_to_incident_cross_org_404(client, auth_headers, second_org_headers):
    incident = client.post("/incidents", json={"title": "Other org", "severity": "ok"}, headers=auth_headers).json()
    r = client.post(
        "/intel/link-to-incident",
        json={"type": "ip", "value": "203.0.113.5", "incident_id": incident["id"]},
        headers=second_org_headers,
    )
    assert r.status_code == 404


def test_mitre_tags_empty_org(client, auth_headers):
    r = client.get("/intel/mitre/techniques", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_mitre_tags_with_tagged_rule(client, auth_headers):
    client.post(
        "/alerts/rules",
        json={
            "name": "Privilege escalation",
            "conditions": {},
            "severity": "high",
            "enabled": True,
            "mitre_technique": "T1078 — Valid Accounts",
        },
        headers=auth_headers,
    )
    r = client.get("/intel/mitre/techniques", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["technique_id"] == "T1078"
    assert body[0]["technique_name"] == "Valid Accounts"
    assert body[0]["tactic"] == "Defense Evasion"
    assert body[0]["rule_count"] == 1


# ── Feed listing (dashboard category breakdown / top-by-risk) ──────────────


def test_feed_lists_all_50_indicators_with_scores(client, auth_headers):
    r = client.get("/intel/feed", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 50
    assert all(isinstance(item["score"], int) for item in body)
    high_conf = next(item for item in body if item["confidence"] == "high")
    assert high_conf["score"] == 85


def test_feed_requires_auth(client):
    r = client.get("/intel/feed")
    assert r.status_code == 401


# ── Workspace hits (bulk cross-reference) ───────────────────────────────────


def test_workspace_hits_empty_for_fresh_org(client, auth_headers):
    r = client.get("/intel/workspace-hits", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_workspace_hits_finds_real_recent_match(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="e",
        message="outbound connection to 185.220.101.1 blocked",
        raw={},
    )
    db_session.add(log)
    db_session.flush()
    alert = Alert(org_id=org_id, log_id=log.id, severity=Severity.HIGH, status=AlertStatus.OPEN, title="Tor traffic")
    db_session.add(alert)
    db_session.flush()

    r = client.get("/intel/workspace-hits", headers=auth_headers)
    body = r.json()
    hit = next(h for h in body if h["value"] == "185.220.101.1")
    assert hit["alert_count"] == 1
    assert hit["last_seen"] is not None


def test_workspace_hits_excludes_matches_outside_window(client, auth_headers, db_session):
    org_id = _org_id(client, auth_headers)
    old_log = Log(
        org_id=org_id,
        timestamp=datetime(2020, 1, 1, tzinfo=UTC),
        severity=Severity.HIGH,
        event_type="e",
        message="hit from 185.220.101.1",
        raw={},
    )
    db_session.add(old_log)
    db_session.flush()

    r = client.get("/intel/workspace-hits", params={"days": 7}, headers=auth_headers)
    assert r.json() == []


def test_workspace_hits_scoped_to_org(client, auth_headers, second_org_headers, db_session):
    org_id = _org_id(client, auth_headers)
    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="e",
        message="hit from 185.220.101.1",
        raw={},
    )
    db_session.add(log)
    db_session.flush()

    r = client.get("/intel/workspace-hits", headers=second_org_headers)
    assert r.json() == []


def test_workspace_hits_requires_auth(client):
    r = client.get("/intel/workspace-hits")
    assert r.status_code == 401


# ── MITRE coverage matrix ───────────────────────────────────────────────────


def test_mitre_coverage_empty_org_has_zero_covered(client, auth_headers):
    r = client.get("/intel/mitre/coverage", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["tactics"]) == 10
    assert all(t["techniques_covered"] == 0 for t in body["tactics"])
    assert all(t["techniques_total"] > 0 for t in body["tactics"])
    assert body["techniques"] == []


def test_mitre_coverage_reflects_real_tagged_rule(client, auth_headers):
    client.post(
        "/alerts/rules",
        json={
            "name": "Privilege escalation",
            "conditions": {},
            "severity": "high",
            "enabled": True,
            "mitre_technique": "T1078 — Valid Accounts",
        },
        headers=auth_headers,
    )
    r = client.get("/intel/mitre/coverage", headers=auth_headers)
    body = r.json()
    defense_evasion = next(t for t in body["tactics"] if t["tactic"] == "Defense Evasion")
    assert defense_evasion["techniques_covered"] == 1
    assert len(body["techniques"]) == 1


def test_mitre_coverage_requires_auth(client):
    r = client.get("/intel/mitre/coverage")
    assert r.status_code == 401
