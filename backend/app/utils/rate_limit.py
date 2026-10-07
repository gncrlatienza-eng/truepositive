"""In-memory, single-instance rate limiting.

This backend runs as exactly one container in this deployment (see
docker-compose.yml) -- state here lives in a process-local dict, not a
shared store, so this limiter does NOT coordinate across multiple backend
replicas. If this app is ever horizontally scaled, each replica would grant
an independent quota to the same client, which defeats the point; a shared
store (Redis INCR + TTL is the standard pattern) would be needed at that
point. Documented here rather than silently pretending this is bulletproof.

Fixed-window counters, keyed per scope + client identity, so different
endpoints don't share one budget and different clients don't share one
budget either.
"""

import threading
import time
import uuid
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_buckets: dict[str, tuple[int, deque[float]]] = {}

# Every key ever seen used to stay in memory forever -- an unauthenticated
# loop over random agent ids / source IPs grew this dict without bound.
# Buckets idle longer than this are dropped by a periodic sweep.
_SWEEP_INTERVAL_SECONDS = 300
_last_sweep = 0.0


def _sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep < _SWEEP_INTERVAL_SECONDS:
        return
    _last_sweep = now
    stale = [key for key, (window, bucket) in _buckets.items() if not bucket or bucket[-1] < now - window]
    for key in stale:
        del _buckets[key]


def _check(key: str, limit: int, window_seconds: int) -> tuple[bool, float]:
    now = time.monotonic()
    with _lock:
        _sweep(now)
        _, bucket = _buckets.setdefault(key, (window_seconds, deque()))
        cutoff = now - window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = window_seconds - (now - bucket[0])
            return False, max(retry_after, 1.0)
        bucket.append(now)
        return True, 0.0


def _client_ip(request: Request) -> str:
    # Behind the prod/Tailscale reverse proxy this is the real client IP only
    # because uvicorn is started with FORWARDED_ALLOW_IPS there (see
    # docker-compose.prod.yml) -- otherwise every request would share the
    # proxy container's IP and one client could exhaust everyone's budget.
    return request.client.host if request.client else "unknown"


def _agent_id(request: Request) -> str:
    # Raw path text, checked before FastAPI's own UUID validation runs -- only
    # trust it as a key if it's a real UUID, so junk ids can't each mint a
    # fresh bucket.
    agent_id = request.path_params.get("agent_id")
    try:
        return str(uuid.UUID(str(agent_id)))
    except ValueError:
        return f"ip:{_client_ip(request)}"


def rate_limit(
    scope: str, *, limit: int, window_seconds: int, key_by: Callable[[Request], str] = _client_ip
) -> Callable[[Request], None]:
    """FastAPI dependency factory. `scope` namespaces the counter (e.g.
    "login") so unrelated endpoints never share one budget. `key_by`
    extracts the per-client identity to key on -- defaults to source IP
    (for user-facing auth endpoints); pass `key_by=by_agent_id` for
    agent-authed endpoints, where the meaningful identity is the agent
    itself, not whatever IP it happens to connect from.
    """

    def _dependency(request: Request) -> None:
        key = f"{scope}:{key_by(request)}"
        allowed, retry_after = _check(key, limit, window_seconds)
        if not allowed:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests. Try again later.",
                headers={"Retry-After": str(int(retry_after) + 1)},
            )

    return _dependency


def by_agent_id(request: Request) -> str:
    return _agent_id(request)


def reset() -> None:
    """Test-only: clear all counters. Starlette's TestClient sends every
    request from the same pseudo-host, so without a reset between tests the
    many auth_headers/second_org_headers fixture-driven signups across the
    suite would trip the real limit and fail unrelated tests -- mirrors the
    per-test DB rollback isolation this suite already relies on elsewhere.
    """
    with _lock:
        _buckets.clear()
