"""Hub-and-spoke agent relay (Phase 1: manual pairing, full isolation).

A relay child never talks to the internet-facing backend directly — its hub
(the org's `is_primary` agent) proxies its heartbeat, source-list, and log
traffic here, authenticated as the *hub*, not the child. The one rule that
must never be violated by anything in this file: `Log.agent_id` (and every
other per-device fact — heartbeat's `last_seen_at`, assigned sources) always
resolves against the *child's* own `Agent` row, never the hub's — a hub
relaying data is not the same as a hub owning it. `_get_relay_child` is the
one chokepoint that enforces this by refusing to touch any agent that isn't
actually this hub's child.

Phase 1 has no separate admin-approval step: the admin creates a child's
credentials directly from the dashboard (`create_relay_child`), which is
itself the authorization — same trust model as deploying any agent today.
`awaiting_relay_approval` stays False for every Phase-1-created child; it
only becomes meaningful once Phase 2 (LAN auto-discovery) lets a hub report
a device it found on its own, which _get_relay_child already refuses to
serve until an admin flips that flag off.
"""

import threading
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.log_source import LogSource
from app.schemas.agents import AgentCreate, AgentRegisterRequest, RelayChildCreate
from app.schemas.log_sources import SourceStatusItem, SourceStatusReportRequest
from app.schemas.logs import LogIngestItem, LogIngestRequest, LogIngestResponse
from app.services import agent_service, log_service, log_source_service
from app.utils.security import verify_password

# A soft product ceiling, not a technical one — the actual bottleneck is the
# hub's own rate limit on POST .../relay-proxy (120 req/60s, see
# routes/agents.py), which a worst-case child (heartbeat+sources+
# source_status+logs every 30s cycle) can saturate at ~15 children. This app
# targets a household's real devices, not a fleet, so 10 leaves comfortable
# headroom under that ceiling rather than defining "the limit" as wherever
# 429s start.
MAX_RELAY_CHILDREN_PER_HUB = 10

# In-memory only, per the design in migration 0015's docstring — a hub's LAN
# address is ephemeral network topology, not something worth persisting or
# letting go stale in the database if a hub disappears without a graceful
# shutdown. Lost on a backend restart, which just means the dashboard's
# deploy screen shows "not yet known" until the hub's next heartbeat.
_lock = threading.Lock()
_hub_relay_addrs: dict[uuid.UUID, str] = {}


def record_hub_relay_addr(agent_id: uuid.UUID, addr: str | None) -> None:
    with _lock:
        if addr:
            _hub_relay_addrs[agent_id] = addr
        else:
            _hub_relay_addrs.pop(agent_id, None)


def get_hub_relay_addr(agent_id: uuid.UUID) -> str | None:
    with _lock:
        return _hub_relay_addrs.get(agent_id)


def _require_hub(hub_agent: Agent) -> None:
    if not hub_agent.is_primary:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the org's primary agent can relay on behalf of other devices"
        )
    if hub_agent.relay_parent_agent_id is not None:
        # No chaining in v1 — a relay child can't itself host children.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A relay child cannot itself act as a hub")


def _get_relay_child(db: Session, hub_agent: Agent, child_id: uuid.UUID, child_key: str) -> Agent:
    """The one chokepoint every relay_* function below routes through —
    refuses to touch any Agent row that isn't actually this hub's child, so a
    compromised or misbehaving hub can only ever act on the devices it was
    genuinely paired with, never an arbitrary agent id in the same org.

    Also verifies `child_key` against the child's own `agent_key_hash` —
    ownership-by-hub alone used to be the only check here, which meant
    anyone who could reach the hub's local relay listener (LAN-adjacent by
    design) could act as *any* already-paired child just by sending its
    child_id, with no real credential required — a real, live-found gap
    (see SECURITY.md). This is the actual enforcement point: the hub's own
    local listener has no way to verify a key itself (it has no access to
    any hash), so the check has to happen here, against the source of
    truth, using the same verify_password the direct-connect path
    (get_current_agent) already uses.
    """
    child = db.get(Agent, child_id)
    if child is None or child.org_id != hub_agent.org_id or child.relay_parent_agent_id != hub_agent.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Relay child not found for this hub")
    if not verify_password(child_key, child.agent_key_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials for this relay child")
    if child.awaiting_relay_approval:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This device is still awaiting admin approval")
    return child


def create_relay_child(db: Session, org_id: uuid.UUID, payload: RelayChildCreate) -> tuple[Agent, str, str | None]:
    hub = agent_service.get_agent(db, org_id, payload.hub_agent_id)
    _require_hub(hub)
    child_count = db.scalar(select(func.count()).select_from(Agent).where(Agent.relay_parent_agent_id == hub.id)) or 0
    if child_count >= MAX_RELAY_CHILDREN_PER_HUB:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{hub.name} already has {MAX_RELAY_CHILDREN_PER_HUB} relay children, the maximum for one hub.",
        )
    agent, raw_key = agent_service.create_agent(
        db, org_id, AgentCreate(name=payload.name, platform=payload.platform), relay_parent_agent_id=hub.id
    )
    return agent, raw_key, get_hub_relay_addr(hub.id)


def relay_register(db: Session, hub_agent: Agent, child_id: uuid.UUID, child_key: str, hostname: str) -> Agent:
    _require_hub(hub_agent)
    child = _get_relay_child(db, hub_agent, child_id, child_key)
    return agent_service.register_agent(db, child, AgentRegisterRequest(hostname=hostname))


def relay_heartbeat(db: Session, hub_agent: Agent, child_id: uuid.UUID, child_key: str) -> Agent:
    _require_hub(hub_agent)
    child = _get_relay_child(db, hub_agent, child_id, child_key)
    return agent_service.heartbeat(db, child)


def relay_list_sources(db: Session, hub_agent: Agent, child_id: uuid.UUID, child_key: str) -> list[LogSource]:
    _require_hub(hub_agent)
    child = _get_relay_child(db, hub_agent, child_id, child_key)
    return log_source_service.list_active_local_sources_for_agent(db, child.id)


def relay_report_source_status(
    db: Session, hub_agent: Agent, child_id: uuid.UUID, child_key: str, results: list[SourceStatusItem] | None
) -> int:
    _require_hub(hub_agent)
    if not results:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "'source_status_results' is required when kind is 'source_status'"
        )
    child = _get_relay_child(db, hub_agent, child_id, child_key)
    return log_source_service.report_source_status(db, child, SourceStatusReportRequest(results=results))


def relay_ingest_logs(
    db: Session, hub_agent: Agent, child_id: uuid.UUID, child_key: str, logs: list[LogIngestItem] | None
) -> LogIngestResponse:
    _require_hub(hub_agent)
    if not logs:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "'logs' is required when kind is 'logs'")
    child = _get_relay_child(db, hub_agent, child_id, child_key)
    # Passing `child`, not `hub_agent` — this is the identity-preservation
    # guarantee itself: log_service.ingest_logs sets Log.agent_id from
    # whichever Agent object it's given, so every relayed row still ends up
    # attributed to the physical device that produced it.
    return log_service.ingest_logs(db, child, LogIngestRequest(logs=logs))
