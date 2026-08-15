import uuid
from datetime import UTC, datetime, timedelta

from app.models.agent import Agent
from app.routes import agents as agents_routes


def _create_agent(client, auth_headers, name="dc-01", platform="windows"):
    response = client.post("/agents", json={"name": name, "platform": platform}, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_requires_auth(client):
    response = client.post("/agents", json={"name": "x", "platform": "windows"})
    assert response.status_code == 401


def test_create_returns_key_and_stays_visible_while_pending(client, auth_headers):
    created = _create_agent(client, auth_headers)
    assert created["agent"]["status"] == "pending"
    assert created["enrollment_key"].startswith("tpa_")

    # Re-fetching (e.g. after closing the "deploy an agent" panel) still
    # returns the same key while enrollment is pending and unexpired — no
    # more one-shot "you only see it once".
    get_resp = client.get(f"/agents/{created['agent']['id']}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["enrollment_key"] == created["enrollment_key"]

    list_resp = client.get("/agents", headers=auth_headers)
    assert list_resp.json()[0]["enrollment_key"] == created["enrollment_key"]


def test_enrollment_key_hidden_after_connect(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    client.post(f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": key})

    get_resp = client.get(f"/agents/{agent_id}", headers=auth_headers)
    assert get_resp.json()["status"] == "connected"
    assert get_resp.json()["enrollment_key"] is None


def test_enrollment_key_hidden_after_expiry(client, auth_headers, db_session):
    created = _create_agent(client, auth_headers)
    agent_id = created["agent"]["id"]

    agent = db_session.get(Agent, uuid.UUID(agent_id))
    agent.enrollment_expires_at = datetime.now(UTC) - timedelta(hours=1)
    db_session.flush()

    get_resp = client.get(f"/agents/{agent_id}", headers=auth_headers)
    assert get_resp.json()["status"] == "pending"
    assert get_resp.json()["enrollment_key"] is None

    # Lazily wiped server-side too, not just gated in the response.
    db_session.expire_all()
    assert db_session.get(Agent, uuid.UUID(agent_id)).agent_key_encrypted is None


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


def test_delete_agent_detaches_logs(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]

    source = client.post(
        "/logs/sources",
        json={"name": "s", "type": "local", "agent_id": agent_id, "path": "Security"},
        headers=auth_headers,
    ).json()
    client.post(f"/agents/{agent_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": key})
    ingest = client.post(
        f"/agents/{agent_id}/logs",
        json={
            "logs": [
                {
                    "source_id": source["id"],
                    "timestamp": datetime.now(UTC).isoformat(),
                    "severity": "ok",
                    "event_type": "test",
                    "message": "m",
                    "raw": {},
                }
            ]
        },
        headers={"X-Agent-Key": key},
    )
    assert ingest.status_code == 200, ingest.text

    delete = client.delete(f"/agents/{agent_id}", headers=auth_headers)
    assert delete.status_code == 204

    logs = client.get("/logs", headers=auth_headers).json()
    assert logs["total"] == 1
    assert logs["items"][0]["agent_id"] is None


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

    # The re-displayable copy is rotated along with the hash used for auth.
    get_resp = client.get(f"/agents/{agent_id}", headers=auth_headers)
    assert get_resp.json()["enrollment_key"] == new_key

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


def test_report_source_status_ok_and_error(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    source = client.post(
        "/logs/sources",
        json={"name": "s", "type": "local", "agent_id": agent_id, "path": "Security"},
        headers=auth_headers,
    ).json()
    assert source["last_status"] is None
    assert source["last_collected_at"] is None

    report = client.post(
        f"/agents/{agent_id}/sources/status",
        json={"results": [{"source_id": source["id"], "status": "error", "reason": "Access is denied."}]},
        headers={"X-Agent-Key": key},
    )
    assert report.status_code == 200, report.text
    assert report.json()["updated"] == 1

    after = client.get(f"/logs/sources/{source['id']}", headers=auth_headers).json()
    assert after["last_status"] == "error"
    assert after["last_status_reason"] == "Access is denied."
    assert after["last_collected_at"] is not None

    report_ok = client.post(
        f"/agents/{agent_id}/sources/status",
        json={"results": [{"source_id": source["id"], "status": "ok"}]},
        headers={"X-Agent-Key": key},
    )
    assert report_ok.status_code == 200, report_ok.text
    after_ok = client.get(f"/logs/sources/{source['id']}", headers=auth_headers).json()
    assert after_ok["last_status"] == "ok"
    assert after_ok["last_status_reason"] is None  # cleared once it recovers


def test_report_source_status_rejects_unowned_source(client, auth_headers):
    created = _create_agent(client, auth_headers)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    other_agent = _create_agent(client, auth_headers, name="dc-02")
    other_source = client.post(
        "/logs/sources",
        json={"name": "s", "type": "local", "agent_id": other_agent["agent"]["id"], "path": "System"},
        headers=auth_headers,
    ).json()

    response = client.post(
        f"/agents/{agent_id}/sources/status",
        json={"results": [{"source_id": other_source["id"], "status": "ok"}]},
        headers={"X-Agent-Key": key},
    )
    assert response.status_code == 422


def test_download_windows_installer_404_when_not_built(client, monkeypatch, tmp_path):
    monkeypatch.setattr(agents_routes, "AGENT_BINARY_DIR", tmp_path)
    response = client.get("/agents/download/windows-installer")
    assert response.status_code == 404


def test_download_windows_installer_serves_binary_when_built(client, monkeypatch, tmp_path):
    monkeypatch.setattr(agents_routes, "AGENT_BINARY_DIR", tmp_path)
    (tmp_path / "truepositive-agent-setup.exe").write_bytes(b"fake-installer-bytes")

    response = client.get("/agents/download/windows-installer")
    assert response.status_code == 200
    assert response.content == b"fake-installer-bytes"
    assert response.headers["content-disposition"] == 'attachment; filename="truepositive-agent-setup.exe"'
