import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.common import Severity


# Deliberately small and structured rather than accepting arbitrary JSONB —
# the rule engine (log_service._rule_matches) only understands these three
# keys, so letting the schema accept more would silently create rules that
# can never fire. message_contains (Sprint 8): a substring match against the
# raw log message — backs "Create Alert Rule" from the Threat Intel page,
# where the condition is really "fire when this indicator's value shows up
# in a log line," which event_type/min_severity alone can't express.
class AlertRuleConditions(BaseModel):
    event_type: str | None = Field(default=None, max_length=100)
    min_severity: Severity | None = None
    message_contains: str | None = Field(default=None, max_length=255)


class AlertRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    conditions: AlertRuleConditions = Field(default_factory=AlertRuleConditions)
    severity: Severity
    enabled: bool = True
    mitre_technique: str | None = Field(default=None, max_length=200)


class AlertRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    conditions: AlertRuleConditions | None = None
    severity: Severity | None = None
    enabled: bool | None = None
    mitre_technique: str | None = Field(default=None, max_length=200)


class AlertRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    conditions: dict
    severity: Severity
    enabled: bool
    mitre_technique: str | None
    created_at: datetime
