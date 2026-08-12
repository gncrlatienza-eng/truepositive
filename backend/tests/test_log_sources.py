import uuid

from app.models.log_source import LogSource
from app.utils.crypto import decrypt_secret


def _remote_payload(**overrides):
    payload = {
        "name": "jump-box",
        "type": "remote",
        "protocol": "ssh",
        "host": "10.0.4.22",
        "port": 22,
        "username": "svc",
        "credential_type": "ssh_key",
        "credential": "SUPERSECRET",
    }
    payload.update(overrides)
    return payload


def test_create_local_source(client, auth_headers):
    response = client.post(
        "/logs/sources",
        json={"name": "Sysmon", "type": "local", "path": "Microsoft-Windows-Sysmon/Operational"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["has_credential"] is False


def test_create_remote_ssh_encrypts_credential(client, auth_headers, db_session):
    response = client.post("/logs/sources", json=_remote_payload(), headers=auth_headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert "credential" not in body
    assert "credential_encrypted" not in body
    assert body["has_credential"] is True

    source = db_session.get(LogSource, uuid.UUID(body["id"]))
    assert source.credential_encrypted != "SUPERSECRET"
    assert decrypt_secret(source.credential_encrypted) == "SUPERSECRET"


def test_winrm_rejected_422(client, auth_headers):
    response = client.post("/logs/sources", json=_remote_payload(protocol="winrm"), headers=auth_headers)
    assert response.status_code == 422


def test_kerberos_rejected_422(client, auth_headers):
    response = client.post("/logs/sources", json=_remote_payload(credential_type="kerberos"), headers=auth_headers)
    assert response.status_code == 422


def test_remote_without_credential_422(client, auth_headers):
    response = client.post(
        "/logs/sources",
        json={"name": "bad", "type": "remote", "protocol": "ssh", "host": "10.0.4.22"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_local_with_host_rejected_422(client, auth_headers):
    response = client.post(
        "/logs/sources",
        json={"name": "bad", "type": "local", "host": "10.0.4.22"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_list_is_org_scoped(client, auth_headers, second_org_headers):
    client.post("/logs/sources", json={"name": "mine", "type": "local"}, headers=auth_headers)
    response = client.get("/logs/sources", headers=second_org_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_pause_resume(client, auth_headers):
    created = client.post("/logs/sources", json={"name": "s", "type": "local"}, headers=auth_headers).json()
    paused = client.patch(f"/logs/sources/{created['id']}", json={"status": "paused"}, headers=auth_headers)
    assert paused.json()["status"] == "paused"
    resumed = client.patch(f"/logs/sources/{created['id']}", json={"status": "active"}, headers=auth_headers)
    assert resumed.json()["status"] == "active"


def test_credential_rotation_changes_ciphertext(client, auth_headers, db_session):
    created = client.post("/logs/sources", json=_remote_payload(credential="first-secret"), headers=auth_headers).json()
    source = db_session.get(LogSource, uuid.UUID(created["id"]))
    first_ciphertext = source.credential_encrypted

    client.patch(f"/logs/sources/{created['id']}", json={"credential": "second-secret"}, headers=auth_headers)
    db_session.refresh(source)
    assert source.credential_encrypted != first_ciphertext
    assert decrypt_secret(source.credential_encrypted) == "second-secret"


def test_delete_then_404(client, auth_headers):
    created = client.post("/logs/sources", json={"name": "s", "type": "local"}, headers=auth_headers).json()
    delete = client.delete(f"/logs/sources/{created['id']}", headers=auth_headers)
    assert delete.status_code == 204
    get_after = client.get(f"/logs/sources/{created['id']}", headers=auth_headers)
    assert get_after.status_code == 404


def test_cross_org_404(client, auth_headers, second_org_headers):
    created = client.post("/logs/sources", json={"name": "s", "type": "local"}, headers=auth_headers).json()
    response = client.get(f"/logs/sources/{created['id']}", headers=second_org_headers)
    assert response.status_code == 404
