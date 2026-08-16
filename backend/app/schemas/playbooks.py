import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.common import Severity


class PlaybookTrigger(BaseModel):
    """Structured trigger — only the keys the evaluator actually understands.

    Mirrors AlertRuleConditions exactly so the same _rule_matches helper can
    be reused without a separate matcher: event_type exact-match and/or a
    minimum-severity threshold. Keeping this structured (not free-form JSONB)
    means "the UI can't build a trigger the backend can't evaluate" — the same
    principle that governs AlertRuleConditions in schemas/alert_rules.py.
    """

    event_type: str | None = Field(default=None, max_length=100)
    min_severity: Severity | None = None


class PlaybookActions(BaseModel):
    """Fixed-key action flags.

    auto_create_incident: real — creates an Incident and links the triggering alert.
    block_ip / disable_account / slack_notify: stubs — log a [PLAYBOOK ACTION]
    line to stdlib logging so the action is auditable without a real integration.
    """

    block_ip: bool = False
    disable_account: bool = False
    slack_notify: bool = False
    auto_create_incident: bool = False


class PlaybookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    trigger: PlaybookTrigger = Field(default_factory=PlaybookTrigger)
    actions: PlaybookActions = Field(default_factory=PlaybookActions)
    enabled: bool = True


class PlaybookUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    trigger: PlaybookTrigger | None = None
    actions: PlaybookActions | None = None
    enabled: bool | None = None


class PlaybookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    # Stored as JSONB dicts; serialised back to the client as-is.
    trigger_conditions: dict
    actions: dict
    enabled: bool
    created_at: datetime
    updated_at: datetime
