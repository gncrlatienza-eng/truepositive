import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.schemas.playbooks import PlaybookCreate, PlaybookOut, PlaybookUpdate
from app.services import playbook_service
from app.utils.security import get_current_user

router = APIRouter(prefix="/playbooks", tags=["playbooks"])


@router.get("/ping")
def ping():
    return {"router": "playbooks", "status": "ok"}


@router.get("", response_model=list[PlaybookOut])
def list_playbooks(
    enabled: bool | None = None,
    q: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return playbook_service.list_playbooks(db, current_user.org_id, enabled=enabled, q=q)


@router.post("", response_model=PlaybookOut, status_code=status.HTTP_201_CREATED)
def create_playbook(
    payload: PlaybookCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return playbook_service.create_playbook(db, current_user.org_id, payload)


@router.get("/{playbook_id}", response_model=PlaybookOut)
def get_playbook(
    playbook_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return playbook_service.get_playbook(db, current_user.org_id, playbook_id)


@router.patch("/{playbook_id}", response_model=PlaybookOut)
def update_playbook(
    playbook_id: uuid.UUID,
    payload: PlaybookUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return playbook_service.update_playbook(db, current_user.org_id, playbook_id, payload)


@router.delete("/{playbook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playbook(
    playbook_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    playbook_service.delete_playbook(db, current_user.org_id, playbook_id)
