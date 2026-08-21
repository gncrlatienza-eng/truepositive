import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.alert import AlertStatus
from app.models.common import Severity
from app.models.incident import IncidentStatus


class IocResult(BaseModel):
    type: Literal["ip", "domain", "hash"]
    value: str
    category: str
    confidence: Literal["high", "medium", "low"]
    description: str
    source: str
    # Whether this org already has a real whitelist_entries row for this
    # exact (type, value) -- None means neither. Lets the UI show "already
    # blocked/allowed" up front instead of the analyst finding out only
    # after clicking and hitting a conflict.
    whitelist_status: Literal["allow", "block"] | None = None


class IocSearchResponse(BaseModel):
    query: str
    results: list[IocResult]
    total: int


class RelatedAlert(BaseModel):
    id: uuid.UUID
    title: str
    severity: Severity
    status: AlertStatus
    created_at: datetime


class RelatedIncident(BaseModel):
    id: uuid.UUID
    title: str
    status: IncidentStatus
    risk_score: int


class IocLookupResult(BaseModel):
    type: Literal["ip", "domain", "hash"]
    value: str
    found_in_feed: bool
    category: str | None
    confidence: Literal["high", "medium", "low"] | None
    description: str | None
    source: str | None
    # Deterministic, derived from this app's own single curated feed's
    # confidence rating -- explicitly not a live multi-vendor consensus
    # score, since this app has no such integration. None when the
    # indicator isn't in the feed at all.
    score: int | None
    whitelist_status: Literal["allow", "block"] | None
    # Real cross-reference against this org's own logs (substring match on
    # message) -- None/0 when the indicator has never appeared here.
    first_seen: datetime | None
    last_seen: datetime | None
    log_count: int
    related_alerts: list[RelatedAlert]
    related_incidents: list[RelatedIncident]


class MitreTagRow(BaseModel):
    technique_id: str  # e.g. "T1078"
    technique_name: str  # e.g. "Valid Accounts"
    tactic: str | None  # from a small curated reference table; None if unrecognized
    rule_count: int
    alert_count: int
    rules: list[str]  # names of rules tagged with this technique


class FeedInfo(BaseModel):
    name: str
    size: int
    type: Literal["static"]


class FeedIndicator(BaseModel):
    type: Literal["ip", "domain", "hash"]
    value: str
    category: str
    confidence: Literal["high", "medium", "low"]
    score: int
    description: str
    source: str


class WorkspaceHit(BaseModel):
    type: Literal["ip", "domain", "hash"]
    value: str
    category: str
    alert_count: int
    last_seen: datetime | None


class MitreTacticCoverage(BaseModel):
    tactic: str
    # Counts against this app's own small curated technique reference table
    # (see intel_service._MITRE_TACTICS), not a claim about the full public
    # ATT&CK matrix's real technique count for this tactic.
    techniques_total: int
    techniques_covered: int


class MitreCoverageResponse(BaseModel):
    tactics: list[MitreTacticCoverage]
    techniques: list[MitreTagRow]
