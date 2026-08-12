import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.log_source import LogSourceStatus
from app.models.user import User
from app.schemas.log_sources import LogSourceCreate, LogSourceOut, LogSourceUpdate
from app.services import log_source_service
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
