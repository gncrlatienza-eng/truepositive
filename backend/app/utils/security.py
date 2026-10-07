import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import get_db
from app.models.agent import Agent, AgentStatus
from app.models.user import User

_bearer_scheme = HTTPBearer(auto_error=False)
_agent_key_scheme = APIKeyHeader(name="X-Agent-Key", auto_error=False)

JWT_ALGORITHM = "HS256"

# Verified against when an agent id doesn't exist, so an unknown id costs the
# same bcrypt time as a wrong key -- otherwise response timing alone reveals
# which agent ids are valid, defeating the identical-401 below.
_DUMMY_KEY_HASH = bcrypt.hashpw(b"tp-dummy-agent-key", bcrypt.gensalt()).decode("utf-8")


def _password_bytes(password: str) -> bytes:
    # bcrypt silently ignores/rejects input past 72 bytes; truncate explicitly so
    # hash and verify always agree on what was actually hashed.
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(_password_bytes(password), password_hash.encode("utf-8"))


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes or settings.jwt_expire_minutes)
    return jwt.encode({"sub": subject, "exp": expire}, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    if credentials is None:
        raise unauthorized

    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise unauthorized from exc

    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


def generate_agent_key() -> str:
    return f"tpa_{secrets.token_urlsafe(32)}"


def enrollment_expired(agent: Agent) -> bool:
    return (
        agent.status == AgentStatus.PENDING
        and agent.enrollment_expires_at is not None
        and datetime.now(UTC) > agent.enrollment_expires_at
    )


def get_current_agent(
    agent_id: uuid.UUID,
    agent_key: str | None = Depends(_agent_key_scheme),
    db: Session = Depends(get_db),
) -> Agent:
    # Deliberately the same 401 whether the agent doesn't exist or the key is
    # wrong — distinguishing the two would leak which agent IDs are valid.
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    if agent_key is None:
        raise unauthorized

    agent = db.get(Agent, agent_id)
    if agent is None:
        verify_password(agent_key, _DUMMY_KEY_HASH)
        raise unauthorized
    if not verify_password(agent_key, agent.agent_key_hash):
        raise unauthorized
    if enrollment_expired(agent):
        # Checked here, not only in register_agent: a still-pending agent's
        # key must stop working for *every* agent endpoint once its 24h
        # enrollment window closes -- otherwise a leaked-but-expired key could
        # skip /register and flip the agent to connected via /heartbeat.
        raise HTTPException(status.HTTP_410_GONE, "Enrollment key has expired — generate new credentials")
    if agent.relay_parent_agent_id is not None:
        # A relay child must never authenticate directly against the
        # internet-facing backend -- this is what actually enforces the
        # "full isolation" design invariant (relay_service.py's own
        # docstring: "a relay child never talks to the internet-facing
        # backend directly"), which before this check was only a client-side
        # convention (the agent binary's own choice of which URL to call),
        # not something the server verified. Its only legitimate path in is
        # via its hub's authenticated POST .../relay-proxy call. Never
        # rejects a hub itself here -- a hub's own relay_parent_agent_id is
        # always None (relay_service._require_hub already forbids chaining).
        raise unauthorized
    return agent
