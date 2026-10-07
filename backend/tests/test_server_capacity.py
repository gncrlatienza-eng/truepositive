"""Tests for the server-wide MAX_AGENTS cap (agent_service.ensure_capacity).

The cap counts agents across every org in the database, including whatever
the dev database already holds, so each test sets it relative to the current
count instead of assuming an empty table.
"""

from datetime import UTC, datetime, timedelta

from app.config import settings
from app.models.agent import Agent
from app.services import agent_service


def _signup_payload(email: str, slug: str) -> dict:
    return {
        "full_name": "Capacity Test",
        "email": email,
        "password": "TestPass123",
        "org_name": "Capacity Org",
        "team_size": "1-5",
        "workspace_slug": slug,
        "agree_terms": True,
    }


def _create_agent(client, auth_headers, name="cap-agent"):
    return client.post("/agents", json={"name": name, "platform": "windows"}, headers=auth_headers)


def test_no_cap_by_default(client, auth_headers):
    assert settings.max_agents is None
    assert _create_agent(client, auth_headers).status_code == 201


def test_rejects_new_agent_once_full(client, auth_headers, db_session, monkeypatch):
    monkeypatch.setattr(settings, "max_agents", agent_service.agents_in_use(db_session) + 1)

    assert _create_agent(client, auth_headers, "last-slot").status_code == 201
    full = _create_agent(client, auth_headers, "one-too-many")
    assert full.status_code == 503
    assert full.json()["detail"] == agent_service.SERVER_FULL_DETAIL


def test_expired_pending_agent_frees_its_slot(client, auth_headers, db_session, monkeypatch):
    created = _create_agent(client, auth_headers, "abandoned").json()
    monkeypatch.setattr(settings, "max_agents", agent_service.agents_in_use(db_session))
    assert _create_agent(client, auth_headers, "blocked").status_code == 503

    abandoned = db_session.get(Agent, created["agent"]["id"])
    abandoned.enrollment_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.flush()

    assert _create_agent(client, auth_headers, "takes-the-freed-slot").status_code == 201


def test_signup_rejected_when_full(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "max_agents", agent_service.agents_in_use(db_session))
    r = client.post("/auth/signup", json=_signup_payload("full-server@example.com", "full-server-slug"))
    assert r.status_code == 503
    assert r.json()["detail"] == agent_service.SERVER_FULL_DETAIL
