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
from app.models.agent import Agent
from app.models.user import User

_bearer_scheme = HTTPBearer(auto_error=False)
_agent_key_scheme = APIKeyHeader(name="X-Agent-Key", auto_error=False)

JWT_ALGORITHM = "HS256"


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
    if agent is None or not verify_password(agent_key, agent.agent_key_hash):
        raise unauthorized
    return agent
