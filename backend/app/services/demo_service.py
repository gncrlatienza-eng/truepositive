"""The public read-only demo: one shared org with sample data, refreshed
nightly, that anyone can open from the landing page without signing up.

Off unless DEMO_ENABLED is set. Writes are blocked for the demo user in
utils/security.get_current_user, and its sample agents don't count toward
MAX_AGENTS (agent_service.agents_in_use).
"""

import logging
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import SessionLocal
from app.demo import DEMO_DATA_DAYS, DEMO_EMAIL, DEMO_ORG_NAME, DEMO_ORG_SLUG
from app.models.org import Org
from app.models.user import User, UserRole
from app.services.sample_data import seed_sample_data
from app.utils.security import hash_password

logger = logging.getLogger(__name__)


class DemoUnavailableError(Exception):
    pass


def ensure_demo_account(db: Session) -> tuple[User, Org, bool]:
    """Returns the demo user and org, creating them if needed. The bool says
    whether they were just created (and so have no sample data yet)."""
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is not None:
        org = db.get(Org, user.org_id)
        assert org is not None, "user.org_id is a non-nullable FK — the org must exist"
        return user, org, False

    if db.scalar(select(Org).where(Org.slug == DEMO_ORG_SLUG)) is not None:
        # A real workspace already owns the slug; never adopt someone's org.
        raise DemoUnavailableError(f"workspace slug {DEMO_ORG_SLUG!r} belongs to a real org")

    org = Org(name=DEMO_ORG_NAME, slug=DEMO_ORG_SLUG, team_size="1-10")
    db.add(org)
    db.flush()
    user = User(
        org_id=org.id,
        email=DEMO_EMAIL,
        full_name="Demo Analyst",
        # Random and discarded: the demo is only reachable via POST /auth/demo.
        password_hash=hash_password(secrets.token_urlsafe(32)),
        role=UserRole.ANALYST,
    )
    db.add(user)
    db.flush()
    return user, org, True


def refresh_demo_data() -> None:
    """Scheduler entry point: (re)creates the demo account and its sample data."""
    if not settings.demo_enabled:
        return
    db = SessionLocal()
    try:
        _user, org, _created = ensure_demo_account(db)
        counts = seed_sample_data(db, org.id, days_back=DEMO_DATA_DAYS)
        db.commit()
        logger.info("[DEMO] refreshed sample data: %s", counts)
    except DemoUnavailableError as exc:
        db.rollback()
        logger.error("[DEMO] demo disabled: %s", exc)
    except Exception:
        db.rollback()
        logger.exception("[DEMO] refresh failed")
    finally:
        db.close()
