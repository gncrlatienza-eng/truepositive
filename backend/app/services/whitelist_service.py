import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models.whitelist_entry import WhitelistEntry, WhitelistType
from app.schemas.whitelist import WhitelistEntryCreate


def create_entry(
    db: Session, org_id: uuid.UUID, created_by: uuid.UUID, payload: WhitelistEntryCreate
) -> WhitelistEntry:
    entry = WhitelistEntry(
        org_id=org_id,
        type=payload.type,
        value=payload.value,
        reason=payload.reason,
        expires_at=payload.expires_at,
        created_by=created_by,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This value is already whitelisted for your org") from exc
    db.refresh(entry)
    return entry


def list_entries(
    db: Session,
    org_id: uuid.UUID,
    type_filter: WhitelistType | None = None,
    query: str | None = None,
    include_expired: bool = False,
) -> list[WhitelistEntry]:
    stmt = select(WhitelistEntry).where(WhitelistEntry.org_id == org_id)
    if type_filter is not None:
        stmt = stmt.where(WhitelistEntry.type == type_filter)
    if query:
        stmt = stmt.where(WhitelistEntry.value.ilike(f"%{query}%"))
    if not include_expired:
        stmt = stmt.where((WhitelistEntry.expires_at.is_(None)) | (WhitelistEntry.expires_at > datetime.now(UTC)))
    stmt = stmt.order_by(WhitelistEntry.created_at.desc())
    return list(db.scalars(stmt).all())


def get_entry(db: Session, org_id: uuid.UUID, entry_id: uuid.UUID) -> WhitelistEntry:
    entry = db.scalar(select(WhitelistEntry).where(WhitelistEntry.id == entry_id, WhitelistEntry.org_id == org_id))
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Whitelist entry not found")
    return entry


def delete_entry(db: Session, org_id: uuid.UUID, entry_id: uuid.UUID) -> None:
    entry = get_entry(db, org_id, entry_id)
    db.delete(entry)
    db.commit()


def effective_values(db: Session, org_id: uuid.UUID, type_filter: WhitelistType) -> list[str]:
    stmt = select(WhitelistEntry.value).where(
        WhitelistEntry.org_id == org_id,
        WhitelistEntry.type == type_filter,
        (WhitelistEntry.expires_at.is_(None)) | (WhitelistEntry.expires_at > datetime.now(UTC)),
    )
    return list(db.scalars(stmt).all())


def active_values_subquery(org_id: uuid.UUID, type_filter: WhitelistType):
    return (
        select(WhitelistEntry.value)
        .where(
            WhitelistEntry.org_id == org_id,
            WhitelistEntry.type == type_filter,
            (WhitelistEntry.expires_at.is_(None)) | (WhitelistEntry.expires_at > datetime.now(UTC)),
        )
        .scalar_subquery()
    )


def exclude_whitelisted(stmt: Select, column: ColumnElement, org_id: uuid.UUID, type_filter: WhitelistType) -> Select:
    """Reusable query-layer filter: drops rows whose `column` matches an
    active (non-expired) whitelist entry of `type_filter` for this org.
    Meant to be dropped into Sprint 5's log/alert list queries — this sprint
    only builds the filter and proves it works (see tests/test_whitelist.py),
    since no log/alert list endpoint exists yet."""
    return stmt.where(column.notin_(active_values_subquery(org_id, type_filter)))
