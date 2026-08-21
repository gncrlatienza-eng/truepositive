import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.schemas.incidents import IncidentOut
from app.schemas.intel import (
    FeedIndicator,
    FeedInfo,
    IocLookupResult,
    IocSearchResponse,
    MitreCoverageResponse,
    MitreTagRow,
    WorkspaceHit,
)
from app.services import incident_service, intel_service
from app.utils.security import get_current_user

router = APIRouter(prefix="/intel", tags=["intel"])


@router.get("/ping")
def ping():
    return {"router": "intel", "status": "ok"}


@router.get("/search", response_model=IocSearchResponse)
def search(
    q: str = Query(min_length=2, max_length=255),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    results = intel_service.search_ioc(db, current_user.org_id, q)
    return IocSearchResponse(query=q, results=results, total=len(results))


@router.get("/lookup", response_model=IocLookupResult)
def lookup(
    type: Literal["ip", "domain", "hash"],
    value: str = Query(min_length=1, max_length=255),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return intel_service.lookup_ioc(db, current_user.org_id, type, value)


class LinkToIncidentRequest(BaseModel):
    type: Literal["ip", "domain", "hash"]
    value: str
    incident_id: uuid.UUID


@router.post("/link-to-incident", response_model=IncidentOut)
def link_to_incident(
    payload: LinkToIncidentRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Links every alert this indicator is actually related to (real
    cross-reference, same lookup the enrichment view uses) to the chosen
    incident — reuses the existing per-alert linking that AlertDetailModal
    already exercises, just applied in bulk for one indicator's worth of
    alerts, rather than inventing a separate "indicator record" to attach
    incidents to.
    """
    related_alerts = intel_service.find_related_alerts(db, current_user.org_id, payload.value)
    result: IncidentOut | None = None
    for alert in related_alerts:
        result = incident_service.link_alert(db, current_user.org_id, current_user.id, payload.incident_id, alert.id)
    if result is None:
        # No related alerts to link — still validate the incident exists and
        # belongs to this org, and return it unchanged, rather than silently
        # no-op'ing on a bad incident_id. Same _to_out call routes/incidents.py's
        # own GET /{incident_id} uses, so alert_count/sla_breached are real.
        inc = incident_service.get_incident(db, current_user.org_id, payload.incident_id)
        result = incident_service._to_out(db, inc)
    return result


@router.get("/mitre/techniques", response_model=list[MitreTagRow])
def mitre_techniques(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return intel_service.get_rule_mitre_tags(db, current_user.org_id)


@router.get("/mitre/coverage", response_model=MitreCoverageResponse)
def mitre_coverage(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return intel_service.get_mitre_coverage(db, current_user.org_id)


@router.get("/feed-info", response_model=FeedInfo)
def feed_info(current_user: User = Depends(get_current_user)):
    del current_user
    return FeedInfo(name="TruePositive Curated Feed v1", size=intel_service.feed_size(), type="static")


@router.get("/feed", response_model=list[FeedIndicator])
def feed(current_user: User = Depends(get_current_user)):
    del current_user
    return intel_service.list_feed_indicators()


@router.get("/workspace-hits", response_model=list[WorkspaceHit])
def workspace_hits(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return intel_service.get_workspace_hits(db, current_user.org_id, days=days)
