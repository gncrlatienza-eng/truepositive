"""Tests for playbooks endpoints and the playbook evaluation engine.

Follows the same pattern as test_alerts.py and test_incidents.py.
"""

from app.models.agent import Agent
from app.models.common import Severity
from app.models.log import Log
from app.models.log_source import LogSource


def _org_id(client, headers) -> str:
    return client.get("/auth/me", headers=headers).json()["org"]["id"]


def _create_playbook(client, headers, **overrides):
    payload = {
        "name": "Test playbook",
        "trigger": {"event_type": "test-event"},
        "actions": {"auto_create_incident": False},
        "enabled": True,
    }
    payload.update(overrides)
    r = client.post("/playbooks", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── CRUD ──────────────────────────────────────────────────────────────────────


def test_create_and_list_playbooks(client, auth_headers):
    _create_playbook(client, auth_headers, name="PB-1")
    _create_playbook(client, auth_headers, name="PB-2", enabled=False)

    r = client.get("/playbooks", headers=auth_headers)
    assert r.status_code == 200
    names = {pb["name"] for pb in r.json()}
    assert names == {"PB-1", "PB-2"}


def test_playbook_trigger_round_trip(client, auth_headers):
    pb = _create_playbook(
        client,
        auth_headers,
        trigger={"event_type": "An account failed to log on", "min_severity": "high"},
        actions={"block_ip": True, "auto_create_incident": True},
    )
    assert pb["trigger_conditions"]["event_type"] == "An account failed to log on"
    assert pb["trigger_conditions"]["min_severity"] == "high"
    assert pb["actions"]["block_ip"] is True
    assert pb["actions"]["auto_create_incident"] is True


def test_update_playbook(client, auth_headers):
    pb = _create_playbook(client, auth_headers)
    r = client.patch(
        f"/playbooks/{pb['id']}",
        json={"name": "Updated", "enabled": False},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Updated"
    assert r.json()["enabled"] is False


def test_delete_playbook(client, auth_headers):
    pb = _create_playbook(client, auth_headers)
    r = client.delete(f"/playbooks/{pb['id']}", headers=auth_headers)
    assert r.status_code == 204
    assert client.get(f"/playbooks/{pb['id']}", headers=auth_headers).status_code == 404


def test_cross_org_playbook_404(client, auth_headers, second_org_headers):
    pb = _create_playbook(client, auth_headers)
    r = client.get(f"/playbooks/{pb['id']}", headers=second_org_headers)
    assert r.status_code == 404


# ── Trigger evaluation (via real ingestion) ───────────────────────────────────


def _setup_agent_and_source(client, db_session, headers):
    """Create an enrolled agent + local source in the DB for ingestion tests."""
    org_id = _org_id(client, headers)
    agent = Agent(
        org_id=org_id,
        name="test-agent",
        status="connected",
        enrollment_key_hash="x",
    )
    db_session.add(agent)
    db_session.flush()
    source = LogSource(
        org_id=org_id,
        agent_id=agent.id,
        name="test-source",
        source_type="local",
        path="/var/log/test",
    )
    db_session.add(source)
    db_session.flush()
    return agent, source


def _agent_headers(client, db_session, headers):
    agent, source = _setup_agent_and_source(client, db_session, headers)
    return agent, source, {"X-Agent-Key": "raw-key-not-validated-in-service-layer"}


def _ingest(client, agent_id, source_id, event_type, severity, agent_key_hash, db_session):
    """Bypass the HTTP agent-key check by calling the service layer directly."""
    from datetime import UTC, datetime

    from app.models.log import Log

    # We need to ingest via service directly since agent-key auth in tests
    # requires the raw key to match the stored hash — simpler to insert a
    # Log directly and call evaluate_playbooks_for_log manually.
    log = Log(
        org_id=agent_id,  # placeholder — fixed below
        agent_id=agent_id,
        source_id=source_id,
        timestamp=datetime.now(UTC),
        severity=severity,
        event_type=event_type,
        message="test message",
    )
    return log


def test_auto_create_incident_playbook(client, auth_headers, db_session):
    """A matching playbook with auto_create_incident=True creates a real Incident."""
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models.incident import Incident
    from app.services.playbook_service import evaluate_playbooks_for_log

    org_id = _org_id(client, auth_headers)

    # Create the playbook directly via the API.
    _create_playbook(
        client,
        auth_headers,
        name="Auto-create test",
        trigger={"event_type": "playbook-trigger-event"},
        actions={"auto_create_incident": True},
    )

    # Insert a matching log directly (bypassing agent-key auth which needs bcrypt).
    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="playbook-trigger-event",
        message="triggered",
    )
    db_session.add(log)
    db_session.flush()

    # Evaluate playbooks as the ingestion pipeline would.
    import uuid

    evaluate_playbooks_for_log(db_session, uuid.UUID(org_id), log)
    db_session.flush()

    # Confirm an Incident was created.
    inc = db_session.scalar(select(Incident).where(Incident.org_id == org_id))
    assert inc is not None
    assert "Auto-create test" in inc.title


def test_stub_actions_logged(client, auth_headers, db_session, caplog):
    """block_ip/disable_account/slack_notify write [PLAYBOOK ACTION] log lines."""
    import logging
    from datetime import UTC, datetime

    from app.services.playbook_service import evaluate_playbooks_for_log

    org_id = _org_id(client, auth_headers)

    _create_playbook(
        client,
        auth_headers,
        name="Stub test",
        trigger={"event_type": "stub-test-event"},
        actions={"block_ip": True, "disable_account": True, "slack_notify": True},
    )

    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="stub-test-event",
        message="stub test",
    )
    db_session.add(log)
    db_session.flush()

    import uuid

    with caplog.at_level(logging.INFO, logger="app.services.playbook_service"):
        evaluate_playbooks_for_log(db_session, uuid.UUID(org_id), log)

    log_text = caplog.text
    assert "[PLAYBOOK ACTION] block_ip" in log_text
    assert "[PLAYBOOK ACTION] disable_account" in log_text
    assert "[PLAYBOOK ACTION] slack_notify" in log_text


def test_disabled_playbook_not_evaluated(client, auth_headers, db_session, caplog):
    """Disabled playbooks must not fire even if the trigger matches."""
    import logging
    from datetime import UTC, datetime

    from app.services.playbook_service import evaluate_playbooks_for_log

    org_id = _org_id(client, auth_headers)

    _create_playbook(
        client,
        auth_headers,
        name="Disabled PB",
        trigger={"event_type": "disabled-event"},
        actions={"slack_notify": True},
        enabled=False,
    )

    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="disabled-event",
        message="should not fire",
    )
    db_session.add(log)
    db_session.flush()

    import uuid

    with caplog.at_level(logging.INFO, logger="app.services.playbook_service"):
        evaluate_playbooks_for_log(db_session, uuid.UUID(org_id), log)

    assert "[PLAYBOOK ACTION]" not in caplog.text


def test_non_matching_trigger_not_evaluated(client, auth_headers, db_session, caplog):
    """A playbook whose trigger doesn't match the log must not fire."""
    import logging
    from datetime import UTC, datetime

    from app.services.playbook_service import evaluate_playbooks_for_log

    org_id = _org_id(client, auth_headers)

    _create_playbook(
        client,
        auth_headers,
        name="Wrong trigger",
        trigger={"event_type": "very-specific-event"},
        actions={"slack_notify": True},
    )

    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="different-event",
        message="no match",
    )
    db_session.add(log)
    db_session.flush()

    import uuid

    with caplog.at_level(logging.INFO, logger="app.services.playbook_service"):
        evaluate_playbooks_for_log(db_session, uuid.UUID(org_id), log)

    assert "[PLAYBOOK ACTION]" not in caplog.text


def test_cross_org_playbook_not_evaluated(client, auth_headers, second_org_headers, db_session, caplog):
    """Playbooks from org A must not fire when evaluating org B's logs."""
    import logging
    from datetime import UTC, datetime

    from app.services.playbook_service import evaluate_playbooks_for_log

    # Create playbook in org A
    _create_playbook(
        client,
        auth_headers,
        name="Org-A PB",
        trigger={"event_type": "cross-org-event"},
        actions={"slack_notify": True},
    )

    org_b_id = _org_id(client, second_org_headers)
    log = Log(
        org_id=org_b_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="cross-org-event",
        message="org B log",
    )
    db_session.add(log)
    db_session.flush()

    import uuid

    with caplog.at_level(logging.INFO, logger="app.services.playbook_service"):
        evaluate_playbooks_for_log(db_session, uuid.UUID(org_b_id), log)

    assert "[PLAYBOOK ACTION]" not in caplog.text


def test_delete_playbook_does_not_delete_incidents(client, auth_headers, db_session):
    """Deleting a playbook that created incidents must not cascade-delete them."""
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models.incident import Incident
    from app.services.playbook_service import evaluate_playbooks_for_log

    org_id = _org_id(client, auth_headers)
    pb = _create_playbook(
        client,
        auth_headers,
        trigger={"event_type": "detach-test"},
        actions={"auto_create_incident": True},
    )

    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC),
        severity=Severity.HIGH,
        event_type="detach-test",
        message="auto-create this",
    )
    db_session.add(log)
    db_session.flush()

    import uuid

    evaluate_playbooks_for_log(db_session, uuid.UUID(org_id), log)
    db_session.flush()

    # Confirm incident created.
    assert db_session.scalar(select(Incident).where(Incident.org_id == org_id)) is not None

    # Delete the playbook.
    r = client.delete(f"/playbooks/{pb['id']}", headers=auth_headers)
    assert r.status_code == 204

    # Incident must still exist.
    assert db_session.scalar(select(Incident).where(Incident.org_id == org_id)) is not None
