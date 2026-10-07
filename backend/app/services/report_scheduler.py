import logging
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models.org import Org
from app.models.report import Report
from app.services import report_service

logger = logging.getLogger(__name__)

SchedulePeriod = Literal["daily", "weekly", "monthly"]


def _already_generated_today(db, org_id, report_type: SchedulePeriod, ref_date: date) -> bool:
    # generate_report always sets period_end == ref_date (see
    # report_service._period_bounds) — reusing that as the idempotency key
    # avoids duplicating the per-type window math here, and means a
    # scheduler restart or an overlapping manual "Create report" click on
    # the same day doesn't produce a duplicate row in the Library.
    return (
        db.scalar(
            select(Report.id).where(
                Report.org_id == org_id,
                Report.type == report_type,
                Report.period_end == ref_date,
            )
        )
        is not None
    )


def run_scheduled_reports(report_type: SchedulePeriod) -> None:
    """Generates one `report_type` report for every org, unconditionally.

    Called by APScheduler on a cron trigger (see app.main's lifespan). Every
    org gets a report auto-saved to its Library regardless of whether it has
    a ReportSchedule row configured — ReportSchedule continues to control
    only the *email delivery* side (report_service._deliver_to_matching_
    schedules, unchanged), not whether generation happens at all. Runs with
    its own fresh session since there's no request to hang a Depends(get_db)
    off of here.
    """
    # The job fires just after midnight UTC, so the period that just *closed*
    # ends yesterday -- using today would make every daily report cover only
    # the first ~15 minutes of the new day.
    ref_date = datetime.now(UTC).date() - timedelta(days=1)
    db = SessionLocal()
    try:
        org_ids = db.scalars(select(Org.id)).all()
        generated = 0
        for org_id in org_ids:
            if _already_generated_today(db, org_id, report_type, ref_date):
                continue
            try:
                report_service.generate_report(db, org_id, report_type, ref_date)
                generated += 1
            except Exception:
                # One org's failure (e.g. a transient DB hiccup) shouldn't
                # stop the rest of the org list from getting their report.
                db.rollback()
                logger.exception("[SCHEDULED REPORT] failed to generate %s report for org %s", report_type, org_id)
        logger.info(
            "[SCHEDULED REPORT] %s run: generated %d of %d org(s) (rest already had one for %s)",
            report_type,
            generated,
            len(org_ids),
            ref_date,
        )
    finally:
        db.close()
