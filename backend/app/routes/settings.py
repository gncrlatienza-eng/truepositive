import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.models.whitelist_entry import WhitelistType
from app.schemas.whitelist import EffectiveWhitelistResponse, WhitelistEntryCreate, WhitelistEntryOut
from app.services import whitelist_service
from app.utils.security import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/ping")
def ping():
    return {"router": "settings", "status": "ok"}


@router.post("/whitelist", response_model=WhitelistEntryOut, status_code=status.HTTP_201_CREATED)
def create_whitelist_entry(
    payload: WhitelistEntryCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    entry = whitelist_service.create_entry(db, current_user.org_id, current_user.id, payload)
    return WhitelistEntryOut.from_model(entry, current_user.email)


@router.get("/whitelist", response_model=list[WhitelistEntryOut])
def list_whitelist(
    type: WhitelistType | None = None,
    q: str | None = None,
    include_expired: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = whitelist_service.list_entries(
        db, current_user.org_id, type_filter=type, query=q, include_expired=include_expired
    )
    creator_ids = {entry.created_by for entry in entries}
    emails = (
        {user.id: user.email for user in db.scalars(select(User).where(User.id.in_(creator_ids))).all()}
        if creator_ids
        else {}
    )
    return [WhitelistEntryOut.from_model(entry, emails.get(entry.created_by, "")) for entry in entries]


@router.get("/whitelist/effective", response_model=EffectiveWhitelistResponse)
def effective_whitelist(
    type: WhitelistType, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    values = whitelist_service.effective_values(db, current_user.org_id, type)
    return EffectiveWhitelistResponse(type=type, values=values)


@router.delete("/whitelist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_whitelist_entry(
    entry_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    whitelist_service.delete_entry(db, current_user.org_id, entry_id)
