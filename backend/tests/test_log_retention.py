"""Tests for log_retention.purge_old_logs.

purge_old_logs takes `db` directly (unlike run_log_retention, which opens its
own SessionLocal), so it runs against the rolled-back db_session fixture.
Every call is scoped to the test's own org so it never touches (or waits on
locks held by) the dev database's real logs.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.alert import Alert, AlertStatus
from app.models.common import Severity
from app.models.log import Log
from app.models.org import Org
from app.services.log_retention import purge_old_logs


def _make_org(db_session) -> uuid.UUID:
    org = Org(name="Retention Test Org", slug=f"ret-{uuid.uuid4().hex[:8]}")
    db_session.add(org)
    db_session.flush()
    return org.id


def _make_log(db_session, org_id, age: timedelta) -> int:
    log = Log(
        org_id=org_id,
        timestamp=datetime.now(UTC) - age,
        severity=Severity.OK,
        event_type="Process Create",
        message="m",
        raw={},
    )
    db_session.add(log)
    db_session.flush()
    return log.id


def _remaining(db_session, org_id) -> set[int]:
    return set(db_session.scalars(select(Log.id).where(Log.org_id == org_id)).all())


def test_deletes_only_logs_older_than_retention(db_session):
    org_id = _make_org(db_session)
    old = _make_log(db_session, org_id, timedelta(days=3))
    fresh = _make_log(db_session, org_id, timedelta(hours=1))

    purge_old_logs(db_session, retention_days=2, org_id=org_id)

    assert _remaining(db_session, org_id) == {fresh}
    assert old not in _remaining(db_session, org_id)


def test_keeps_old_logs_referenced_by_an_alert(db_session):
    org_id = _make_org(db_session)
    evidence = _make_log(db_session, org_id, timedelta(days=10))
    db_session.add(Alert(org_id=org_id, log_id=evidence, severity=Severity.HIGH, status=AlertStatus.OPEN, title="t"))
    db_session.flush()

    purge_old_logs(db_session, retention_days=2, org_id=org_id)

    assert _remaining(db_session, org_id) == {evidence}


def test_purges_across_multiple_batches(db_session):
    org_id = _make_org(db_session)
    for _ in range(5):
        _make_log(db_session, org_id, timedelta(days=5))
    keep = _make_log(db_session, org_id, timedelta(minutes=5))

    purge_old_logs(db_session, retention_days=2, batch_size=2, org_id=org_id)

    assert _remaining(db_session, org_id) == {keep}
