import csv
import io
import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.incident import IncidentStatus
from app.models.user import User
from app.schemas.alerts import AlertOut
from app.schemas.incidents import (
    IncidentCreate,
    IncidentHistoryOut,
    IncidentListResponse,
    IncidentNoteCreate,
    IncidentNoteOut,
    IncidentOut,
    IncidentUpdate,
    LinkAlertRequest,
)
from app.services import incident_service
from app.utils.csv import csv_safe
from app.utils.security import get_current_user

router = APIRouter(prefix="/incidents", tags=["incidents"])

CSV_EXPORT_CAP = 5000


@router.get("/ping")
def ping():
    return {"router": "incidents", "status": "ok"}


# Literal path registered ahead of the typed {incident_id} route —
# same discipline as /logs/export.csv and /alerts/export.csv.
@router.get("/export.csv")
def export_incidents(
    status: IncidentStatus | None = None,
    q: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incidents, _ = incident_service.list_incidents(
        db,
        current_user.org_id,
        status_filter=status,
        q=q,
        limit=CSV_EXPORT_CAP,
        offset=0,
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "created_at", "status", "risk_score", "title", "assignee_id", "sla_breached"])
    for inc in incidents:
        writer.writerow(
            [
                inc.id,
                inc.created_at.isoformat(),
                inc.status.value,
                inc.risk_score,
                csv_safe(inc.title),
                inc.assignee_id,
                inc.sla_breached,
            ]
        )
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="incidents_export.csv"'},
    )


@router.get("", response_model=IncidentListResponse)
def list_incidents(
    status: IncidentStatus | None = None,
    assignee_id: uuid.UUID | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = incident_service.list_incidents(
        db,
        current_user.org_id,
        status_filter=status,
        assignee_id=assignee_id,
        q=q,
        limit=limit,
        offset=offset,
    )
    return IncidentListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
def create_incident(
    payload: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return incident_service.create_incident(db, current_user.org_id, current_user.id, payload)


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inc = incident_service.get_incident(db, current_user.org_id, incident_id)
    return incident_service._to_out(db, inc)


@router.patch("/{incident_id}", response_model=IncidentOut)
def update_incident(
    incident_id: uuid.UUID,
    payload: IncidentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return incident_service.update_incident(db, current_user.org_id, current_user.id, incident_id, payload)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incident_service.delete_incident(db, current_user.org_id, incident_id)


# ── Alert link / unlink ───────────────────────────────────────────────────────


@router.post("/{incident_id}/alerts", response_model=IncidentOut)
def link_alert(
    incident_id: uuid.UUID,
    payload: LinkAlertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return incident_service.link_alert(db, current_user.org_id, current_user.id, incident_id, payload.alert_id)


@router.delete("/{incident_id}/alerts/{alert_id}", response_model=IncidentOut)
def unlink_alert(
    incident_id: uuid.UUID,
    alert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return incident_service.unlink_alert(db, current_user.org_id, current_user.id, incident_id, alert_id)


@router.get("/{incident_id}/alerts", response_model=list[AlertOut])
def list_alerts_for_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alerts = incident_service.list_alerts_for_incident(db, current_user.org_id, incident_id)
    return [AlertOut.model_validate(a) for a in alerts]


# ── Notes ─────────────────────────────────────────────────────────────────────


@router.post("/{incident_id}/notes", response_model=IncidentNoteOut, status_code=status.HTTP_201_CREATED)
def add_note(
    incident_id: uuid.UUID,
    payload: IncidentNoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = incident_service.add_note(db, current_user.org_id, current_user.id, incident_id, payload)
    return IncidentNoteOut.model_validate(note)


@router.get("/{incident_id}/notes", response_model=list[IncidentNoteOut])
def list_notes(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notes = incident_service.list_notes(db, current_user.org_id, incident_id)
    return [IncidentNoteOut.model_validate(n) for n in notes]


# ── History / timeline ────────────────────────────────────────────────────────


@router.get("/{incident_id}/history", response_model=list[IncidentHistoryOut])
def list_history(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    history = incident_service.list_history(db, current_user.org_id, incident_id)
    return [IncidentHistoryOut.model_validate(h) for h in history]
