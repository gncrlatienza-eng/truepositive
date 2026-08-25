"""Tests for report_scheduler's idempotency check.

run_scheduled_reports itself opens its own SessionLocal() (it has no request
to hang a Depends(get_db) off of, see the module docstring) — a real
separate DB connection from this test suite's rolled-back-transaction
db_session fixture, so it can't see data the fixture creates. _already_
generated_today takes `db` as a plain argument instead, so it's tested
directly against the fixture's own session here.
"""

import uuid
from datetime import date, timedelta

from app.models.org import Org
from app.services import report_service
from app.services.report_scheduler import _already_generated_today


def _make_org(db_session) -> uuid.UUID:
    org = Org(name="Scheduler Test Org", slug=f"sched-{uuid.uuid4().hex[:8]}")
    db_session.add(org)
    db_session.flush()
    return org.id


def test_not_generated_yet_for_a_fresh_org(db_session):
    org_id = _make_org(db_session)
    assert _already_generated_today(db_session, org_id, "daily", date.today()) is False


def test_true_after_generate_report_for_same_type_and_day(db_session):
    org_id = _make_org(db_session)
    ref_date = date.today()
    report_service.generate_report(db_session, org_id, "daily", ref_date)
    assert _already_generated_today(db_session, org_id, "daily", ref_date) is True


def test_different_report_type_is_not_conflated(db_session):
    org_id = _make_org(db_session)
    ref_date = date.today()
    report_service.generate_report(db_session, org_id, "daily", ref_date)
    # A weekly report for the same org/day is a distinct type — must not be
    # skipped just because a daily one already exists for this ref_date.
    assert _already_generated_today(db_session, org_id, "weekly", ref_date) is False


def test_different_org_is_not_conflated(db_session):
    org_a = _make_org(db_session)
    org_b = _make_org(db_session)
    ref_date = date.today()
    report_service.generate_report(db_session, org_a, "daily", ref_date)
    assert _already_generated_today(db_session, org_b, "daily", ref_date) is False


def test_yesterdays_report_does_not_count_for_today(db_session):
    org_id = _make_org(db_session)
    yesterday = date.today() - timedelta(days=1)
    report_service.generate_report(db_session, org_id, "daily", yesterday)
    assert _already_generated_today(db_session, org_id, "daily", date.today()) is False
