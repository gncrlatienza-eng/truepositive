"""Tests for auth rate limiting. Login/signup previously had no throttle at
all -- unlimited credential-stuffing against real accounts, unlimited
automated org-creation spam. Both are keyed per client IP; Starlette's
TestClient sends every request from the same pseudo-host, which is exactly
what makes these tests possible without faking network identity.
"""


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
