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
from collections import defaultdict
from collections.abc import Callable

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_buckets: dict[str, list[float]] = defaultdict(list)


def _check(key: str, limit: int, window_seconds: int) -> tuple[bool, float]:
    now = time.monotonic()
    with _lock:
        bucket = _buckets[key]
        cutoff = now - window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= limit:
            retry_after = window_seconds - (now - bucket[0])
            return False, max(retry_after, 1.0)
        bucket.append(now)
        return True, 0.0


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _agent_id(request: Request) -> str:
    agent_id = request.path_params.get("agent_id")
    return str(agent_id) if agent_id is not None else _client_ip(request)


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
