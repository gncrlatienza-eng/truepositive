import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.common import Severity


# Deliberately small and structured rather than accepting arbitrary JSONB —
# the rule engine (log_service._rule_matches) only ever understands these two
# keys, so letting the schema accept more would silently create rules that
# can never fire.
class AlertRuleConditions(BaseModel):
    event_type: str | None = Field(default=None, max_length=100)
    min_severity: Severity | None = None


class AlertRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    conditions: AlertRuleConditions = Field(default_factory=AlertRuleConditions)
    severity: Severity
    enabled: bool = True


class AlertRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    conditions: AlertRuleConditions | None = None
    severity: Severity | None = None
    enabled: bool | None = None


class AlertRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    conditions: dict
    severity: Severity
    enabled: bool
    created_at: datetime
