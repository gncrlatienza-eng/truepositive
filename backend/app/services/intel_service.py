import json
import pathlib
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.alert_rule import AlertRule
from app.models.incident import Incident
from app.models.log import Log
from app.models.whitelist_entry import WhitelistEntry
from app.schemas.intel import (
    FeedIndicator,
    IocLookupResult,
    IocResult,
    MitreCoverageResponse,
    MitreTacticCoverage,
    MitreTagRow,
    RelatedAlert,
    RelatedIncident,
    WorkspaceHit,
)

# Loaded once at import time — same "static data loaded at module level"
# pattern the frontend's own curated content (e.g. dashboard's event-type
# help text) already uses. Real, publicly documented indicators (Tor exit
# nodes, sinkholed malware kill-switch domains, EICAR test hashes, etc.),
# not fabricated data — see backend/data/ioc_feed.json's own `source` field
# on every entry.
_FEED_PATH = pathlib.Path(__file__).resolve().parent.parent.parent / "data" / "ioc_feed.json"
_IOC_FEED: list[dict] = json.loads(_FEED_PATH.read_text(encoding="utf-8"))

# A small, real reference of MITRE ATT&CK technique -> tactic for commonly
# cited techniques (Enterprise ATT&CK is public reference data — this is
# not fabricated, just a small curated slice rather than the full ~600-row
# matrix, which would be its own dataset this app doesn't otherwise need).
# Unrecognized technique IDs honestly show no tactic rather than a guess.
# 2026-08-17: modestly extended (10 tactics, 20 techniques) so the Threat
# Intel coverage matrix has real columns to render — still a small curated
# slice, not the full ATT&CK matrix; "techniques_total" per tactic in
# get_mitre_coverage() is a count against *this table*, not a claim about
# how many techniques real ATT&CK defines for that tactic.
_MITRE_TACTICS: dict[str, str] = {
    "T1566": "Initial Access",
    "T1190": "Initial Access",
    "T1059": "Execution",
    "T1059.001": "Execution",
    "T1204": "Execution",
    "T1053": "Persistence",
    "T1547": "Persistence",
    "T1068": "Privilege Escalation",
    "T1548": "Privilege Escalation",
    "T1078": "Defense Evasion",
    "T1070": "Defense Evasion",
    "T1027": "Defense Evasion",
    "T1110": "Credential Access",
    "T1003": "Credential Access",
    "T1046": "Discovery",
    "T1082": "Discovery",
    "T1021": "Lateral Movement",
    "T1550": "Lateral Movement",
    "T1071": "Command and Control",
    "T1105": "Command and Control",
    "T1486": "Impact",
    "T1490": "Impact",
}

# Render order for the coverage matrix — the conventional Enterprise ATT&CK
# tactic ordering (kill-chain-ish), not alphabetical.
_TACTIC_ORDER: list[str] = [
    "Initial Access",
    "Execution",
    "Persistence",
    "Privilege Escalation",
    "Defense Evasion",
    "Credential Access",
    "Discovery",
    "Lateral Movement",
    "Command and Control",
    "Impact",
]

# Deterministic, documented, and honestly labeled as being derived from this
# app's own single curated feed's confidence rating — not a claim of
# multi-vendor consensus scoring (real threat-intel platforms aggregate many
# feeds; this app has exactly one).
_SCORE_BY_CONFIDENCE = {"high": 85, "medium": 55, "low": 25}


def feed_size() -> int:
    return len(_IOC_FEED)


def _find_feed_entry(ioc_type: str, value: str) -> dict | None:
    needle = value.strip().lower()
    for entry in _IOC_FEED:
        if entry["type"] == ioc_type and entry["value"].lower() == needle:
            return entry
    return None


def search_ioc(db: Session, org_id: uuid.UUID, q: str) -> list[IocResult]:
    """Case-insensitive match on value. IPs/hashes: exact or prefix match
    (hashes are frequently searched by a shortened prefix). Domains: suffix
    match, so searching "evil.com" also matches "sub.evil.com". Returns an
    empty list on no match rather than 404 — same as GlobalSearch.jsx's own
    "no results" being a normal, non-error outcome.

    Cross-references matches against this org's real whitelist_entries so
    the UI can show "already blocked"/"already allowed" up front.
    """
    needle = q.strip().lower()
    if not needle:
        return []
    matches = []
    for entry in _IOC_FEED:
        value = entry["value"].lower()
        entry_type = entry["type"]
        if entry_type == "ip":
            matched = value == needle
        elif entry_type == "domain":
            matched = value == needle or value.endswith(f".{needle}") or needle in value
        else:  # hash — a short searched prefix should hit the full stored hash
            matched = value.startswith(needle)
        if matched:
            matches.append(entry)

    if not matches:
        return []

    existing_rows = db.execute(
        select(WhitelistEntry.type, WhitelistEntry.value, WhitelistEntry.kind).where(
            WhitelistEntry.org_id == org_id,
            WhitelistEntry.type.in_({m["type"] for m in matches}),
            WhitelistEntry.value.in_({m["value"] for m in matches}),
        )
    ).all()
    status_by_key = {(t.value, v): k for t, v, k in existing_rows}

    return [
        IocResult(**entry, whitelist_status=status_by_key.get((entry["type"], entry["value"]))) for entry in matches
    ]


def find_related_alerts(db: Session, org_id: uuid.UUID, value: str) -> list[Alert]:
    """Real substring search over this org's own log messages, joined to the
    alerts those logs raised — the only honest way to answer "has this
    indicator actually shown up here" without a dedicated indicator-
    extraction pipeline this app doesn't have. Shared by the lookup
    enrichment view and the "Link to incident" bulk action so both agree on
    exactly which alerts count as related to a given indicator.
    """
    log_ids = list(db.scalars(select(Log.id).where(Log.org_id == org_id, Log.message.ilike(f"%{value}%"))))
    if not log_ids:
        return []
    return list(
        db.scalars(
            select(Alert).where(Alert.org_id == org_id, Alert.log_id.in_(log_ids)).order_by(Alert.created_at.desc())
        ).all()
    )


def lookup_ioc(db: Session, org_id: uuid.UUID, ioc_type: str, value: str) -> IocLookupResult:
    """The Threat Intel page's single-indicator enrichment lookup — a
    materially different shape from search_ioc's list-of-matches: one
    indicator, a real reputation score, and real cross-references against
    this org's own logs/alerts/incidents (not a live multi-vendor feed
    aggregation, which this app has no integration for).
    """
    entry = _find_feed_entry(ioc_type, value)

    whitelist_row = db.scalar(
        select(WhitelistEntry).where(
            WhitelistEntry.org_id == org_id, WhitelistEntry.type == ioc_type, WhitelistEntry.value == value
        )
    )

    matching_logs = db.scalars(
        select(Log).where(Log.org_id == org_id, Log.message.ilike(f"%{value}%")).order_by(Log.timestamp.desc())
    ).all()
    first_seen = min((log.timestamp for log in matching_logs), default=None)
    last_seen = max((log.timestamp for log in matching_logs), default=None)

    alert_rows = find_related_alerts(db, org_id, value)
    related_alerts = [
        RelatedAlert(id=a.id, title=a.title, severity=a.severity, status=a.status, created_at=a.created_at)
        for a in alert_rows
    ]
    related_incident_ids = {a.incident_id for a in alert_rows if a.incident_id}

    related_incidents: list[RelatedIncident] = []
    if related_incident_ids:
        incident_rows = db.scalars(select(Incident).where(Incident.id.in_(related_incident_ids))).all()
        related_incidents = [
            RelatedIncident(id=i.id, title=i.title, status=i.status, risk_score=i.risk_score) for i in incident_rows
        ]

    score = _SCORE_BY_CONFIDENCE.get(entry["confidence"]) if entry else None

    return IocLookupResult(
        type=ioc_type,  # type: ignore[arg-type]
        value=value,
        found_in_feed=entry is not None,
        category=entry["category"] if entry else None,
        confidence=entry["confidence"] if entry else None,
        description=entry["description"] if entry else None,
        source=entry["source"] if entry else None,
        score=score,
        whitelist_status=whitelist_row.kind if whitelist_row else None,  # type: ignore[arg-type]
        first_seen=first_seen,
        last_seen=last_seen,
        log_count=len(matching_logs),
        related_alerts=related_alerts[:10],
        related_incidents=related_incidents,
    )


def list_feed_indicators() -> list[FeedIndicator]:
    """Every entry in the static feed, with its deterministic score attached
    — backs the Threat Intel dashboard's category breakdown and top-by-risk
    list, both computed client-side from this one list rather than
    duplicating the same aggregation twice server-side.
    """
    return [FeedIndicator(**entry, score=_SCORE_BY_CONFIDENCE[entry["confidence"]]) for entry in _IOC_FEED]


def get_workspace_hits(db: Session, org_id: uuid.UUID, days: int = 7) -> list[WorkspaceHit]:
    """Real bulk cross-reference: every feed indicator (only 50, static, in
    memory — no indexing concern) checked against this org's own logs within
    the window, same substring-match convention as find_related_alerts/
    lookup_ioc. Only indicators with at least one real hit are returned,
    sorted most-recent-first.
    """
    cutoff = datetime.now(UTC) - timedelta(days=days)
    hits: list[WorkspaceHit] = []
    for entry in _IOC_FEED:
        log_ids = list(
            db.scalars(
                select(Log.id).where(
                    Log.org_id == org_id, Log.message.ilike(f"%{entry['value']}%"), Log.timestamp >= cutoff
                )
            )
        )
        if not log_ids:
            continue
        alert_count = db.scalar(select(func.count()).where(Alert.org_id == org_id, Alert.log_id.in_(log_ids))) or 0
        last_seen = db.scalar(select(func.max(Log.timestamp)).where(Log.id.in_(log_ids)))
        hits.append(
            WorkspaceHit(
                type=entry["type"],
                value=entry["value"],
                category=entry["category"],
                alert_count=alert_count,
                last_seen=last_seen,
            )
        )
    return sorted(hits, key=lambda h: h.last_seen or datetime.min.replace(tzinfo=UTC), reverse=True)


def get_mitre_coverage(db: Session, org_id: uuid.UUID) -> MitreCoverageResponse:
    """Per-tactic covered/total technique counts (against this app's own
    small reference table, see _MITRE_TACTICS) plus the existing per-
    technique tagged-rule rows — one call backs both the dashboard-default
    matrix and the per-lookup MITRE section.
    """
    tagged = get_rule_mitre_tags(db, org_id)
    tagged_ids = {row.technique_id for row in tagged}

    totals: dict[str, int] = {}
    covered: dict[str, int] = {}
    for technique_id, tactic in _MITRE_TACTICS.items():
        totals[tactic] = totals.get(tactic, 0) + 1
        if technique_id in tagged_ids:
            covered[tactic] = covered.get(tactic, 0) + 1

    tactics = [
        MitreTacticCoverage(tactic=t, techniques_total=totals[t], techniques_covered=covered.get(t, 0))
        for t in _TACTIC_ORDER
        if t in totals
    ]
    return MitreCoverageResponse(tactics=tactics, techniques=tagged)


def get_rule_mitre_tags(db: Session, org_id: uuid.UUID) -> list[MitreTagRow]:
    """Groups this org's rules by mitre_technique (freeform "T1078 — Valid
    Accounts" text), with a real per-technique alert count. Only techniques
    with at least one tagged rule appear — an org with no tagged rules gets
    an empty list, not an error.
    """
    rules = db.scalars(
        select(AlertRule).where(AlertRule.org_id == org_id, AlertRule.mitre_technique.is_not(None))
    ).all()

    grouped: dict[str, list[AlertRule]] = {}
    for rule in rules:
        technique = (rule.mitre_technique or "").strip()
        if not technique:
            continue
        grouped.setdefault(technique, []).append(rule)

    rows: list[MitreTagRow] = []
    for technique, tagged_rules in grouped.items():
        technique_id, _, technique_name = technique.partition("—")
        technique_id = technique_id.strip() or technique
        rule_ids = [r.id for r in tagged_rules]
        alert_count = db.scalar(select(func.count()).where(Alert.org_id == org_id, Alert.rule_id.in_(rule_ids))) or 0
        rows.append(
            MitreTagRow(
                technique_id=technique_id,
                technique_name=technique_name.strip(),
                tactic=_MITRE_TACTICS.get(technique_id),
                rule_count=len(tagged_rules),
                alert_count=alert_count,
                rules=[r.name for r in tagged_rules],
            )
        )
    return sorted(rows, key=lambda r: r.technique_id)
