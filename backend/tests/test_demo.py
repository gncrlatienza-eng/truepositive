"""The public read-only demo workspace (POST /auth/demo)."""

from app.config import settings
from app.services import agent_service


def _demo_headers(client):
    response = client.post("/auth/demo")
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}, response.json()


def test_demo_is_off_by_default(client):
    assert settings.demo_enabled is False
    assert client.post("/auth/demo").status_code == 404


def test_demo_login_creates_workspace_with_sample_data(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_enabled", True)
    headers, body = _demo_headers(client)

    assert body["user"]["is_demo"] is True
    assert body["org"]["slug"] == "demo"
    assert client.get("/logs", headers=headers).json()["total"] > 0
    assert client.get("/alerts", headers=headers).json()["total"] > 0

    # A second visitor reuses the same workspace instead of creating another.
    _headers2, body2 = _demo_headers(client)
    assert body2["org"]["id"] == body["org"]["id"]


def test_demo_account_is_read_only(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_enabled", True)
    headers, _body = _demo_headers(client)

    assert client.get("/auth/me", headers=headers).status_code == 200
    blocked = client.post(
        "/playbooks",
        json={"name": "x", "trigger": {"event_type": "e"}, "actions": {}, "enabled": True},
        headers=headers,
    )
    assert blocked.status_code == 403
    assert "read-only" in blocked.json()["detail"]
    assert client.post("/agents", json={"name": "pc", "platform": "windows"}, headers=headers).status_code == 403


def test_real_accounts_are_not_read_only(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "demo_enabled", True)
    _demo_headers(client)
    response = client.post("/agents", json={"name": "pc", "platform": "windows"}, headers=auth_headers)
    assert response.status_code == 201, response.text


def test_demo_devices_do_not_use_server_capacity(client, auth_headers, db_session, monkeypatch):
    before = agent_service.agents_in_use(db_session)
    monkeypatch.setattr(settings, "demo_enabled", True)
    _demo_headers(client)  # seeds 3 sample devices into the demo org

    assert agent_service.agents_in_use(db_session) == before
    monkeypatch.setattr(settings, "max_agents", before + 1)
    response = client.post("/agents", json={"name": "pc", "platform": "windows"}, headers=auth_headers)
    assert response.status_code == 201, response.text


def test_signup_cannot_take_the_demo_workspace_slug(client):
    response = client.post(
        "/auth/signup",
        json={
            "full_name": "Someone",
            "email": "someone@example.com",
            "password": "TestPass123",
            "org_name": "Mine",
            "team_size": "1-5 analysts",
            "workspace_slug": "demo",
            "agree_terms": True,
        },
    )
    assert response.status_code == 409


def test_pulse_keeps_sample_devices_online(client, auth_headers, db_session):
    import uuid
    from datetime import UTC, datetime, timedelta

    from app.models.agent import Agent
    from app.models.log import Log
    from app.services.sample_data import ONLINE_AGENT_NAMES, pulse_sample_agents, seed_sample_data

    org_id = uuid.UUID(client.get("/auth/me", headers=auth_headers).json()["org"]["id"])
    seed_sample_data(db_session, org_id, days_back=2)
    agents = db_session.query(Agent).filter(Agent.org_id == org_id).all()
    for agent in agents:
        agent.last_seen_at = datetime.now(UTC) - timedelta(minutes=10)
    db_session.flush()
    logs_before = db_session.query(Log).filter(Log.org_id == org_id).count()

    added = pulse_sample_agents(db_session, org_id)

    assert added >= 1
    assert db_session.query(Log).filter(Log.org_id == org_id).count() == logs_before + added
    db_session.flush()

    # What the dashboard shows: 2 of the 3 sample devices online, events flowing.
    banner = client.get("/dashboard/summary", headers=auth_headers).json()["banner"]
    assert (banner["agents_online"], banner["agents_total"]) == (2, 3)
    assert banner["events_flowing"] is True
    offline = [a for a in agents if a.name not in ONLINE_AGENT_NAMES]
    assert len(offline) == 1 and offline[0].last_seen_at < datetime.now(UTC) - timedelta(minutes=5)
