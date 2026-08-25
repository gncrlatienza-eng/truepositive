"""Tests for auth rate limiting and the optional signup invite-code gate.

Rate limiting: Login/signup previously had no throttle at all -- unlimited
credential-stuffing against real accounts, unlimited automated org-creation
spam. Both are keyed per client IP; Starlette's TestClient sends every
request from the same pseudo-host, which is exactly what makes these tests
possible without faking network identity.

Invite gate: unset by default (dev/local signup stays open) -- only enforced
once settings.signup_invite_code is set, e.g. for a public deployment.
"""

from app.config import settings


def _signup_payload(email: str, slug: str) -> dict:
    return {
        "full_name": "Rate Limit Test",
        "email": email,
        "password": "TestPass123",
        "org_name": "Rate Limit Org",
        "team_size": "1-5",
        "workspace_slug": slug,
        "agree_terms": True,
    }


def test_login_rate_limited_after_threshold(client):
    for _ in range(10):
        r = client.post("/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"})
        assert r.status_code == 401
    over = client.post("/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"})
    assert over.status_code == 429
    assert "retry-after" in over.headers


def test_signup_rate_limited_after_threshold(client):
    for i in range(5):
        r = client.post("/auth/signup", json=_signup_payload(f"rl{i}@example.com", f"rl-slug-{i}"))
        assert r.status_code == 201, r.text
    over = client.post("/auth/signup", json=_signup_payload("rl-over@example.com", "rl-slug-over"))
    assert over.status_code == 429
    assert "retry-after" in over.headers


def test_signup_open_by_default_no_invite_code(client):
    assert settings.signup_invite_code is None
    payload = _signup_payload("open-signup@example.com", "open-signup-slug")
    r = client.post("/auth/signup", json=payload)
    assert r.status_code == 201, r.text


def test_signup_rejects_wrong_invite_code_once_required(client, monkeypatch):
    monkeypatch.setattr(settings, "signup_invite_code", "family2026")
    payload = _signup_payload("gated-wrong@example.com", "gated-wrong-slug")
    payload["invite_code"] = "not-the-code"
    r = client.post("/auth/signup", json=payload)
    assert r.status_code == 403

    # Rejected before any account was created -- confirmed by the correct
    # code succeeding against the exact same email/slug right after.
    payload["invite_code"] = "family2026"
    r = client.post("/auth/signup", json=payload)
    assert r.status_code == 201, r.text


def test_signup_rejects_missing_invite_code_once_required(client, monkeypatch):
    monkeypatch.setattr(settings, "signup_invite_code", "family2026")
    payload = _signup_payload("gated-missing@example.com", "gated-missing-slug")
    r = client.post("/auth/signup", json=payload)
    assert r.status_code == 403
