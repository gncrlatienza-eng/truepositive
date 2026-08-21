from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.org import Org
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, MeResponse, OrgOut, SignupRequest, UserOut
from app.services import auth_service
from app.utils.rate_limit import rate_limit
from app.utils.security import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/ping")
def ping():
    return {"router": "auth", "status": "ok"}


# Per-IP: bounds automated org-creation spam without punishing a real team
# signing up multiple accounts from one office/NAT in a burst.
@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("signup", limit=5, window_seconds=60))],
)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    token, user, org = auth_service.signup(db, payload)
    return AuthResponse(access_token=token, user=UserOut.model_validate(user), org=OrgOut.model_validate(org))


# Per-IP: closes credential-stuffing/brute-force against real accounts --
# previously unlimited, meaning an attacker could try passwords as fast as
# the network allowed against any known email.
@router.post(
    "/login", response_model=AuthResponse, dependencies=[Depends(rate_limit("login", limit=10, window_seconds=60))]
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    token, user, org = auth_service.login(db, payload)
    return AuthResponse(access_token=token, user=UserOut.model_validate(user), org=OrgOut.model_validate(org))


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Org, current_user.org_id)
    return MeResponse(user=UserOut.model_validate(current_user), org=OrgOut.model_validate(org))
