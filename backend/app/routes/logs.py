import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.common import Severity
from app.models.log_source import LogSourceStatus
from app.models.user import User
from app.schemas.log_sources import LogSourceCreate, LogSourceOut, LogSourceUpdate
from app.schemas.logs import LogListResponse, LogOut, SortOrder
from app.services import log_service, log_source_service
from app.utils.security import get_current_user

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/ping")
def ping():
    return {"router": "logs", "status": "ok"}


# Log sources are a sub-collection of /logs. Sprint 5's future single-log
# lookup must be typed `GET /logs/{log_id:int}` (Log.id is a BigInteger) so
# it can never swallow the literal `/logs/sources` path below it.
@router.post("/sources", response_model=LogSourceOut, status_code=status.HTTP_201_CREATED)
def create_source(
    payload: LogSourceCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    source = log_source_service.create_log_source(db, current_user.org_id, payload)
    return LogSourceOut.from_model(source)


@router.get("/sources", response_model=list[LogSourceOut])
def list_sources(
    status: LogSourceStatus | None = None,
    agent_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sources = log_source_service.list_log_sources(db, current_user.org_id, status_filter=status, agent_id=agent_id)
    return [LogSourceOut.from_model(s) for s in sources]


@router.get("/sources/{source_id}", response_model=LogSourceOut)
def get_source(source_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    source = log_source_service.get_log_source(db, current_user.org_id, source_id)
    return LogSourceOut.from_model(source)


@router.patch("/sources/{source_id}", response_model=LogSourceOut)
def update_source(
    source_id: uuid.UUID,
    payload: LogSourceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source = log_source_service.update_log_source(db, current_user.org_id, source_id, payload)
    return LogSourceOut.from_model(source)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(source_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log_source_service.delete_log_source(db, current_user.org_id, source_id)


def _log_filters(
    q: str | None,
    source_id: uuid.UUID | None,
    severity: Severity | None,
    event_type: str | None,
    since: datetime | None,
    until: datetime | None,
) -> dict:
    return {
        "q": q,
        "source_id": source_id,
        "severity": severity,
        "event_type": event_type,
        "since": since,
        "until": until,
    }


@router.get("", response_model=LogListResponse)
def list_logs(
    q: str | None = None,
    source_id: uuid.UUID | None = None,
    severity: Severity | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    sort: SortOrder = "timestamp_desc",
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logs, total = log_service.list_logs(
        db,
        current_user.org_id,
        **_log_filters(q, source_id, severity, event_type, since, until),
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return LogListResponse(items=[LogOut.model_validate(log) for log in logs], total=total, limit=limit, offset=offset)


# Literal path, registered ahead of the typed {log_id:int} lookup below —
# same discipline as /sources above, even though "export.csv" could never
# actually parse as an int anyway.
@router.get("/export.csv")
def export_logs(
    q: str | None = None,
    source_id: uuid.UUID | None = None,
    severity: Severity | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    csv_text = log_service.export_logs_csv(
        db, current_user.org_id, **_log_filters(q, source_id, severity, event_type, since, until)
    )
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="logs_export.csv"'},
    )


@router.get("/{log_id:int}", response_model=LogOut)
def get_log(log_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return LogOut.model_validate(log_service.get_log(db, current_user.org_id, log_id))
