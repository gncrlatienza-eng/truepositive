from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.org import Org
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, SignupRequest
from app.utils.security import create_access_token, hash_password, verify_password


def signup(db: Session, payload: SignupRequest) -> tuple[str, User, Org]:
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    if db.scalar(select(Org).where(Org.slug == payload.workspace_slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "That workspace slug is already taken")

    org = Org(name=payload.org_name, slug=payload.workspace_slug, team_size=payload.team_size)
    db.add(org)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That workspace slug is already taken") from exc

    user = User(
        org_id=org.id,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists") from exc
    db.refresh(user)
    db.refresh(org)

    token = create_access_token(subject=str(user.id))
    return token, user, org


def login(db: Session, payload: LoginRequest) -> tuple[str, User, Org]:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise unauthorized

    org = db.get(Org, user.org_id)
    assert org is not None, "user.org_id is a non-nullable FK — the org must exist"
    token = create_access_token(subject=str(user.id))
    return token, user, org
