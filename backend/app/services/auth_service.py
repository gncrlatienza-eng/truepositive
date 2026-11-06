import hmac

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.demo import DEMO_DATA_DAYS, DEMO_ORG_SLUG
from app.models.org import Org
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, SignupRequest
from app.services import agent_service
from app.utils.security import create_access_token, hash_password, verify_password


def signup(db: Session, payload: SignupRequest) -> tuple[str, User, Org]:
    # Checked before any lookup so a wrong/missing code never reveals
    # whether an email or slug is already taken. Only enforced once an admin
    # has actually set SIGNUP_INVITE_CODE (public-deployment opt-in) — the
    # existing per-IP signup rate limit (5/min, see routes/auth.py) already
    # bounds brute-forcing the code itself.
    if settings.signup_invite_required and not hmac.compare_digest(
        (payload.invite_code or "").encode(), (settings.signup_invite_code or "").encode()
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid invite code")

    # A new account can't add a device on a full server, so turn people away
    # here rather than after they've set up a workspace they can't use.
    if agent_service.server_full(db):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, agent_service.SERVER_FULL_DETAIL)

    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    if payload.workspace_slug == DEMO_ORG_SLUG or db.scalar(select(Org).where(Org.slug == payload.workspace_slug)):
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


def demo_login(db: Session) -> tuple[str, User, Org]:
    """Signs in as the shared read-only demo user, creating it (with sample
    data) on first use so the demo works before the first nightly refresh."""
    from app.services import demo_service
    from app.services.sample_data import seed_sample_data

    if not settings.demo_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The demo isn't available on this server")
    try:
        user, org, created = demo_service.ensure_demo_account(db)
    except demo_service.DemoUnavailableError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The demo isn't available on this server") from exc
    if created:
        seed_sample_data(db, org.id, days_back=DEMO_DATA_DAYS)
        db.commit()
    # Short-lived: a shared account shouldn't hand out month-long tokens.
    token = create_access_token(subject=str(user.id), expires_minutes=120)
    return token, user, org
