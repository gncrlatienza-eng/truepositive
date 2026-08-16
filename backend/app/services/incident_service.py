import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.common import Severity
from app.models.incident import Incident, IncidentEventKind, IncidentHistoryEntry, IncidentNote, IncidentStatus
from app.models.user import User
from app.schemas.incidents import IncidentCreate, IncidentNoteCreate, IncidentOut, IncidentUpdate

logger = logging.getLogger(__name__)

MAX_LIMIT = 200
DEFAULT_LIMIT = 50

# Risk-score mapping: maximum severity of linked alerts → 0-100 integer.
# Revisable — documented here rather than in migration so it's trivial to tune.
_SEVERITY_TO_SCORE: dict[Severity, int] = {
    Severity.OK: 10,
    Severity.MEDIUM: 50,
    Severity.HIGH: 75,
    Severity.CRITICAL: 100,
}

# SLA thresholds for breach detection (in hours from created_at):
#   open          → incident.sla_hours column (default 72 h from migration)
#   investigating → 24 h (tighter deadline once active work has started)
INVESTIGATING_SLA_HOURS = 24


def _recalculate_risk_score(db: Session, incident: Incident) -> None:
    """Update incident.risk_score from the max severity of linked alerts.

    Called after any link/unlink or status change so the score stays current.
    No-op if there are no linked alerts (score stays at its current value).
    """
    rows = db.scalars(
        select(Alert.severity).where(Alert.incident_id == incident.id, Alert.org_id == incident.org_id)
    ).all()
    if rows:
        max_score = max(_SEVERITY_TO_SCORE.get(s, 0) for s in rows)
        incident.risk_score = max_score
    # If no alerts linked, leave existing risk_score unchanged.


def _alert_count(db: Session, incident_id: uuid.UUID) -> int:
    return db.scalar(select(func.count()).where(Alert.incident_id == incident_id)) or 0


def _write_history(
    db: Session,
    incident: Incident,
    kind: IncidentEventKind,
    *,
    actor_id: uuid.UUID | None = None,
    detail: str | None = None,
) -> None:
    db.add(
        IncidentHistoryEntry(
            incident_id=incident.id,
            org_id=incident.org_id,
            actor_id=actor_id,
            kind=kind,
            detail=detail,
        )
    )


def _to_out(db: Session, incident: Incident) -> IncidentOut:
    return IncidentOut.from_orm_with_meta(incident, _alert_count(db, incident.id))


def get_incident(db: Session, org_id: uuid.UUID, incident_id: uuid.UUID) -> Incident:
    inc = db.scalar(select(Incident).where(Incident.id == incident_id, Incident.org_id == org_id))
    if inc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return inc


def create_incident(
    db: Session,
    org_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    payload: IncidentCreate,
) -> IncidentOut:
    from app.schemas.incidents import severity_to_score

    inc = Incident(
        org_id=org_id,
        title=payload.title,
        description=payload.description,
        status=IncidentStatus.OPEN,
        risk_score=severity_to_score(payload.severity),
        assignee_id=payload.assignee_id,
    )
    db.add(inc)
    db.flush()  # assigns inc.id so history entry can reference it
    _write_history(db, inc, IncidentEventKind.CREATED, actor_id=actor_id)
    if payload.assignee_id:
        _write_history(db, inc, IncidentEventKind.ASSIGNED, actor_id=actor_id)
    db.commit()
    db.refresh(inc)
    return _to_out(db, inc)


def list_incidents(
    db: Session,
    org_id: uuid.UUID,
    *,
    status_filter: IncidentStatus | None = None,
    assignee_id: uuid.UUID | None = None,
    q: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> tuple[list[IncidentOut], int]:
    limit = min(limit, MAX_LIMIT)
    stmt = select(Incident).where(Incident.org_id == org_id)
    if status_filter is not None:
        stmt = stmt.where(Incident.status == status_filter)
    if assignee_id is not None:
        stmt = stmt.where(Incident.assignee_id == assignee_id)
    if q:
        stmt = stmt.where(Incident.title.ilike(f"%{q}%"))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Incident.created_at.desc()).limit(limit).offset(offset)).all()
    return [_to_out(db, inc) for inc in rows], total


def update_incident(
    db: Session,
    org_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    incident_id: uuid.UUID,
    payload: IncidentUpdate,
) -> IncidentOut:
    inc = get_incident(db, org_id, incident_id)
    data = payload.model_dump(exclude_unset=True)

    if "assignee_id" in data:
        new_assignee = data["assignee_id"]
        if new_assignee is not None:
            # Validate assignee belongs to this org.
            assignee = db.scalar(select(User).where(User.id == new_assignee, User.org_id == org_id))
            if assignee is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignee not found in this org")
            if inc.assignee_id != new_assignee:
                _write_history(
                    db,
                    inc,
                    IncidentEventKind.ASSIGNED,
                    actor_id=actor_id,
                    detail=str(new_assignee),
                )
        elif inc.assignee_id is not None:
            _write_history(db, inc, IncidentEventKind.UNASSIGNED, actor_id=actor_id)

    if "status" in data and data["status"] != inc.status:
        old_status = inc.status.value
        new_status = data["status"].value
        _write_history(
            db,
            inc,
            IncidentEventKind.STATUS_CHANGED,
            actor_id=actor_id,
            detail=f"{old_status} → {new_status}",
        )
        if data["status"] == IncidentStatus.RESOLVED:
            from datetime import UTC, datetime

            inc.resolved_at = datetime.now(UTC)
        elif inc.resolved_at is not None:
            # Re-opened from resolved — clear resolved_at.
            inc.resolved_at = None

    for field, value in data.items():
        setattr(inc, field, value)

    _recalculate_risk_score(db, inc)
    db.commit()
    db.refresh(inc)
    return _to_out(db, inc)


def link_alert(
    db: Session,
    org_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    incident_id: uuid.UUID,
    alert_id: uuid.UUID,
) -> IncidentOut:
    inc = get_incident(db, org_id, incident_id)
    alert = db.scalar(select(Alert).where(Alert.id == alert_id, Alert.org_id == org_id))
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.incident_id == incident_id:
        # Already linked — idempotent.
        return _to_out(db, inc)
    alert.incident_id = incident_id
    _write_history(db, inc, IncidentEventKind.ALERT_LINKED, actor_id=actor_id, detail=alert.title)
    _recalculate_risk_score(db, inc)
    db.commit()
    db.refresh(inc)
    return _to_out(db, inc)


def unlink_alert(
    db: Session,
    org_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    incident_id: uuid.UUID,
    alert_id: uuid.UUID,
) -> IncidentOut:
    inc = get_incident(db, org_id, incident_id)
    alert = db.scalar(select(Alert).where(Alert.id == alert_id, Alert.org_id == org_id))
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.incident_id != incident_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert is not linked to this incident")
    alert.incident_id = None
    _write_history(db, inc, IncidentEventKind.ALERT_UNLINKED, actor_id=actor_id, detail=alert.title)
    _recalculate_risk_score(db, inc)
    db.commit()
    db.refresh(inc)
    return _to_out(db, inc)


def list_alerts_for_incident(db: Session, org_id: uuid.UUID, incident_id: uuid.UUID) -> list[Alert]:
    get_incident(db, org_id, incident_id)  # ensures org isolation
    return list(
        db.scalars(
            select(Alert)
            .where(Alert.incident_id == incident_id, Alert.org_id == org_id)
            .order_by(Alert.created_at.desc())
        ).all()
    )


def add_note(
    db: Session,
    org_id: uuid.UUID,
    actor_id: uuid.UUID,
    incident_id: uuid.UUID,
    payload: IncidentNoteCreate,
) -> IncidentNote:
    inc = get_incident(db, org_id, incident_id)
    note = IncidentNote(
        incident_id=incident_id,
        org_id=org_id,
        author_id=actor_id,
        body=payload.body,
    )
    db.add(note)
    db.flush()
    _write_history(db, inc, IncidentEventKind.NOTE_ADDED, actor_id=actor_id)
    db.commit()
    db.refresh(note)
    return note


def list_notes(db: Session, org_id: uuid.UUID, incident_id: uuid.UUID) -> list[IncidentNote]:
    get_incident(db, org_id, incident_id)  # ensures org isolation
    return list(
        db.scalars(
            select(IncidentNote)
            .where(IncidentNote.incident_id == incident_id, IncidentNote.org_id == org_id)
            .order_by(IncidentNote.created_at.asc())
        ).all()
    )


def list_history(db: Session, org_id: uuid.UUID, incident_id: uuid.UUID) -> list[IncidentHistoryEntry]:
    get_incident(db, org_id, incident_id)  # ensures org isolation
    return list(
        db.scalars(
            select(IncidentHistoryEntry)
            .where(
                IncidentHistoryEntry.incident_id == incident_id,
                IncidentHistoryEntry.org_id == org_id,
            )
            .order_by(IncidentHistoryEntry.created_at.asc())
        ).all()
    )


def delete_incident(db: Session, org_id: uuid.UUID, incident_id: uuid.UUID) -> None:
    inc = get_incident(db, org_id, incident_id)
    # Alerts with this incident_id will have their incident_id SET NULL by the
    # DB FK constraint (ondelete="SET NULL") — no explicit clear needed here.
    db.delete(inc)
    db.commit()
