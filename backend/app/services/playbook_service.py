import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.log import Log
from app.models.playbook import Playbook
from app.schemas.alert_rules import AlertRuleConditions
from app.schemas.playbooks import PlaybookActions, PlaybookCreate, PlaybookUpdate

logger = logging.getLogger(__name__)


def _trigger_matches(log: Log, conditions: dict) -> bool:
    """Reuse AlertRuleConditions validation so the trigger semantics stay identical
    to log_service._rule_matches, which this mirrors."""
    parsed = AlertRuleConditions.model_validate(conditions)
    from app.services.log_service import _SEVERITY_RANK

    if parsed.event_type and log.event_type != parsed.event_type:
        return False
    if parsed.min_severity and _SEVERITY_RANK[log.severity] < _SEVERITY_RANK[parsed.min_severity]:
        return False
    return True


def get_playbook(db: Session, org_id: uuid.UUID, playbook_id: uuid.UUID) -> Playbook:
    pb = db.scalar(select(Playbook).where(Playbook.id == playbook_id, Playbook.org_id == org_id))
    if pb is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Playbook not found")
    return pb


def create_playbook(db: Session, org_id: uuid.UUID, payload: PlaybookCreate) -> Playbook:
    pb = Playbook(
        org_id=org_id,
        name=payload.name,
        description=payload.description,
        enabled=payload.enabled,
        trigger_conditions=payload.trigger.model_dump(exclude_none=True),
        actions=payload.actions.model_dump(),
    )
    db.add(pb)
    db.commit()
    db.refresh(pb)
    return pb


def list_playbooks(
    db: Session,
    org_id: uuid.UUID,
    *,
    enabled: bool | None = None,
    q: str | None = None,
) -> list[Playbook]:
    stmt = select(Playbook).where(Playbook.org_id == org_id)
    if enabled is not None:
        stmt = stmt.where(Playbook.enabled == enabled)
    if q:
        stmt = stmt.where(Playbook.name.ilike(f"%{q}%"))
    return list(db.scalars(stmt.order_by(Playbook.created_at.desc())).all())


def update_playbook(db: Session, org_id: uuid.UUID, playbook_id: uuid.UUID, payload: PlaybookUpdate) -> Playbook:
    pb = get_playbook(db, org_id, playbook_id)
    data = payload.model_dump(exclude_unset=True)
    if "trigger" in data and data["trigger"] is not None:
        pb.trigger_conditions = {k: v for k, v in data.pop("trigger").items() if v is not None}
    elif "trigger" in data:
        data.pop("trigger")
    if "actions" in data and data["actions"] is not None:
        pb.actions = data.pop("actions")
    elif "actions" in data:
        data.pop("actions")
    for field, value in data.items():
        setattr(pb, field, value)
    db.commit()
    db.refresh(pb)
    return pb


def delete_playbook(db: Session, org_id: uuid.UUID, playbook_id: uuid.UUID) -> None:
    pb = get_playbook(db, org_id, playbook_id)
    # Incidents created by this playbook keep existing — no cascade.
    db.delete(pb)
    db.commit()


def evaluate_playbooks_for_log(db: Session, org_id: uuid.UUID, log: Log) -> None:
    """Evaluate all enabled playbooks against a freshly-ingested log.

    Called synchronously from log_service.ingest_logs after alert creation,
    matching the established "no scheduler, evaluate inline" philosophy from
    Sprint 3 and Sprint 5.  Each matching playbook's actions are executed:

      auto_create_incident — real: creates an Incident and links the log's
                             most-recently-created alert (if any).
      block_ip             — stub: logs a [PLAYBOOK ACTION] line.
      disable_account      — stub: logs a [PLAYBOOK ACTION] line.
      slack_notify         — stub: logs a [PLAYBOOK ACTION] line.

    Stub actions are structured log lines so they're auditable and searchable
    in Docker logs without needing a real integration this sprint.
    """
    playbooks = db.scalars(select(Playbook).where(Playbook.org_id == org_id, Playbook.enabled)).all()

    for pb in playbooks:
        if not _trigger_matches(log, pb.trigger_conditions):
            continue

        actions = PlaybookActions.model_validate(pb.actions)
        log_ctx = {
            "playbook_id": str(pb.id),
            "playbook_name": pb.name,
            "log_id": getattr(log, "id", None),
            "event_type": log.event_type,
        }

        if actions.auto_create_incident:
            _do_auto_create_incident(db, org_id, pb, log)

        if actions.block_ip:
            logger.info(
                "[PLAYBOOK ACTION] block_ip | %s | source_ip=%s",
                log_ctx,
                # Source IP is not a dedicated field yet — use event_type as context.
                log.event_type,
            )

        if actions.disable_account:
            logger.info("[PLAYBOOK ACTION] disable_account | %s", log_ctx)

        if actions.slack_notify:
            logger.info("[PLAYBOOK ACTION] slack_notify | %s", log_ctx)


def _do_auto_create_incident(db: Session, org_id: uuid.UUID, pb: Playbook, log: Log) -> None:
    """Create an incident and link the triggering log's alert (if one exists).

    Actor is None (system-generated) so timeline shows 'auto' not a user name.
    """
    from app.models.alert import Alert
    from app.models.incident import Incident, IncidentStatus

    title = f"[Auto] {pb.name} — {log.event_type}"
    inc = Incident(
        org_id=org_id,
        title=title[:255],
        description=f"Auto-created by playbook '{pb.name}'.",
        status=IncidentStatus.OPEN,
        risk_score=0,
    )
    db.add(inc)
    db.flush()

    from app.models.incident import IncidentEventKind, IncidentHistoryEntry

    db.add(
        IncidentHistoryEntry(
            incident_id=inc.id,
            org_id=org_id,
            actor_id=None,  # system actor
            kind=IncidentEventKind.CREATED,
            detail=f"Auto-created by playbook '{pb.name}'",
        )
    )

    # Link the most recently created alert for this log, if any.
    alert = db.scalar(
        select(Alert).where(Alert.log_id == log.id, Alert.org_id == org_id).order_by(Alert.created_at.desc()).limit(1)
    )
    if alert:
        alert.incident_id = inc.id
        db.add(
            IncidentHistoryEntry(
                incident_id=inc.id,
                org_id=org_id,
                actor_id=None,
                kind=IncidentEventKind.ALERT_LINKED,
                detail=alert.title,
            )
        )
        # Seed risk_score from the alert's severity.
        from app.services.incident_service import _SEVERITY_TO_SCORE

        inc.risk_score = _SEVERITY_TO_SCORE.get(alert.severity, 0)

    db.flush()
    logger.info(
        "[PLAYBOOK ACTION] auto_create_incident | playbook=%s incident_id=%s",
        pb.name,
        inc.id,
    )
