import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.report import Report, ReportType


class ReportScheduleCreate(BaseModel):
    report_type: str = Field(pattern="^(daily|weekly|monthly)$")
    frequency: str = Field(pattern="^(daily|weekly|monthly)$")
    email: str = Field(min_length=3, max_length=320)


class ReportScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    report_type: str
    frequency: str
    email: str
    enabled: bool
    created_at: datetime


class ReportListItem(BaseModel):
    id: uuid.UUID
    type: ReportType
    period_start: date
    period_end: date
    generated_at: datetime
    owner_email: str | None
    # Included so the Library/Recent-reports rows can build a real one-line
    # summary ("838 events · 0 alerts") from whatever fields that report
    # type actually has, rather than the backend guessing a single format
    # that fits every type.
    data: dict

    @classmethod
    def from_model(cls, report: Report, owner_email: str | None) -> "ReportListItem":
        return cls(
            id=report.id,
            type=report.type,
            period_start=report.period_start,
            period_end=report.period_end,
            generated_at=report.generated_at,
            owner_email=owner_email,
            data=report.data,
        )


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: ReportType
    period_start: date
    period_end: date
    data: dict
    generated_at: datetime


class ReportListResponse(BaseModel):
    items: list[ReportListItem]
    total: int
    limit: int
    offset: int


class ReportQuickStats(BaseModel):
    # No "next scheduled run" field -- there is no real scheduler (see
    # report_service.get_quick_stats docstring), so the frontend shows
    # honest static copy for that tile instead of a fabricated timestamp.
    reports_this_month: int
    active_schedules: int
    last_export_at: datetime | None
