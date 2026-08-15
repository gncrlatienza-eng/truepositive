import uuid

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.alert_rule import AlertRule
from app.schemas.alert_rules import AlertRuleCreate, AlertRuleUpdate


def create_rule(db: Session, org_id: uuid.UUID, payload: AlertRuleCreate) -> AlertRule:
    rule = AlertRule(
        org_id=org_id,
        name=payload.name,
        description=payload.description,
        conditions=payload.conditions.model_dump(exclude_none=True),
        severity=payload.severity,
        enabled=payload.enabled,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def list_rules(db: Session, org_id: uuid.UUID, *, enabled: bool | None = None, q: str | None = None) -> list[AlertRule]:
    stmt = select(AlertRule).where(AlertRule.org_id == org_id)
    if enabled is not None:
        stmt = stmt.where(AlertRule.enabled == enabled)
    if q:
        stmt = stmt.where(AlertRule.name.ilike(f"%{q}%"))
    return list(db.scalars(stmt.order_by(AlertRule.created_at.desc())).all())


def get_rule(db: Session, org_id: uuid.UUID, rule_id: uuid.UUID) -> AlertRule:
    rule = db.scalar(select(AlertRule).where(AlertRule.id == rule_id, AlertRule.org_id == org_id))
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert rule not found")
    return rule


def update_rule(db: Session, org_id: uuid.UUID, rule_id: uuid.UUID, payload: AlertRuleUpdate) -> AlertRule:
    rule = get_rule(db, org_id, rule_id)
    data = payload.model_dump(exclude_unset=True)
    if "conditions" in data:
        if payload.conditions is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "conditions cannot be cleared — omit it to leave unchanged"
            )
        data["conditions"] = payload.conditions.model_dump(exclude_none=True)
    for field, value in data.items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


def delete_rule(db: Session, org_id: uuid.UUID, rule_id: uuid.UUID) -> None:
    rule = get_rule(db, org_id, rule_id)
    # Detach rather than block/cascade: an alert a rule already produced is
    # worth keeping even after the rule that generated it is deleted — same
    # philosophy as agent_service.delete_agent detaching log_sources.
    db.execute(update(Alert).where(Alert.rule_id == rule.id).values(rule_id=None))
    db.delete(rule)
    db.commit()
