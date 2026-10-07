import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, exists, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import SessionLocal
from app.models.alert import Alert
from app.models.log import Log

logger = logging.getLogger(__name__)

# Small batches keep each DELETE's row locks short so agent ingestion
# isn't stalled behind one long purge transaction.
_BATCH_SIZE = 5000


def purge_old_logs(
    db: Session, retention_days: int, batch_size: int = _BATCH_SIZE, org_id: uuid.UUID | None = None
) -> int:
    """Deletes raw logs older than `retention_days`, returning how many went.

    Logs an alert points at are kept regardless of age: alerts.log_id has no
    ON DELETE rule, and the alert's evidence should outlive the raw firehose.
    Uses Log.timestamp (indexed) rather than created_at, which has no index.
    `org_id` narrows the purge to one org (the scheduled job passes none).
    """
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    referenced = exists(select(Alert.id).where(Alert.log_id == Log.id))
    conditions = [Log.timestamp < cutoff, ~referenced]
    if org_id is not None:
        conditions.append(Log.org_id == org_id)
    total = 0
    while True:
        ids = select(Log.id).where(*conditions).limit(batch_size).scalar_subquery()
        deleted = db.execute(delete(Log).where(Log.id.in_(ids))).rowcount
        db.commit()
        total += deleted
        if deleted < batch_size:
            return total


def run_log_retention() -> None:
    """APScheduler entry point (see app.main's lifespan); opens its own session."""
    db = SessionLocal()
    try:
        deleted = purge_old_logs(db, settings.log_retention_days)
        logger.info("[LOG RETENTION] deleted %d log(s) older than %d day(s)", deleted, settings.log_retention_days)
    except Exception:
        db.rollback()
        logger.exception("[LOG RETENTION] purge failed")
    finally:
        db.close()
