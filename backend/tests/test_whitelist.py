import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.agent import Agent
from app.models.common import Severity
from app.models.log import Log
from app.models.log_source import LogSource
from app.models.whitelist_entry import WhitelistType
from app.services.whitelist_service import exclude_whitelisted


def test_create_list_delete(client, auth_headers):
    created = client.post("/settings/whitelist", json={"type": "ip", "value": "10.0.0.5"}, headers=auth_headers)
    assert created.status_code == 201, created.text
    assert created.json()["is_active"] is True

    listed = client.get("/settings/whitelist", headers=auth_headers)
    assert len(listed.json()) == 1

    deleted = client.delete(f"/settings/whitelist/{created.json()['id']}", headers=auth_headers)
    assert deleted.status_code == 204


def test_duplicate_active_409(client, auth_headers):
    client.post("/settings/whitelist", json={"type": "ip", "value": "10.0.0.5"}, headers=auth_headers)
    dup = client.post("/settings/whitelist", json={"type": "ip", "value": "10.0.0.5"}, headers=auth_headers)
    assert dup.status_code == 409


def test_switching_kind_updates_in_place_instead_of_409(client, auth_headers):
    # Real bug this guards against: allow an indicator, then decide to block
    # it (a normal "I changed my mind" action) -- (org_id, type, value) is
    # unique, so this used to hit the same conflict as a genuine duplicate,
    # with no way to switch short of deleting the old entry first.
    allowed = client.post(
        "/settings/whitelist", json={"type": "ip", "value": "10.0.0.7", "kind": "allow"}, headers=auth_headers
    )
    assert allowed.status_code == 201
    allowed_id = allowed.json()["id"]

    switched = client.post(
        "/settings/whitelist", json={"type": "ip", "value": "10.0.0.7", "kind": "block"}, headers=auth_headers
    )
    assert switched.status_code == 201, switched.text
    assert switched.json()["kind"] == "block"
    assert switched.json()["id"] == allowed_id  # same row, updated in place -- not a second entry

    listed = client.get("/settings/whitelist", headers=auth_headers)
    assert len(listed.json()) == 1


def test_invalid_ip_rejected_422(client, auth_headers):
    response = client.post("/settings/whitelist", json={"type": "ip", "value": "not-an-ip"}, headers=auth_headers)
    assert response.status_code == 422


def test_expired_excluded_from_effective_and_not_active(client, auth_headers):
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    expired = client.post(
        "/settings/whitelist", json={"type": "ip", "value": "10.0.0.9", "expires_at": past}, headers=auth_headers
    )
    assert expired.json()["is_active"] is False
    client.post("/settings/whitelist", json={"type": "ip", "value": "10.0.0.5"}, headers=auth_headers)

    response = client.get("/settings/whitelist/effective?type=ip", headers=auth_headers)
    assert response.json()["values"] == ["10.0.0.5"]


def test_cross_org_404(client, auth_headers, second_org_headers):
    created = client.post("/settings/whitelist", json={"type": "ip", "value": "10.0.0.5"}, headers=auth_headers)
    response = client.delete(f"/settings/whitelist/{created.json()['id']}", headers=second_org_headers)
    assert response.status_code == 404


def test_query_layer_exclusion_over_real_logs(client, auth_headers, db_session):
    org_id = uuid.UUID(client.get("/auth/me", headers=auth_headers).json()["org"]["id"])

    agent = Agent(org_id=org_id, name="a", platform="linux", agent_key_hash="x", status="pending")
    db_session.add(agent)
    db_session.flush()

    source = LogSource(org_id=org_id, agent_id=agent.id, name="s", type="local", status="active")
    db_session.add(source)
    db_session.flush()

    # Active entry excludes 10.0.0.5; expired entry does not exclude 10.0.0.9.
    client.post("/settings/whitelist", json={"type": "ip", "value": "10.0.0.5"}, headers=auth_headers)
    client.post(
        "/settings/whitelist",
        json={"type": "ip", "value": "10.0.0.9", "expires_at": (datetime.now(UTC) - timedelta(days=1)).isoformat()},
        headers=auth_headers,
    )

    for ip in ("10.0.0.5", "10.0.0.9", "10.0.0.7"):
        db_session.add(
            Log(
                org_id=org_id,
                source_id=source.id,
                agent_id=agent.id,
                timestamp=datetime.now(UTC),
                severity=Severity.OK,
                event_type="test",
                message="m",
                raw={"src_ip": ip},
            )
        )
    db_session.flush()

    stmt = exclude_whitelisted(select(Log), Log.raw["src_ip"].astext, org_id, WhitelistType.IP)
    remaining_ips = {row.raw["src_ip"] for row in db_session.scalars(stmt).all()}

    assert remaining_ips == {"10.0.0.9", "10.0.0.7"}
