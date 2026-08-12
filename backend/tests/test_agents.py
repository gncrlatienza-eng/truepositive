import uuid
from datetime import UTC, datetime, timedelta

from app.models.agent import Agent


def _create_agent(client, auth_headers, name="dc-01", platform="windows"):
    response = client.post("/agents", json={"name": name, "platform": platform}, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_requires_auth(client):
    response = client.post("/agents", json={"name": "x", "platform": "windows"})
    assert response.status_code == 401


def test_create_returns_key_once_and_pending(client, auth_headers):
    created = _create_agent(client, auth_headers)
    assert created["agent"]["status"] == "pending"
    assert created["enrollment_key"].startswith("tpa_")

    get_resp = client.get(f"/agents/{created['agent']['id']}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert "enrollment_key" not in get_resp.json()


def test_register_wrong_key_401(client, auth_headers):
    created = _create_agent(client, auth_headers)
    response = client.post(
        f"/agents/{created['agent']['id']}/register",
        json={"hostname": "h"},
        headers={"X-Agent-Key": "tpa_wrong"},
    )
    assert response.status_code == 401


def test_register_missing_key_401(client, auth_headers):
    created = _create_agent(client, auth_headers)
    response = client.post(f"/agents/{created['agent']['id']}/register", json={"hostname": "h"})
    assert response.status_code == 401


def test_register_and_heartbeat(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]

    reg = client.post(f"/agents/{agent_id}/register", json={"hostname": "DC-01"}, headers={"X-Agent-Key": key})
    assert reg.status_code == 200
    assert reg.json()["status"] == "connected"
    assert reg.json()["hostname"] == "DC-01"

    beat = client.post(f"/agents/{agent_id}/heartbeat", headers={"X-Agent-Key": key})
    assert beat.status_code == 200
    assert beat.json()["status"] == "connected"


def test_register_after_expiry_410(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]

    agent = db_session.get(Agent, uuid.UUID(agent_id))
    agent.enrollment_expires_at = datetime.now(UTC) - timedelta(hours=1)
    db_session.flush()

    response = client.post(f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": key})
    assert response.status_code == 410


def test_stale_agent_flips_disconnected_on_read(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    client.post(f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": key})

    agent = db_session.get(Agent, uuid.UUID(agent_id))
    agent.last_seen_at = datetime.now(UTC) - timedelta(seconds=200)
    db_session.flush()

    response = client.get(f"/agents/{agent_id}", headers=auth_headers)
    assert response.json()["status"] == "disconnected"


def test_heartbeat_after_staleness_restores_connected(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    client.post(f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": key})

    agent = db_session.get(Agent, uuid.UUID(agent_id))
    agent.last_seen_at = datetime.now(UTC) - timedelta(seconds=200)
    db_session.flush()

    beat = client.post(f"/agents/{agent_id}/heartbeat", headers={"X-Agent-Key": key})
    assert beat.status_code == 200
    assert beat.json()["status"] == "connected"


def test_cross_org_agent_404(client, auth_headers, second_org_headers):
    created = _create_agent(client, auth_headers)
    response = client.get(f"/agents/{created['agent']['id']}", headers=second_org_headers)
    assert response.status_code == 404


def test_delete_agent_then_404(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id = created["agent"]["id"]

    delete = client.delete(f"/agents/{agent_id}", headers=auth_headers)
    assert delete.status_code == 204

    get_after = client.get(f"/agents/{agent_id}", headers=auth_headers)
    assert get_after.status_code == 404


def test_delete_agent_detaches_log_sources(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id = created["agent"]["id"]

    source = client.post(
        "/logs/sources", json={"name": "s", "type": "local", "agent_id": agent_id}, headers=auth_headers
    ).json()
    assert source["agent_id"] == agent_id

    delete = client.delete(f"/agents/{agent_id}", headers=auth_headers)
    assert delete.status_code == 204

    source_after = client.get(f"/logs/sources/{source['id']}", headers=auth_headers).json()
    assert source_after["agent_id"] is None


def test_cross_org_delete_agent_404(client, auth_headers, second_org_headers):
    created = _create_agent(client, auth_headers)
    response = client.delete(f"/agents/{created['agent']['id']}", headers=second_org_headers)
    assert response.status_code == 404


def test_reregister_same_key_reconnects_disconnected_agent(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    client.post(f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": key})

    agent = db_session.get(Agent, uuid.UUID(agent_id))
    agent.last_seen_at = datetime.now(UTC) - timedelta(seconds=200)
    db_session.flush()
    assert client.get(f"/agents/{agent_id}", headers=auth_headers).json()["status"] == "disconnected"

    # Re-running the same already-downloaded agent (same key) should just
    # reconnect it — no rotation needed if you still have the file.
    reregister = client.post(f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": key})
    assert reregister.status_code == 200
    assert reregister.json()["status"] == "connected"


def test_rotate_key_invalidates_old_and_issues_new(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, old_key = created["agent"]["id"], created["enrollment_key"]

    rotated = client.post(f"/agents/{agent_id}/rotate-key", headers=auth_headers)
    assert rotated.status_code == 200, rotated.text
    new_key = rotated.json()["enrollment_key"]
    assert new_key != old_key

    old_key_attempt = client.post(
        f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": old_key}
    )
    assert old_key_attempt.status_code == 401

    new_key_attempt = client.post(
        f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": new_key}
    )
    assert new_key_attempt.status_code == 200
    assert new_key_attempt.json()["status"] == "connected"


def test_cross_org_rotate_key_404(client, auth_headers, second_org_headers):
    created = _create_agent(client, auth_headers)
    response = client.post(f"/agents/{created['agent']['id']}/rotate-key", headers=second_org_headers)
    assert response.status_code == 404
