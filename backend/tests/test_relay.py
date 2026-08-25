import uuid
from datetime import UTC, datetime

from app.models.agent import Agent
from app.services import relay_service


def _create_agent(client, auth_headers, name="dc-01", platform="windows"):
    response = client.post("/agents", json={"name": name, "platform": platform}, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _make_hub(client, auth_headers, name="hub-01"):
    """Creates a normal agent, registers it, and marks it primary — the
    Phase 1 precondition for it to be allowed to host relay children."""
    created = _create_agent(client, auth_headers, name=name)
    agent_id, key = created["agent"]["id"], created["enrollment_key"]
    client.post(f"/agents/{agent_id}/register", json={"hostname": name}, headers={"X-Agent-Key": key})
    primary = client.post(f"/agents/{agent_id}/primary", headers=auth_headers)
    assert primary.status_code == 200
    return agent_id, key


def _create_relay_child(client, auth_headers, hub_id, name="child-01", platform="windows"):
    response = client.post(
        "/agents/relay-children",
        json={"hub_agent_id": hub_id, "name": name, "platform": platform},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_relay_child_requires_primary_hub(client, auth_headers):
    not_hub = _create_agent(client, auth_headers)
    response = client.post(
        "/agents/relay-children",
        json={"hub_agent_id": not_hub["agent"]["id"], "name": "child", "platform": "windows"},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_create_relay_child_hub_not_found_404(client, auth_headers):
    response = client.post(
        "/agents/relay-children",
        json={"hub_agent_id": str(uuid.uuid4()), "name": "child", "platform": "windows"},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_create_relay_child_rejects_past_the_cap(client, auth_headers):
    # MAX_RELAY_CHILDREN_PER_HUB (relay_service.py) — a soft product ceiling
    # for this app's real use case (a household's devices), well under the
    # hub's own rate-limit-driven technical ceiling.
    hub_id, _ = _make_hub(client, auth_headers)
    for i in range(relay_service.MAX_RELAY_CHILDREN_PER_HUB):
        _create_relay_child(client, auth_headers, hub_id, name=f"child-{i}")

    over = client.post(
        "/agents/relay-children",
        json={"hub_agent_id": hub_id, "name": "one-too-many", "platform": "windows"},
        headers=auth_headers,
    )
    assert over.status_code == 409, over.text


def test_create_relay_child_success_and_marks_relay_parent(client, auth_headers):
    hub_id, _ = _make_hub(client, auth_headers)
    created = _create_relay_child(client, auth_headers, hub_id)
    assert created["agent"]["relay_parent_agent_id"] == hub_id
    assert created["agent"]["is_relay_child"] is True
    assert created["agent"]["status"] == "pending"
    # No hub heartbeat with an address has happened yet in this test.
    assert created["hub_relay_addr"] is None


def test_hub_heartbeat_relay_addr_surfaces_on_next_deploy(client, auth_headers):
    hub_id, hub_key = _make_hub(client, auth_headers)
    beat = client.post(
        f"/agents/{hub_id}/heartbeat",
        json={"relay_listen_addr": "192.168.1.42:47824"},
        headers={"X-Agent-Key": hub_key},
    )
    assert beat.status_code == 200

    created = _create_relay_child(client, auth_headers, hub_id)
    assert created["hub_relay_addr"] == "192.168.1.42:47824"


def test_relay_proxy_register_heartbeat_and_logs_preserve_child_identity(client, auth_headers):
    hub_id, hub_key = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)
    child_id, child_key = child["agent"]["id"], child["enrollment_key"]

    register = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={"child_id": child_id, "key": child_key, "kind": "register", "hostname": "family-laptop"},
        headers={"X-Agent-Key": hub_key},
    )
    assert register.status_code == 200, register.text
    assert register.json()["heartbeat"]["status"] == "connected"

    # register_agent nulls the re-displayable key once connected, exactly
    # like a direct-connect agent — confirms the relay path reuses that same
    # real logic rather than a parallel implementation with different rules.
    get_after_register = client.get(f"/agents/{child_id}", headers=auth_headers)
    assert get_after_register.json()["enrollment_key"] is None

    source = client.post(
        "/logs/sources",
        json={"name": "s", "type": "local", "agent_id": child_id, "path": "Security"},
        headers=auth_headers,
    ).json()

    ingest = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={
            "child_id": child_id,
            "key": child_key,
            "kind": "logs",
            "logs": [
                {
                    "source_id": source["id"],
                    "timestamp": datetime.now(UTC).isoformat(),
                    "severity": "ok",
                    "event_type": "test",
                    "message": "relayed",
                    "raw": {},
                }
            ],
        },
        headers={"X-Agent-Key": hub_key},
    )
    assert ingest.status_code == 200, ingest.text
    assert ingest.json()["logs"]["ingested"] == 1

    # The identity-preservation guarantee itself: the log is attributed to
    # the child that produced it, never to the hub that relayed it.
    logs = client.get("/logs", headers=auth_headers).json()
    assert logs["total"] == 1
    assert logs["items"][0]["agent_id"] == child_id
    assert logs["items"][0]["agent_id"] != hub_id

    heartbeat = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={"child_id": child_id, "key": child_key, "kind": "heartbeat"},
        headers={"X-Agent-Key": hub_key},
    )
    assert heartbeat.status_code == 200
    assert heartbeat.json()["heartbeat"]["id"] == child_id

    sources = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={"child_id": child_id, "key": child_key, "kind": "sources"},
        headers={"X-Agent-Key": hub_key},
    )
    assert sources.status_code == 200
    assert [s["id"] for s in sources.json()["sources"]] == [source["id"]]

    # Full isolation means source-health reporting relays too, not just logs.
    status_report = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={
            "child_id": child_id,
            "key": child_key,
            "kind": "source_status",
            "source_status_results": [{"source_id": source["id"], "status": "ok"}],
        },
        headers={"X-Agent-Key": hub_key},
    )
    assert status_report.status_code == 200, status_report.text
    assert status_report.json()["source_status"]["updated"] == 1
    source_after = client.get(f"/logs/sources/{source['id']}", headers=auth_headers).json()
    assert source_after["last_status"] == "ok"


def test_relay_proxy_logs_requires_logs_field(client, auth_headers):
    hub_id, hub_key = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)

    response = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={"child_id": child["agent"]["id"], "key": child["enrollment_key"], "kind": "logs"},
        headers={"X-Agent-Key": hub_key},
    )
    assert response.status_code == 422


def test_relay_proxy_requires_key_field(client, auth_headers):
    # Pydantic-level validation — `key` is a required field on RelayProxyRequest.
    hub_id, hub_key = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)

    response = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={"child_id": child["agent"]["id"], "kind": "heartbeat"},
        headers={"X-Agent-Key": hub_key},
    )
    assert response.status_code == 422


def test_relay_proxy_rejects_wrong_child_key(client, auth_headers):
    # The real fix for the security review's finding: hub ownership of a
    # child_id must not be treated as authorization to act as *any* child —
    # the child's own key has to actually verify against its agent_key_hash.
    hub_id, hub_key = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)

    response = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={"child_id": child["agent"]["id"], "key": "tpa_totally-wrong-key", "kind": "heartbeat"},
        headers={"X-Agent-Key": hub_key},
    )
    assert response.status_code == 401


def test_relay_child_key_cannot_authenticate_direct_connect_endpoints(client, auth_headers):
    # The other half of the fix: a relay child's real key must not work on
    # the direct-connect endpoints at all (its only legitimate path in is
    # via its hub's relay-proxy call) — this is what makes a leaked relay
    # child key (e.g. sniffed off the hub's cleartext LAN listener) useless
    # against the internet-facing backend.
    hub_id, _ = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)
    child_id, child_key = child["agent"]["id"], child["enrollment_key"]

    register = client.post(f"/agents/{child_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": child_key})
    assert register.status_code == 401

    heartbeat = client.post(f"/agents/{child_id}/heartbeat", headers={"X-Agent-Key": child_key})
    assert heartbeat.status_code == 401


def test_relay_proxy_rejects_non_hub_caller(client, auth_headers):
    other = _create_agent(client, auth_headers, name="not-a-hub")
    other_id, other_key = other["agent"]["id"], other["enrollment_key"]
    client.post(f"/agents/{other_id}/register", json={"hostname": "h"}, headers={"X-Agent-Key": other_key})

    response = client.post(
        f"/agents/{other_id}/relay-proxy",
        json={"child_id": str(uuid.uuid4()), "key": "irrelevant", "kind": "heartbeat"},
        headers={"X-Agent-Key": other_key},
    )
    assert response.status_code == 403


def test_relay_proxy_rejects_child_belonging_to_different_hub(client, auth_headers, second_org_headers):
    hub_id, _ = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)

    other_hub_id, other_hub_key = _make_hub(client, second_org_headers, name="other-hub")
    response = client.post(
        f"/agents/{other_hub_id}/relay-proxy",
        json={"child_id": child["agent"]["id"], "key": child["enrollment_key"], "kind": "heartbeat"},
        headers={"X-Agent-Key": other_hub_key},
    )
    assert response.status_code == 404


def test_relay_no_chaining_rejected(client, auth_headers):
    hub_id, _ = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)
    child_id = child["agent"]["id"]

    # Marking the child primary doesn't grant it hub powers — it's still a
    # relay child of the original hub, so it must be rejected as a chain.
    set_primary = client.post(f"/agents/{child_id}/primary", headers=auth_headers)
    assert set_primary.status_code == 200

    response = client.post(
        "/agents/relay-children",
        json={"hub_agent_id": child_id, "name": "grandchild", "platform": "windows"},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_relay_proxy_rejects_child_awaiting_approval(client, auth_headers, db_session):
    hub_id, hub_key = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)
    child_id, child_key = child["agent"]["id"], child["enrollment_key"]

    agent = db_session.get(Agent, uuid.UUID(child_id))
    agent.awaiting_relay_approval = True
    db_session.flush()

    response = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={"child_id": child_id, "key": child_key, "kind": "heartbeat"},
        headers={"X-Agent-Key": hub_key},
    )
    assert response.status_code == 403


def test_relay_proxy_rate_limited_after_threshold(client, auth_headers, monkeypatch):
    # bcrypt (checked twice per call here -- the hub's own key via
    # get_current_agent's app.utils.security.verify_password, plus the
    # child's key via relay_service's own verify_password import, see the
    # security fix above) is deliberately slow -- 120 real sequential calls
    # at real bcrypt cost don't reliably land inside the limiter's 60s
    # window on slower CI/dev hardware, which isn't what this test is
    # actually about (the wrong/valid-key and direct-connect-block checks
    # have their own dedicated tests above). Stub out both verify_password
    # call sites -- they're two separate module-level imports, so patching
    # only one still leaves a real bcrypt cost on every request -- so this
    # test stays focused on the rate limiter itself.
    monkeypatch.setattr("app.services.relay_service.verify_password", lambda *_a, **_kw: True)
    monkeypatch.setattr("app.utils.security.verify_password", lambda *_a, **_kw: True)

    hub_id, hub_key = _make_hub(client, auth_headers)
    child = _create_relay_child(client, auth_headers, hub_id)
    child_id, child_key = child["agent"]["id"], child["enrollment_key"]

    for _ in range(120):
        r = client.post(
            f"/agents/{hub_id}/relay-proxy",
            json={"child_id": child_id, "key": child_key, "kind": "heartbeat"},
            headers={"X-Agent-Key": hub_key},
        )
        assert r.status_code == 200, r.text
    over = client.post(
        f"/agents/{hub_id}/relay-proxy",
        json={"child_id": child_id, "key": child_key, "kind": "heartbeat"},
        headers={"X-Agent-Key": hub_key},
    )
    assert over.status_code == 429
