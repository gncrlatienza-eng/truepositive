import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.schemas.reports import (
    ReportListItem,
    ReportListResponse,
    ReportOut,
    ReportQuickStats,
    ReportScheduleCreate,
    ReportScheduleOut,
)
from app.services import report_service
from app.services.report_service import GeneratableType
from app.utils.security import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/ping")
def ping():
    return {"router": "reports", "status": "ok"}


# Literal routes must be declared before "/{report_id}" so "schedules" and
# "generate" aren't swallowed as a UUID path param — same ordering
# requirement this codebase already follows in routes/logs.py and
# routes/alerts.py.


@router.get("/generate", response_model=ReportOut)
def generate(
    type: GeneratableType,
    date: date | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ref_date = date or datetime.now(UTC).date()
    return report_service.generate_report(
        db,
        current_user.org_id,
        type,
        ref_date,
        current_user.id,
        period_start=period_start,
        period_end=period_end,
    )


@router.get("/stats", response_model=ReportQuickStats)
def get_quick_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return report_service.get_quick_stats(db, current_user.org_id)


@router.get("/schedules", response_model=list[ReportScheduleOut])
def list_schedules(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return report_service.list_schedules(db, current_user.org_id)


@router.post("/schedules", response_model=ReportScheduleOut, status_code=status.HTTP_201_CREATED)
def create_schedule(
    payload: ReportScheduleCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return report_service.create_schedule(db, current_user.org_id, payload)


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    report_service.delete_schedule(db, current_user.org_id, schedule_id)


@router.get("", response_model=ReportListResponse)
def list_reports(
    type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = report_service.list_reports(db, current_user.org_id, report_type=type, limit=limit, offset=offset)

    creator_ids = {r.created_by for r in items if r.created_by}
    emails = (
        {u.id: u.email for u in db.scalars(select(User).where(User.id.in_(creator_ids))).all()} if creator_ids else {}
    )
    return ReportListResponse(
        items=[ReportListItem.from_model(r, emails.get(r.created_by) if r.created_by else None) for r in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return report_service.get_report(db, current_user.org_id, report_id)


@router.get("/{report_id}/export.csv")
def export_report_csv(
    report_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    csv_text = report_service.export_report_csv(db, current_user.org_id, report_id)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="report_{report_id}.csv"'},
    )


@router.get("/{report_id}/export.pdf")
def export_report_pdf(
    report_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    pdf_bytes = report_service.export_report_pdf(db, current_user.org_id, report_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="report_{report_id}.pdf"'},
    )
